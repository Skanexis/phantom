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

import { sottorete } from "@/lib/rete";

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
  | "quarantena"
  /**
   * Richiesta respinta da un blocco deciso dallo staff: account, indirizzo
   * o dispositivo. Tenuto distinto da "accesso" di proposito — quello è un
   * tentativo di entrare dove non si può, e merita una notifica; questo è
   * un provvedimento che sta funzionando, e chi è bloccato ricarica la
   * pagina dieci volte prima di arrendersi.
   */
  | "esclusione";

export const TIPI_EVENTO: TipoEvento[] = [
  "webhook",
  "gate",
  "accesso",
  "iniezione",
  "origine",
  "frequenza_utente",
  "flussi",
  "esclusione",
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
  /** Ultimo account visto da questo indirizzo, se ce n'è stato uno. */
  utenteId?: string;
  telegramId?: string;
  ruolo?: string;
  /** Codice ISO del paese, quando il proxy lo fornisce. */
  paese?: string;
  /**
   * Ultimo marcatore di dispositivo visto da questo indirizzo. È la chiave
   * che rende utile il bando per dispositivo: senza, dal pannello si può
   * escludere solo un IP, cioè la cosa che chi vuole rientrare cambia per
   * prima.
   */
  dispositivo?: string;
};

/* --------------------------- Registro e identità -------------------------- */

/**
 * Gravità di una riga del registro. È una scala sola per tutto il sistema:
 * la usano il perimetro, le rotte e il giudizio sulle richieste insolite,
 * così nel pannello un "allarme" significa la stessa cosa da qualunque
 * parte arrivi.
 */
export type LivelloRiga = "info" | "avviso" | "allarme" | "critico";

/**
 * Chi ha fatto la richiesta, quando si sa.
 *
 * Viene dal token di sessione firmato, non dal database: il perimetro non
 * può interrogare Prisma a ogni richiesta senza diventare esso stesso il
 * collo di bottiglia. Il nome leggibile lo aggiunge il pannello, che una
 * lettura al database se la può permettere.
 */
export type Identita = {
  utenteId: string;
  telegramId: string;
  ruolo: string;
} | null;

/**
 * Una riga della console. A differenza di `EventoSicurezza`, che esiste
 * solo per ciò che è stato respinto, qui finisce **ogni** richiesta: senza
 * le righe ordinarie non si può rispondere alla domanda che conta davvero
 * quando qualcosa scatta, cioè cosa stava facendo quell'indirizzo nei
 * minuti precedenti.
 */
export type RigaRegistro = {
  id: number;
  quando: number;
  livello: LivelloRiga;
  metodo: string;
  percorso: string;
  ip: string;
  utenteId: string | null;
  telegramId: string | null;
  ruolo: string | null;
  /** Marcatore del dispositivo: quello che si bandisce quando cambia l'IP. */
  dispositivo: string | null;
  /** Codice ISO del paese, quando il proxy lo fornisce. */
  paese: string | null;
  agente: string;
  /** Cosa ha deciso il perimetro: passata, respinta, deviata. */
  esito: string;
  /** Stato HTTP, quando la richiesta si è fermata qui. */
  stato: number | null;
  /** Presente solo sulle righe nate da un evento di sicurezza. */
  tipo?: TipoEvento;
  /** Perché la riga non è ordinaria. Vuoto sulle righe normali. */
  motivi: string[];
  /** Tempo speso dentro il perimetro, in millisecondi. */
  durataMs: number;
};

/**
 * Scheda per account. L'indirizzo IP da solo non è un'identità: cambia con
 * la rete, è condiviso da tutta una casa e non dice nulla su chi c'è
 * dietro. Legando l'IP alla sessione nel momento in cui qualcuno entra nel
 * proprio account, la stessa persona resta riconoscibile anche quando si
 * sposta — e le richieste anonime restano quello che sono, un indirizzo e
 * basta.
 */
export type SchedaUtente = {
  utenteId: string;
  telegramId: string;
  ruolo: string;
  /** Indirizzi da cui questo account si è collegato, dal più recente. */
  indirizzi: string[];
  richieste: number;
  eventi: number;
  primoVisto: number;
  ultimoVisto: number;
  ultimoPercorso: string;
};

