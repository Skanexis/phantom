/**
 * Sorveglianza: cosa arriva al sito, da dove, e cosa è stato respinto.
 *
 * Tutto vive in memoria, di proposito. Scrivere ogni evento a database
 * sarebbe la scelta sbagliata proprio nel momento in cui serve: sotto un
 * flusso di richieste ostili, un INSERT per richiesta trasforma un
 * fastidio in un fermo del servizio, e l'attaccante otterrebbe il
 * risultato passando dalla porta che gli abbiamo aperto noi. Qui invece il
 * costo per evento è un push su un array già dimensionato.
 *
 * Il prezzo è che un riavvio azzera lo storico. È accettabile: questo è un
 * quadro di ciò che sta accadendo adesso, non un archivio. Gli eventi che
 * meritano di sopravvivere (una richiesta creata, un ruolo cambiato) sono
 * già righe a database per conto loro.
 *
 * Lo stato sta su globalThis e non in un modulo, perché il proxy e le
 * rotte vengono compilati in bundle distinti: due `const mappa = new Map()`
 * sarebbero due mappe diverse, e il pannello mostrerebbe metà del quadro.
 * Con il proxy in runtime Node il processo è lo stesso, quindi globalThis
 * è condiviso davvero — verificato, non supposto.
 *
 * ---
 *
 * Sulle dimensioni. Ogni struttura qui dentro ha un tetto, e il tetto non
 * è una precauzione teorica: senza, il modo più comodo per far cadere il
 * sito sarebbe proprio bussare tante volte da riempire la memoria del
 * sistema che osserva. Vale anche per il costo in tempo — le operazioni
 * sul percorso caldo (una richiesta qualunque, un evento durante una
 * raffica) sono a costo costante, mai proporzionale a quanto è già
 * successo, altrimenti l'attacco rallenta il server nel misurarlo.
 */

export type TipoEvento =
  /** Percorso da scanner: /.env, /wp-admin, /phpmyadmin. */
  | "sonda"
  /**
   * URL con una firma d'attacco: risalita di directory, frammento SQL,
   * markup. Non è un pericolo — Prisma parametrizza e React scrive testo —
   * ma dice che qualcuno sta sondando invece di navigare.
   */
  | "iniezione"
  /** Scrittura sull'API senza Origin valido: non è un browser sul sito. */
  | "origine"
  /** Tetto di richieste per IP superato. */
  | "frequenza"
  /** Tetto per utente superato su una rotta specifica. */
  | "frequenza_utente"
  /** Password del cantiere sbagliata. */
  | "gate"
  /** Webhook chiamato senza il segreto giusto. */
  | "webhook"
  /** Troppe connessioni SSE aperte dallo stesso account. */
  | "flussi"
  /** Tentativo di raggiungere un'area riservata senza averne diritto. */
  | "accesso"
  /** Richiesta rifiutata perché l'IP è in quarantena. */
  | "quarantena";

export const TIPI_EVENTO: TipoEvento[] = [
  "webhook",
  "gate",
  "accesso",
  "iniezione",
  "origine",
  "frequenza_utente",
  "flussi",
  "quarantena",
  "frequenza",
  "sonda",
];

export type EventoSicurezza = {
  id: number;
  quando: number;
  tipo: TipoEvento;
  ip: string;
  metodo: string;
  percorso: string;
  agente: string;
  /** Contesto libero: quale utente, quale limite, quale rotta. */
  dettaglio?: string;
};

export type SchedaIp = {
  ip: string;
  richieste: number;
  bloccate: number;
  primoVisto: number;
  ultimoVisto: number;
  ultimoPercorso: string;
  agente: string;
};

/**
 * Chi ha generato almeno un evento. Tenuto a parte dalla mappa del
 * traffico per due motivi: è una manciata di voci anche quando gli
 * indirizzi visti sono migliaia, e non deve sparire quando la mappa
 * grande viene potata — altrimenti la finestra della quarantena si
 * azzererebbe da sola proprio sotto una raffica da molte sorgenti.
 */