/**
 * Avviso in attesa di essere spedito su Telegram.
 *
 * La coda esiste perché chi produce l'avviso non può spedirlo: il
 * perimetro gira sul percorso caldo e non deve né conoscere il database
 * (per sapere chi sono gli sviluppatori) né aspettare una chiamata di rete
 * verso Telegram. Qui si deposita, e un compito periodico svuota.
 */
export type Allerta = {
  id: number;
  quando: number;
  gravita: "alta" | "media";
  titolo: string;
  righe: string[];
  /** Identifica la famiglia dell'avviso, per il raffreddamento. */
  chiave: string;
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
  /** Quante richieste per metodo HTTP: GET, POST, e le rarità. */
  perMetodo: Record<string, number>;
  /** Quante righe per gravità: è la misura di quanto è "rumoroso" il sito. */
  perLivello: Record<LivelloRiga, number>;
};

type Deposito = {
  avvio: number;
  seq: number;
  eventi: EventoSicurezza[];
  registro: RigaRegistro[];
  ip: Map<string, SchedaIp>;
  utenti: Map<string, SchedaUtente>;
  sospetti: Map<string, Sospetto>;
  percorsi: Map<string, number>;
  minuti: Map<number, Minuto>;
  quarantena: Map<string, Quarantena>;
  totali: Totali;
  /** Righe in attesa di finire nell'archivio a database. */
  coda: RigaRegistro[];
  /** Righe scartate perché la coda era piena: si dichiara, non si nasconde. */
  codaPersa: number;
  allerte: Allerta[];
  /** Ultima spedizione per chiave d'avviso: alimenta il raffreddamento. */
  raffreddamento: Map<string, number>;
  /** Avvisi scartati perché la coda era piena: si dichiara, non si nasconde. */
  allertePerse: number;
};

/* ------------------------------ Dimensioni ------------------------------ */

/** Eventi conservati nel giornale. Oltre, i più vecchi cadono. */
const MAX_EVENTI = 800;
/** Quanti il pannello ne riceve: il resto resta qui, non serve trasmetterlo. */
const EVENTI_IN_VETRINA = 150;
/**
 * Righe di console conservate. Più alto del giornale degli eventi perché
 * qui finisce ogni richiesta, non solo quelle respinte: è la finestra
 * entro cui si può ancora ricostruire cosa è successo prima di un blocco.
 */
const MAX_REGISTRO = 1500;
/**
 * Quante ne riceve il pannello. Ordinamento e filtri lavorano su questa
 * finestra, non sull'intero deposito: mandarne millecinquecento a ogni
 * giro di aggiornamento costerebbe più della sorveglianza stessa.
 */
const REGISTRO_IN_VETRINA = 400;
/**
 * Righe in attesa di essere scritte nell'archivio.
 *
 * Dimensionato sul ritmo di svuotamento: il compito periodico gira ogni
 * venti secondi e scrive a lotti, quindi cinquemila posti coprono
 * duecentocinquanta richieste al secondo sostenute — molto oltre il
 * traffico di questo sito — e reggono comunque un paio di giri saltati per
 * un database lento. Oltre, si scarta dalla testa e si conta.
 */
const MAX_CODA = 5000;
/** Account riconosciuti tenuti in memoria. */
const MAX_UTENTI = 2000;
/** Indirizzi ricordati per account: bastano a vedere uno spostamento. */
const MAX_IP_PER_UTENTE = 8;
/**
 * Avvisi in attesa di spedizione. Oltre, si contano soltanto.
 *
 * Alzato da sessanta a duecento con l'ingresso delle sonde nel canale: ogni
 * sondaggio accoda un avviso senza raffreddamento, e la coda si svuota ogni
 * venti secondi — sessanta posti significavano scartarne una parte a ogni
 * scansione un po' vivace. Duecento voci da poche centinaia di byte sono
 * qualche decina di kilobyte: il tetto resta, perché una coda senza tetto è
 * il solito modo di far crescere la memoria bussando, ma è collocato dove
 * scatta solo sotto una raffica vera.
 */
const MAX_ALLERTE = 200;
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
    registro: [],
    ip: new Map(),
    utenti: new Map(),
    sospetti: new Map(),
    percorsi: new Map(),
    minuti: new Map(),
    quarantena: new Map(),
    totali: {
      richieste: 0,
      eventi: 0,
      perTipo: {},
      quarantene: 0,
      perMetodo: {},
      perLivello: { info: 0, avviso: 0, allarme: 0, critico: 0 },
    },
    coda: [],
    codaPersa: 0,
    allerte: [],
    raffreddamento: new Map(),
    allertePerse: 0,
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

/**
 * Parametri il cui valore si può mostrare: identificativi, cursori, filtri
 * dell'interfaccia. Elenco chiuso di proposito — vedi `mascheraQuery`.
 */
const PARAMETRI_IN_CHIARO = new Set([
  "scheda",
  "ambito",
  "funzione",
  "causa",
  "stato",
  "prima",
  "richiesta",
  "piano",
  "tab",
]);

/**
 * Nasconde i valori della query string, tenendo i nomi dei parametri.
 *
 * La console registra ogni richiesta, non più i soli tentativi respinti, e
 * questo cambia la natura di ciò che finisce in memoria: prima una query
 * string ci arrivava solo se conteneva una firma d'attacco, adesso ci
 * arrivano tutte. Oggi in questo sito non passa nulla di segreto per URL —
 * il token di collegamento viaggia nel corpo della richiesta, la password
 * del cantiere pure — ma la difesa non può dipendere da un fatto che resta
 * vero solo finché nessuno aggiunge un `?reset=...`. Il giorno in cui
 * succedesse, il segreto finirebbe in un registro letto dal pannello e
 * spedito su Telegram, e nessuno se ne accorgerebbe.
 *
 * L'elenco è chiuso e non un elenco di parole proibite: un filtro che vieta
 * "token" e "password" lascia passare tutto ciò a cui nessuno ha pensato,
 * cioè esattamente il caso che conta. I nomi dei parametri restano
 * visibili, quindi la riga dice ancora *quali* dati sono stati inviati.
 */
function mascheraQuery(percorso: string): string {
  const taglio = percorso.indexOf("?");
  if (taglio < 0) return percorso;

  const base = percorso.slice(0, taglio);
  const query = percorso.slice(taglio + 1);
  if (!query) return base;

  const parti = query
    .split("&")
    .slice(0, 12)
    .map((coppia) => {
      const uguale = coppia.indexOf("=");
      if (uguale < 0) return coppia.slice(0, 40);

      const nome = coppia.slice(0, uguale).slice(0, 40);
      if (!PARAMETRI_IN_CHIARO.has(nome)) return `${nome}=•••`;
      return `${nome}=${coppia.slice(uguale + 1).slice(0, 60)}`;
    });

  return `${base}?${parti.join("&")}`;
}

/**
 * Metodi contati per nome. Tutto il resto finisce in un secchio solo: il
 * metodo lo sceglie chi chiama, e una chiave nuova per ogni valore
 * inventato sarebbe una mappa che cresce finché c'è memoria — il solito
 * modo di far cadere il processo passando dalla porta che lo osserva.
 */
const METODI_NOTI = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "TRACE",
  "CONNECT",
]);

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

/**
 * Registra una richiesta qualunque: alimenta traffico, schede per IP e —
 * quando la richiesta porta una sessione — la scheda dell'account.
 *
 * Restituisce `nuovoIp`, che il chiamante usa per giudicare quanto è
 * insolita la richiesta: qui la risposta costa una lettura di mappa già
 * fatta, ricavarla fuori significherebbe farne una seconda.
 */