type Sospetto = {
  /** Istanti degli eventi nella finestra corrente, in ordine. */
  colpi: number[];
  tipi: Partial<Record<TipoEvento, number>>;
  totale: number;
  ultimo: number;
};

type Minuto = { totale: number; bloccate: number; ip: Set<string> };

type Quarantena = { fino: number; motivo: string; colpi: number };

/**
 * Contatori che non ruotano mai. Il giornale degli eventi è corto e i
 * minuti scadono: senza questi, dopo un'ora di raffica il pannello
 * direbbe "nessun problema" perché le prove sono uscite dalla finestra.
 */
type Totali = {
  richieste: number;
  eventi: number;
  perTipo: Partial<Record<TipoEvento, number>>;
  quarantene: number;
};

type Deposito = {
  avvio: number;
  seq: number;
  eventi: EventoSicurezza[];
  ip: Map<string, SchedaIp>;
  sospetti: Map<string, Sospetto>;
  percorsi: Map<string, number>;
  minuti: Map<number, Minuto>;
  quarantena: Map<string, Quarantena>;
  totali: Totali;
};

/* ------------------------------ Dimensioni ------------------------------ */

/** Eventi conservati nel giornale. Oltre, i più vecchi cadono. */
const MAX_EVENTI = 800;
/** Quanti il pannello ne riceve: il resto resta qui, non serve trasmetterlo. */
const EVENTI_IN_VETRINA = 150;
/** Indirizzi tracciati insieme. Il tetto è ciò che rende la mappa sicura. */
const MAX_IP = 5000;
/** Indirizzi con eventi tenuti sotto osservazione. */
const MAX_SOSPETTI = 800;
/**
 * Percorsi distinti nella classifica. Il percorso lo sceglie chi chiama,
 * quindi la cardinalità è illimitata per costruzione: raggiunto il tetto
 * si smette di aggiungerne di nuovi e si continua solo a contare quelli
 * già presenti. Così uno scanner con mille indirizzi inventati non riesce
 * a spingere fuori dalla classifica le rotte vere.
 */
const MAX_PERCORSI = 400;
/** Minuti di storico per il grafico del traffico. */
const MINUTI_STORICO = 60;
/** Indirizzi mostrati nelle classifiche del pannello. */
const IN_CLASSIFICA = 25;

/**
 * Quarantena automatica: dopo COLPI eventi in FINESTRA, l'indirizzo viene
 * respinto per DURATA. I numeri sono scelti perché un utente reale non ci
 * arriva nemmeno sbagliando: gli eventi contati sono già tutti tentativi
 * respinti, non richieste normali.
 */
const COLPI_QUARANTENA = 12;
const FINESTRA_COLPI_MS = 10 * 60 * 1000;
const DURATA_QUARANTENA_MS = 30 * 60 * 1000;

function deposito(): Deposito {
  const globale = globalThis as unknown as { __sorveglianza?: Deposito };

  globale.__sorveglianza ??= {
    avvio: Date.now(),
    seq: 0,
    eventi: [],
    ip: new Map(),
    sospetti: new Map(),
    percorsi: new Map(),
    minuti: new Map(),
    quarantena: new Map(),
    totali: { richieste: 0, eventi: 0, perTipo: {}, quarantene: 0 },
  };

  return globale.__sorveglianza;
}

/**
 * Percorsi e user-agent arrivano da fuori e finiscono in una pagina: React
 * li scrive come testo, quindi non c'è modo di iniettare markup, ma una
 * riga da diecimila caratteri o piena di caratteri di controllo rovina
 * comunque il pannello. Si taglia e si ripulisce all'ingresso, una volta
 * sola, invece di doversene ricordare a ogni punto di lettura.
 */
function ripulisci(valore: string | null | undefined, massimo: number) {
  if (!valore) return "";
  return valore.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, massimo);
}