export function traccia(dati: {
  ip: string;
  metodo: string;
  percorso: string;
  agente: string | null;
  identita?: Identita;
  dispositivo?: string | null;
  paese?: string | null;
}): { nuovoIp: boolean } {
  const dep = deposito();
  const adesso = Date.now();
  const minuto = minutoCorrente();
  const pulito = ripulisci(dati.percorso, 200);
  const { ip, identita } = dati;

  dep.totali.richieste += 1;

  const metodo = ripulisci(dati.metodo, 12).toUpperCase() || "?";
  const chiaveMetodo = METODI_NOTI.has(metodo) ? metodo : "ALTRO";
  dep.totali.perMetodo[chiaveMetodo] =
    (dep.totali.perMetodo[chiaveMetodo] ?? 0) + 1;

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
  const nuovoIp = !scheda;

  if (scheda) {
    scheda.richieste += 1;
    scheda.ultimoVisto = adesso;
    scheda.ultimoPercorso = pulito;
    if (identita) {
      scheda.utenteId = identita.utenteId;
      scheda.telegramId = identita.telegramId;
      scheda.ruolo = identita.ruolo;
    }
    if (dati.dispositivo) scheda.dispositivo = dati.dispositivo;
    if (dati.paese) scheda.paese = dati.paese;
  } else {
    dep.ip.set(ip, {
      ip,
      richieste: 1,
      bloccate: 0,
      primoVisto: adesso,
      ultimoVisto: adesso,
      ultimoPercorso: pulito,
      agente: ripulisci(dati.agente, 160),
      utenteId: identita?.utenteId,
      telegramId: identita?.telegramId,
      ruolo: identita?.ruolo,
      dispositivo: dati.dispositivo ?? undefined,
      paese: dati.paese ?? undefined,
    });
    pota(dep.ip, MAX_IP);
  }

  if (identita) legaAccount(dep, identita, ip, pulito, adesso);

  return { nuovoIp };
}

/**
 * Associa l'indirizzo all'account che lo sta usando in questo momento.
 *
 * L'elenco degli indirizzi tiene solo i più recenti e senza ripetizioni:
 * un utente con IP dinamico ne cambierebbe uno al giorno, e una lista che
 * cresce all'infinito sarebbe insieme inutile da leggere e un modo per far
 * gonfiare la memoria restando collegati.
 */
function legaAccount(
  dep: Deposito,
  identita: NonNullable<Identita>,
  ip: string,
  percorso: string,
  adesso: number,
) {
  const scheda = dep.utenti.get(identita.utenteId);

  if (!scheda) {
    dep.utenti.set(identita.utenteId, {
      utenteId: identita.utenteId,
      telegramId: identita.telegramId,
      ruolo: identita.ruolo,
      indirizzi: [ip],
      richieste: 1,
      eventi: 0,
      primoVisto: adesso,
      ultimoVisto: adesso,
      ultimoPercorso: percorso,
    });
    pota(dep.utenti, MAX_UTENTI);
    return;
  }

  scheda.richieste += 1;
  scheda.ultimoVisto = adesso;
  scheda.ultimoPercorso = percorso;
  scheda.ruolo = identita.ruolo;

  if (scheda.indirizzi[0] !== ip) {
    scheda.indirizzi = [
      ip,
      ...scheda.indirizzi.filter((voce) => voce !== ip),
    ].slice(0, MAX_IP_PER_UTENTE);
  }
}

/* ------------------------------- Console -------------------------------- */

/**
 * Aggiunge una riga alla console.
 *
 * La potatura avviene a blocchi e non a ogni inserimento: `splice` di un
 * elemento su un array pieno costa quanto l'array, e questa funzione sta
 * sul percorso di ogni singola richiesta — pagare quel prezzo un colpo su
 * quattro invece che sempre è la differenza fra una misura e un freno.
 */