/* -------------------------------- Scrittura ------------------------------- */

function minutoCorrente() {
  return Math.floor(Date.now() / 60_000);
}

function potaMinuti(dep: Deposito, adesso: number) {
  for (const chiave of dep.minuti.keys()) {
    if (chiave <= adesso - MINUTI_STORICO) dep.minuti.delete(chiave);
  }
}

/**
 * Quando una mappa supera il tetto si liberano le voci viste meno di
 * recente, a blocchi: potarne una per richiesta significherebbe riordinare
 * migliaia di elementi a ogni colpo, cioè pagare di più proprio quando il
 * traffico è più alto.
 */
function pota<T extends { ultimoVisto?: number; ultimo?: number }>(
  mappa: Map<string, T>,
  tetto: number,
) {
  if (mappa.size <= tetto) return;

  const quando = (voce: T) => voce.ultimoVisto ?? voce.ultimo ?? 0;
  const ordinate = [...mappa.entries()].sort(
    (a, b) => quando(a[1]) - quando(b[1]),
  );
  const daTogliere = Math.ceil(tetto * 0.2);
  for (let i = 0; i < daTogliere; i += 1) {
    const voce = ordinate[i];
    if (voce) mappa.delete(voce[0]);
  }
}

/** Registra una richiesta qualunque: alimenta traffico e schede per IP. */
export function traccia(
  ip: string,
  metodo: string,
  percorso: string,
  agente: string | null,
) {
  const dep = deposito();
  const adesso = Date.now();
  const minuto = minutoCorrente();
  const pulito = ripulisci(percorso, 200);

  dep.totali.richieste += 1;

  const riga = dep.minuti.get(minuto) ?? {
    totale: 0,
    bloccate: 0,
    ip: new Set<string>(),
  };
  riga.totale += 1;
  riga.ip.add(ip);
  dep.minuti.set(minuto, riga);
  potaMinuti(dep, minuto);

  // Classifica dei percorsi: si aggiunge solo finché c'è posto (vedi
  // MAX_PERCORSI), poi si contano soltanto quelli già noti.
  const visto = dep.percorsi.get(pulito);
  if (visto !== undefined) dep.percorsi.set(pulito, visto + 1);
  else if (dep.percorsi.size < MAX_PERCORSI) dep.percorsi.set(pulito, 1);

  const scheda = dep.ip.get(ip);
  if (scheda) {
    scheda.richieste += 1;
    scheda.ultimoVisto = adesso;
    scheda.ultimoPercorso = pulito;
  } else {
    dep.ip.set(ip, {
      ip,
      richieste: 1,
      bloccate: 0,
      primoVisto: adesso,
      ultimoVisto: adesso,
      ultimoPercorso: pulito,
      agente: ripulisci(agente, 160),
    });
    pota(dep.ip, MAX_IP);
  }
}

/**
 * Registra un evento di sicurezza. Restituisce true se questo evento ha
 * fatto scattare la quarantena, così il chiamante può dirlo nei log.
 */
export function segnala(evento: {
  tipo: TipoEvento;
  ip: string;
  metodo?: string;
  percorso?: string;
  agente?: string | null;
  dettaglio?: string;
}): boolean {
  const dep = deposito();
  const adesso = Date.now();

  dep.seq += 1;
  dep.eventi.push({
    id: dep.seq,
    quando: adesso,
    tipo: evento.tipo,
    ip: evento.ip,
    metodo: evento.metodo ?? "",
    percorso: ripulisci(evento.percorso, 200),
    agente: ripulisci(evento.agente, 160),
    dettaglio: ripulisci(evento.dettaglio, 200) || undefined,
  });

  if (dep.eventi.length > MAX_EVENTI) {
    dep.eventi.splice(0, dep.eventi.length - MAX_EVENTI);
  }

  dep.totali.eventi += 1;
  dep.totali.perTipo[evento.tipo] = (dep.totali.perTipo[evento.tipo] ?? 0) + 1;

  const riga = dep.minuti.get(minutoCorrente());
  if (riga) riga.bloccate += 1;

  const scheda = dep.ip.get(evento.ip);
  if (scheda) {
    scheda.bloccate += 1;
    scheda.ultimoVisto = adesso;
  }

  // Un evento generato DALLA quarantena non deve prolungare la quarantena:
  // altrimenti chi continua a bussare resta chiuso fuori per sempre, e la
  // misura smette di essere temporanea senza che nessuno l'abbia deciso.
  if (evento.tipo === "quarantena") return false;

  const sospetto = dep.sospetti.get(evento.ip) ?? {
    colpi: [],
    tipi: {},
    totale: 0,
    ultimo: adesso,
  };
  sospetto.tipi[evento.tipo] = (sospetto.tipi[evento.tipo] ?? 0) + 1;
  sospetto.totale += 1;
  sospetto.ultimo = adesso;
  sospetto.colpi.push(adesso);
  dep.sospetti.set(evento.ip, sospetto);
  pota(dep.sospetti, MAX_SOSPETTI);

  return valutaQuarantena(dep, evento.ip, sospetto, adesso, evento.tipo);
}

/**
 * Decide se l'indirizzo ha superato la soglia.
 *
 * Il conteggio è una finestra scorrevole sui soli istanti di quell'IP,
 * non una scansione del giornale: prima lo era, e significava che ogni
 * evento costava quanto tutti gli eventi già registrati — il controllo
 * diventava più lento proprio mentre l'attacco cresceva. Qui il lavoro è
 * proporzionale ai colpi di un singolo indirizzo, che per costruzione
 * non superano mai di molto la soglia.
 */
function valutaQuarantena(
  dep: Deposito,
  ip: string,
  sospetto: Sospetto,
  adesso: number,
  tipo: TipoEvento,
): boolean {
  const gia = dep.quarantena.get(ip);
  if (gia && gia.fino > adesso) return false;

  const soglia = adesso - FINESTRA_COLPI_MS;
  // Gli istanti sono in ordine crescente: basta togliere dalla testa.
  let scaduti = 0;
  while (scaduti < sospetto.colpi.length && sospetto.colpi[scaduti] < soglia) {
    scaduti += 1;
  }
  if (scaduti > 0) sospetto.colpi.splice(0, scaduti);

  if (sospetto.colpi.length < COLPI_QUARANTENA) return false;

  const colpi = sospetto.colpi.length;
  // Azzerati alla condanna: senza, ogni evento successivo troverebbe la
  // soglia già superata e riapplicherebbe la quarantena all'infinito.
  sospetto.colpi.length = 0;

  dep.quarantena.set(ip, {
    fino: adesso + DURATA_QUARANTENA_MS,
    motivo: `${colpi} tentativi respinti in ${Math.round(FINESTRA_COLPI_MS / 60000)} minuti (ultimo: ${tipo})`,
    colpi,
  });
  dep.totali.quarantene += 1;

  return true;
}

/* -------------------------------- Lettura -------------------------------- */

/** Quarantena attiva per questo IP, o null. Ripulisce quelle scadute. */
export function inQuarantena(ip: string): Quarantena | null {
  const dep = deposito();
  const voce = dep.quarantena.get(ip);
  if (!voce) return null;

  if (voce.fino <= Date.now()) {
    dep.quarantena.delete(ip);
    return null;
  }

  return voce;
}

/** Rilascio manuale dal pannello, per un blocco rivelatosi eccessivo. */
export function liberaIp(ip: string) {
  const dep = deposito();
  dep.quarantena.delete(ip);
  // Anche la finestra dei colpi, altrimenti il primo evento successivo
  // trova la soglia già superata e il rilascio dura una richiesta sola.
  dep.sospetti.delete(ip);
}