export function annota(riga: {
  livello: LivelloRiga;
  metodo: string;
  percorso: string;
  ip: string;
  agente?: string | null;
  identita?: Identita;
  dispositivo?: string | null;
  paese?: string | null;
  esito: string;
  stato?: number | null;
  tipo?: TipoEvento;
  motivi?: string[];
  durataMs?: number;
}): RigaRegistro {
  const dep = deposito();
  dep.seq += 1;

  const voce: RigaRegistro = {
    id: dep.seq,
    quando: Date.now(),
    livello: riga.livello,
    metodo: ripulisci(riga.metodo, 12).toUpperCase() || "?",
    // La maschera si applica qui e non nei chiamanti: è l'unico punto da
    // cui passa ogni riga della console, quindi è l'unico in cui la
    // protezione non può essere dimenticata aggiungendo una chiamata
    // nuova. Il giornale degli eventi conserva invece l'URL grezzo — lì
    // serve come prova, ed è un elenco corto di soli tentativi respinti.
    percorso: mascheraQuery(ripulisci(riga.percorso, 300)),
    ip: riga.ip,
    utenteId: riga.identita?.utenteId ?? null,
    telegramId: riga.identita?.telegramId ?? null,
    ruolo: riga.identita?.ruolo ?? null,
    // Forma verificata a monte (vedi `identificativoValido`): qui si taglia
    // e basta, per non far dipendere questa struttura da quel controllo.
    dispositivo: riga.dispositivo
      ? ripulisci(riga.dispositivo, 32) || null
      : null,
    paese: riga.paese ? ripulisci(riga.paese, 2).toUpperCase() || null : null,
    agente: ripulisci(riga.agente, 160),
    esito: ripulisci(riga.esito, 40),
    stato: riga.stato ?? null,
    tipo: riga.tipo,
    motivi: (riga.motivi ?? []).map((motivo) => ripulisci(motivo, 120)),
    durataMs: riga.durataMs ?? 0,
  };

  dep.registro.push(voce);
  dep.totali.perLivello[voce.livello] += 1;

  if (dep.registro.length > MAX_REGISTRO) {
    dep.registro.splice(0, Math.ceil(MAX_REGISTRO * 0.25));
  }

  /**
   * Copia in coda per l'archivio a database.
   *
   * Qui il costo è un `push`, e non un byte di più: nessuna interrogazione,
   * nessuna attesa di rete, nessun import di Prisma in un modulo che il
   * middleware carica su ogni richiesta. A svuotare la coda è il compito
   * periodico (vedi `registro-db.ts`), che gira fuori da qualunque
   * richiesta e può permettersi di parlare col database.
   *
   * Il tetto vale come per tutto il resto del modulo, e il verso in cui si
   * scarta è una scelta: quando la coda è piena cadono le righe **più
   * vecchie**, perché quelle sono già visibili nella console dal vivo,
   * mentre perdere le ultime significherebbe perdere proprio ciò che sta
   * accadendo. Le perdite si contano e il pannello le dichiara: una coda
   * che scarta in silenzio è peggio di una coda che si ferma.
   */
  dep.coda.push(voce);
  if (dep.coda.length > MAX_CODA) {
    dep.codaPersa += dep.coda.length - MAX_CODA;
    dep.coda.splice(0, dep.coda.length - MAX_CODA);
  }

  return voce;
}

/**
 * Preleva fino a `quante` righe dalla coda di persistenza.
 *
 * Le righe escono dalla coda solo qui, e ci rientrano se la scrittura
 * fallisce (vedi `rimettiInCoda`): un guasto momentaneo del database non
 * deve tradursi in un buco nell'archivio.
 */
export function prelevaDaCoda(quante: number): RigaRegistro[] {
  const dep = deposito();
  if (dep.coda.length === 0) return [];
  return dep.coda.splice(0, quante);
}

/** Rimette in testa le righe che non si è riusciti a scrivere. */
export function rimettiInCoda(righe: RigaRegistro[]) {
  const dep = deposito();
  dep.coda.unshift(...righe);
  if (dep.coda.length > MAX_CODA) {
    dep.codaPersa += dep.coda.length - MAX_CODA;
    dep.coda.splice(0, dep.coda.length - MAX_CODA);
  }
}

/** Quanto è arretrata la scrittura, e quanto si è perso per strada. */
export function statoCoda() {
  const dep = deposito();
  return { inCoda: dep.coda.length, perse: dep.codaPersa };
}

/* -------------------------------- Avvisi --------------------------------- */

/**
 * Deposita un avviso da spedire agli sviluppatori.
 *
 * Il raffreddamento sta qui e non in chi spedisce, per un motivo preciso:
 * sotto una raffica questa funzione viene chiamata centinaia di volte, e
 * accodare centinaia di avvisi identici per poi scartarli al momento
 * dell'invio significherebbe far pagare l'attacco alla memoria del
 * processo. Si scarta subito, all'ingresso.
 */