/**
 * Solo il numero di eventi dell'ultima ora, per il contatore sulla barra
 * delle schede. Sta a parte da `istantanea` perché quella costruisce
 * grafico, elenchi e classifiche: lavoro sprecato per mostrare una cifra
 * accanto a un'etichetta, e pagato a ogni apertura del pannello.
 */
export function contaEventiRecenti(): number {
  const soglia = Date.now() - 60 * 60 * 1000;
  const eventi = deposito().eventi;

  let totale = 0;
  for (let i = eventi.length - 1; i >= 0; i -= 1) {
    if (eventi[i].quando < soglia) break;
    totale += 1;
  }
  return totale;
}

/**
 * I primi `quanti` per punteggio, in una passata sola.
 *
 * Un `sort()` completo su cinquemila indirizzi, ripetuto a ogni
 * aggiornamento del pannello, è lavoro buttato per mostrarne venticinque.
 * Qui il costo cresce con il numero di voci, non con il loro logaritmo
 * moltiplicato per il numero di voci.
 */
function primi<T>(
  valori: Iterable<T>,
  quanti: number,
  punteggio: (voce: T) => number,
): T[] {
  const migliori: { voce: T; punti: number }[] = [];

  for (const voce of valori) {
    const punti = punteggio(voce);
    if (migliori.length < quanti) {
      migliori.push({ voce, punti });
      migliori.sort((a, b) => b.punti - a.punti);
      continue;
    }
    if (punti <= migliori[migliori.length - 1].punti) continue;
    migliori[migliori.length - 1] = { voce, punti };
    migliori.sort((a, b) => b.punti - a.punti);
  }

  return migliori.map((v) => v.voce);
}

export type Istantanea = ReturnType<typeof istantanea>;

/**
 * Il quadro completo per il pannello. Una funzione sola perché i numeri
 * devono riferirsi tutti allo stesso momento: leggerli con chiamate
 * separate darebbe un riepilogo che non torna con l'elenco sotto.
 */
export function istantanea() {
  const dep = deposito();
  const adesso = Date.now();
  const minuto = minutoCorrente();

  potaMinuti(dep, minuto);

  // Il grafico va dal minuto più vecchio al più recente, con gli zeri al
  // posto giusto: saltare i minuti senza traffico farebbe leggere una
  // pausa come continuità.
  const traffico = [];
  for (let i = MINUTI_STORICO - 1; i >= 0; i -= 1) {
    const chiave = minuto - i;
    const riga = dep.minuti.get(chiave);
    traffico.push({
      minuto: chiave,
      totale: riga?.totale ?? 0,
      bloccate: riga?.bloccate ?? 0,
      ipUnici: riga?.ip.size ?? 0,
    });
  }

  const ultimo = traffico[traffico.length - 1];
  const precedenti = traffico.slice(0, -1).filter((r) => r.totale > 0);
  const media =
    precedenti.length > 0
      ? precedenti.reduce((t, r) => t + r.totale, 0) / precedenti.length
      : 0;
  const puntaOraria = traffico.reduce((max, r) => Math.max(max, r.totale), 0);

  const oraFa = adesso - 60 * 60 * 1000;
  const eventiRecenti = dep.eventi.filter((e) => e.quando >= oraFa);

  const perTipo = eventiRecenti.reduce<Partial<Record<TipoEvento, number>>>(
    (mappa, evento) => {
      mappa[evento.tipo] = (mappa[evento.tipo] ?? 0) + 1;
      return mappa;
    },
    {},
  );

  const quarantena = [...dep.quarantena.entries()]
    .filter(([, voce]) => voce.fino > adesso)
    .map(([ip, voce]) => ({ ip, ...voce }))
    .sort((a, b) => b.fino - a.fino);

  // Due classifiche distinte: chi ha fatto scattare qualcosa e chi ha solo
  // chiesto molto. Mescolarle nascondeva l'uno o l'altro — un indirizzo con
  // tre eventi gravi spariva sotto a un utente attivo con mille richieste
  // legittime.
  const sospetti = primi(
    [...dep.sospetti.entries()],
    IN_CLASSIFICA,
    ([, voce]) => voce.totale,
  ).map(([ip, voce]) => {
    const scheda = dep.ip.get(ip);
    return {
      ip,
      eventi: voce.totale,
      tipi: voce.tipi,
      ultimo: voce.ultimo,
      richieste: scheda?.richieste ?? 0,
      agente: scheda?.agente ?? "",
      inQuarantena: (dep.quarantena.get(ip)?.fino ?? 0) > adesso,
    };
  });

  const indirizzi = primi(
    dep.ip.values(),
    IN_CLASSIFICA,
    (voce) => voce.richieste,
  );

  const percorsi = primi(
    [...dep.percorsi.entries()],
    12,
    ([, quante]) => quante,
  ).map(([percorso, quante]) => ({ percorso, quante }));

  return {
    avvio: dep.avvio,
    adesso,
    traffico,
    alMinuto: ultimo?.totale ?? 0,
    bloccateAlMinuto: ultimo?.bloccate ?? 0,
    ipAlMinuto: ultimo?.ipUnici ?? 0,
    mediaAlMinuto: Math.round(media * 10) / 10,
    puntaOraria,
    eventiUltimaOra: eventiRecenti.length,
    perTipo,
    totali: dep.totali,
    ipTracciati: dep.ip.size,
    sospettiTracciati: dep.sospetti.size,
    percorsiTracciati: dep.percorsi.size,
    eventi: dep.eventi.slice(-EVENTI_IN_VETRINA).reverse(),
    sospetti,
    indirizzi,
    percorsi,
    quarantena,
    minaccia: valutaMinaccia({
      alMinuto: ultimo?.totale ?? 0,
      bloccateAlMinuto: ultimo?.bloccate ?? 0,
      media,
      inQuarantena: quarantena.length,
    }),
  };
}

export type LivelloMinaccia = "calmo" | "attenzione" | "allarme";

/**
 * Giudizio sullo stato del traffico.
 *
 * Non esiste una soglia assoluta valida per ogni sito, quindi si guarda
 * anche lo scarto dalla media dell'ultima ora: un picco a dieci volte il
 * normale dice più di un numero fisso, e su un sito piccolo un valore
 * "grande" scelto a tavolino non scatterebbe mai.
 */
function valutaMinaccia(dati: {
  alMinuto: number;
  bloccateAlMinuto: number;
  media: number;
  inQuarantena: number;
}): { livello: LivelloMinaccia; motivo: string } {
  const { alMinuto, bloccateAlMinuto, media, inQuarantena } = dati;

  if (bloccateAlMinuto >= 60) {
    return {
      livello: "allarme",
      motivo: `${bloccateAlMinuto} richieste respinte in un minuto`,
    };
  }
  if (alMinuto >= 1200) {
    return {
      livello: "allarme",
      motivo: `${alMinuto} richieste in un minuto`,
    };
  }
  // Lo scarto conta solo con una base sufficiente: con una media di due
  // richieste al minuto, dieci sono la normale visita di una persona.
  if (media >= 40 && alMinuto > media * 8) {
    return {
      livello: "allarme",
      motivo: `traffico a ${Math.round(alMinuto / media)}× la media dell'ora`,
    };
  }
  if (bloccateAlMinuto >= 15) {
    return {
      livello: "attenzione",
      motivo: `${bloccateAlMinuto} richieste respinte nell'ultimo minuto`,
    };
  }
  if (alMinuto >= 500) {
    return {
      livello: "attenzione",
      motivo: `${alMinuto} richieste in un minuto`,
    };
  }
  if (inQuarantena > 0) {
    return {
      livello: "attenzione",
      motivo: `${inQuarantena} ${inQuarantena === 1 ? "indirizzo" : "indirizzi"} in quarantena`,
    };
  }

  return { livello: "calmo", motivo: "traffico nella norma" };
}