export function accodaAllerta(allerta: {
  gravita: "alta" | "media";
  titolo: string;
  righe: string[];
  chiave: string;
  /** Minuti di silenzio per questa chiave dopo un avviso. */
  raffreddamentoMinuti?: number;
}): boolean {
  const dep = deposito();
  const adesso = Date.now();
  const attesa = (allerta.raffreddamentoMinuti ?? 10) * 60_000;

  /**
   * Con attesa zero non si passa affatto dalla mappa.
   *
   * Chi chiede di non essere raffreddato — le sonde — usa una chiave unica
   * per evento, altrimenti il primo sondaggio zittirebbe i successivi. Ma
   * una chiave unica per evento scritta in mappa significa una voce nuova a
   * ogni colpo, e la potatura qui sotto toglie solo ciò che ha più di
   * un'ora: sotto una scansione le voci sono tutte fresche, non ne
   * cadrebbe nessuna, e la mappa crescerebbe finché c'è memoria. Cioè il
   * modo di far cadere il processo passando dalla porta che lo avvisa.
   */
  if (attesa > 0) {
    const ultimo = dep.raffreddamento.get(allerta.chiave) ?? 0;
    if (adesso - ultimo < attesa) return false;
    dep.raffreddamento.set(allerta.chiave, adesso);

    // La mappa del raffreddamento ha una chiave per IP: senza tetto sarebbe
    // il solito modo per farla crescere all'infinito bussando da indirizzi
    // sempre diversi.
    if (dep.raffreddamento.size > 2000) {
      for (const [chiave, quando] of dep.raffreddamento) {
        if (adesso - quando > 60 * 60_000) dep.raffreddamento.delete(chiave);
      }
    }
  }

  if (dep.allerte.length >= MAX_ALLERTE) {
    dep.allertePerse += 1;
    return false;
  }

  dep.seq += 1;
  dep.allerte.push({
    id: dep.seq,
    quando: adesso,
    gravita: allerta.gravita,
    titolo: ripulisci(allerta.titolo, 120),
    righe: allerta.righe.map((voce) => ripulisci(voce, 200)),
    chiave: allerta.chiave,
  });

  return true;
}

/**
 * Svuota la coda e la restituisce. Chiamata dal compito periodico: prende
 * tutto in una volta perché così un solo messaggio può riassumere una
 * raffica, invece di generare una notifica per evento.
 */
export function prelevaAllerte(): { allerte: Allerta[]; perse: number } {
  const dep = deposito();
  if (dep.allerte.length === 0 && dep.allertePerse === 0) {
    return { allerte: [], perse: 0 };
  }

  const allerte = dep.allerte;
  const perse = dep.allertePerse;
  dep.allerte = [];
  dep.allertePerse = 0;

  return { allerte, perse };
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
  identita?: Identita;
  dispositivo?: string | null;
  paese?: string | null;
  stato?: number | null;
  durataMs?: number;
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

  // Lo stesso evento compare anche nella console, con la gravità della sua
  // famiglia: chi legge il registro riga per riga non deve saltare su un
  // altro pannello per accorgersi che una richiesta è stata respinta.
  //
  // L'identità è solo quella dichiarata dal chiamante, mai dedotta
  // dall'indirizzo. Una versione precedente, quando mancava, ripiegava
  // sull'ultimo account visto da quell'IP: sembra un miglioramento e invece
  // è la cosa peggiore che si possa fare qui. Dietro un indirizzo condiviso
  // — una casa, un ufficio, una rete mobile — quel ripiego attribuisce il
  // tentativo di un anonimo a chi si è collegato per ultimo, e lo fa
  // proprio nello strumento con cui si decide chi bloccare. Meglio
  // "anonimo", che è vero, di un nome plausibile e sbagliato.
  const identita = evento.identita ?? null;

  if (identita) {
    const account = dep.utenti.get(identita.utenteId);
    if (account) account.eventi += 1;
  }

  annota({
    livello: LIVELLO_EVENTO[evento.tipo],
    metodo: evento.metodo ?? "",
    percorso: evento.percorso ?? "",
    ip: evento.ip,
    agente: evento.agente,
    identita,
    // Ripiego sulla scheda dell'indirizzo: a differenza dell'identità —
    // che non si deduce mai, vedi sopra — questi due non attribuiscono
    // nulla a nessuno. Dicono da dove è arrivata la richiesta, ed è la
    // stessa informazione qualunque sia la persona dietro.
    dispositivo: evento.dispositivo ?? scheda?.dispositivo ?? null,
    paese: evento.paese ?? scheda?.paese ?? null,
    esito: "respinta",
    stato: evento.stato ?? null,
    tipo: evento.tipo,
    motivi: evento.dettaglio ? [evento.dettaglio] : [],
    durataMs: evento.durataMs,
  });

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

  // Gli eventi che pesano davvero partono subito verso Telegram, senza
  // aspettare che l'indirizzo accumuli abbastanza colpi per la quarantena:
  // un segreto del webhook sbagliato è già di per sé una notizia.
  //
  // Le sonde sono l'eccezione, ed è una scelta esplicita di chi gestisce il
  // sito: per gravità sono l'evento più basso della scala — rumore di fondo
  // di internet, uno scanner che prova /wp-admin su qualunque indirizzo —
  // ma vanno segnalate tutte, una per una. Il raffreddamento è quindi
  // azzerato e la chiave resa unica dal numero di sequenza, così due sonde
  // dallo stesso indirizzo non si annullano a vicenda.
  //
  // Il livello resta "info" e non sale: quella scala colora la console e
  // alimenta il contatore dei critici, e promuovere le sonde tingerebbe di
  // rosso l'intero registro nascondendo ciò che conta davvero. Decidere di
  // svegliare qualcuno e giudicare quanto è grave una cosa sono due
  // valutazioni diverse, e qui restano separate.
  const eSonda = evento.tipo === "sonda";

  if (LIVELLO_EVENTO[evento.tipo] === "critico" || eSonda) {
    accodaAllerta({
      gravita: eSonda ? "media" : "alta",
      titolo: `${ETICHETTA_EVENTO[evento.tipo]} da ${evento.ip}`,
      righe: [
        `${evento.metodo ?? ""} ${ripulisci(evento.percorso, 120)}`.trim(),
        evento.dettaglio ? ripulisci(evento.dettaglio, 160) : "",
        // La rete accanto all'indirizzo: le sonde arrivano quasi sempre da
        // più indirizzi vicini, e chi legge l'avviso sul telefono deve
        // poter decidere il bando della sottorete senza aprire il pannello.
        `rete ${sottorete(evento.ip) ?? "non determinabile"}`,
        scheda?.agente ? `agente: ${scheda.agente}` : "",
        identita ? `account telegram ${identita.telegramId}` : "senza account",
      ].filter(Boolean),
      chiave: eSonda
        ? `sonda:${evento.ip}:${dep.seq}`
        : `evento:${evento.tipo}:${evento.ip}`,
      raffreddamentoMinuti: eSonda ? 0 : 10,
    });
  }

  const condannato = valutaQuarantena(
    dep,
    evento.ip,
    sospetto,
    adesso,
    evento.tipo,
  );

  if (condannato) {
    accodaAllerta({
      gravita: "alta",
      titolo: `Indirizzo in quarantena: ${evento.ip}`,
      righe: [
        dep.quarantena.get(evento.ip)?.motivo ?? "",
        `ultimo percorso: ${ripulisci(evento.percorso, 120)}`,
        scheda?.agente ? `agente: ${scheda.agente}` : "",
      ].filter(Boolean),
      chiave: `quarantena:${evento.ip}`,
      raffreddamentoMinuti: 30,
    });
  }

  return condannato;
}

/**
 * Gravità di ogni famiglia di eventi, in una scala sola con il resto del
 * sistema. "critico" significa: sveglia lo sviluppatore adesso.
 */
export const LIVELLO_EVENTO: Record<TipoEvento, LivelloRiga> = {
  webhook: "critico",
  accesso: "critico",
  iniezione: "critico",
  gate: "allarme",
  origine: "allarme",
  frequenza_utente: "allarme",
  flussi: "avviso",
  esclusione: "avviso",
  quarantena: "allarme",
  frequenza: "avviso",
  sonda: "info",
};

/** Nome leggibile della famiglia, per gli avvisi su Telegram. */
const ETICHETTA_EVENTO: Record<TipoEvento, string> = {
  sonda: "Sonda automatica",
  iniezione: "Firma d'attacco nell'URL",
  origine: "Origine non valida",
  frequenza: "Troppe richieste per IP",
  frequenza_utente: "Troppe richieste per account",
  gate: "Password del cantiere sbagliata",
  webhook: "Webhook con segreto errato",
  flussi: "Troppe connessioni in tempo reale",
  accesso: "Tentativo di accesso a un'area riservata",
  esclusione: "Richiesta da soggetto escluso",
  quarantena: "Richiesta da indirizzo in quarantena",
};

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

  // Account visti di recente: è la risposta a "chi c'è dentro adesso", che
  // il conteggio delle connessioni in tempo reale da solo non dà — una
  // persona può essere collegata senza tenere aperta nessuna scheda.
  const utenti = primi(
    dep.utenti.values(),
    IN_CLASSIFICA,
    (voce) => voce.ultimoVisto,
  ).sort((a, b) => b.ultimoVisto - a.ultimoVisto);

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
    // La console arriva già dal più recente: è l'ordine in cui la si legge,
    // e farlo girare al client significherebbe rovesciare quattrocento
    // righe a ogni aggiornamento invece che una volta qui.
    registro: dep.registro.slice(-REGISTRO_IN_VETRINA).reverse(),
    registroTracciato: dep.registro.length,
    utenti,
    utentiTracciati: dep.utenti.size,
    allerteInCoda: dep.allerte.length,
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

/**
 * Controllo periodico del perimetro, indipendente dal pannello.
 *
 * `istantanea()` valuta la minaccia, ma solo quando qualcuno sta guardando:
 * legare l'allarme all'apertura di una scheda significherebbe accorgersi di
 * un attacco esattamente quando non serve più. Questa gira da sola e non
 * costruisce nulla — legge i contatori del minuto corrente e basta.
 */
export function vigila() {
  const dep = deposito();
  const adesso = Date.now();
  const minuto = minutoCorrente();

  const corrente = dep.minuti.get(minuto);
  const precedenti: number[] = [];
  for (let i = 1; i < MINUTI_STORICO; i += 1) {
    const riga = dep.minuti.get(minuto - i);
    if (riga && riga.totale > 0) precedenti.push(riga.totale);
  }
  const media =
    precedenti.length > 0
      ? precedenti.reduce((t, v) => t + v, 0) / precedenti.length
      : 0;

  /**
   * Potatura delle quarantene scadute.
   *
   * Finora una voce spariva solo quando quell'indirizzo tornava a bussare e
   * `inQuarantena` la trovava scaduta: chi veniva bloccato e si arrendeva
   * restava in mappa per sempre. Con una raffica da molte sorgenti — cioè
   * il caso che genera quarantene a decine — la mappa cresceva senza tetto,
   * ed è l'unica struttura del modulo che non ne aveva uno. Adesso che
   * questo giro la percorre ogni venti secondi, il costo sarebbe anche in
   * tempo. Si pulisce qui, dove si sta già scorrendo.
   */
  let attive = 0;
  for (const [indirizzo, voce] of dep.quarantena) {
    if (voce.fino > adesso) attive += 1;
    else dep.quarantena.delete(indirizzo);
  }

  const minaccia = valutaMinaccia({
    alMinuto: corrente?.totale ?? 0,
    bloccateAlMinuto: corrente?.bloccate ?? 0,
    media,
    inQuarantena: attive,
  });

  if (minaccia.livello === "calmo") return minaccia;

  accodaAllerta({
    gravita: minaccia.livello === "allarme" ? "alta" : "media",
    titolo: `Perimetro: ${minaccia.livello}`,
    righe: [
      minaccia.motivo,
      `${corrente?.totale ?? 0} richieste e ${corrente?.bloccate ?? 0} respinte nell'ultimo minuto`,
      `media dell'ora: ${Math.round(media * 10) / 10} richieste/min`,
      attive > 0 ? `${attive} indirizzi in quarantena` : "",
    ].filter(Boolean),
    chiave: `perimetro:${minaccia.livello}`,
    // Lungo di proposito: sotto attacco questo controllo scatterebbe a ogni
    // giro, e una notifica al minuto per mezz'ora non aggiunge nulla a
    // quella che è arrivata per prima.
    raffreddamentoMinuti: minaccia.livello === "allarme" ? 15 : 45,
  });

  return minaccia;
}
