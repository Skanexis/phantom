/**
 * Decisioni di CrowdSec, lette dal pannello.
 *
 * Il problema che risolve. CrowdSec blocca nel firewall: il pacchetto muore
 * nel kernel, quindi non compare né nei log di Nginx né nella sorveglianza
 * né nell'archivio Logs. È esattamente ciò che lo rende conveniente — un
 * blocco che non costa nulla — ma significa anche che senza questo modulo i
 * suoi provvedimenti sarebbero invisibili ovunque tranne che da riga di
 * comando, e nessuno guarda una riga di comando finché non sospetta già
 * qualcosa.
 *
 * Come, e perché così. Si interroga l'API locale con una chiave da
 * "bouncer" — il modo documentato per farlo — invece di eseguire `cscli`.
 * Chiamare un binario di sistema da dentro l'applicazione richiederebbe dei
 * permessi che l'utente dell'app non ha e non deve avere, e trasformerebbe
 * un'integrazione in un buco: qualunque difetto in questo file diventerebbe
 * un'esecuzione di comandi con privilegi.
 *
 * Dipendenza facoltativa, sempre. Senza chiave, con CrowdSec spento o non
 * installato, questo modulo non fa niente e non si lamenta. L'applicazione
 * deve funzionare identica su un server dove CrowdSec non c'è: è uno
 * strumento in più, non un pezzo del sito.
 */

import { accodaAllerta } from "@/lib/sorveglianza";
import { prisma } from "@/lib/prisma";

/** Vero per le decisioni prese qui, false per l'elenco condiviso. */
function eLocale(origine: string) {
  return origine !== "CAPI" && origine !== "lists";
}

/**
 * Conserva a database le decisioni prese su questo sito.
 *
 * Solo quelle locali, e la scelta è deliberata: con l'elenco condiviso
 * attivo ogni giro porta decine di migliaia di indirizzi segnalati da
 * altri, e scriverli sarebbe una tabella enorme che non risponde a nessuna
 * domanda — a chi guarda il pannello non serve sapere che il mondo ha
 * bloccato mezzo internet, serve sapere chi ha attaccato *noi*.
 *
 * Non solleva mai: la chiama un timer di sistema, e questa è una comodità
 * — se il database non risponde, il blocco resta comunque applicato dal
 * firewall.
 */
async function conservaStorico(correnti: DecisioneCrowdSec[]) {
  const locali = correnti.filter((voce) => eLocale(voce.origine));

  try {
    for (const voce of locali) {
      await prisma.decisioneCrowdSec.upsert({
        where: {
          valore_scenario: { valore: voce.valore, scenario: voce.scenario },
        },
        create: {
          valore: voce.valore,
          tipo: voce.tipo,
          scenario: voce.scenario,
          origine: voce.origine,
          durata: voce.durata,
        },
        // Riapparsa dopo essere scaduta: è di nuovo in vigore, e la riga
        // torna attiva invece di duplicarsi.
        update: { durata: voce.durata, scadutaIl: null },
      });
    }

    // Chi non compare più fra le decisioni in vigore è scaduto. Si marca
    // invece di cancellare: la riga è lo storico, ed è tutto il punto.
    await prisma.decisioneCrowdSec.updateMany({
      where: {
        scadutaIl: null,
        valore: { notIn: locali.map((voce) => voce.valore) },
      },
      data: { scadutaIl: new Date() },
    });
  } catch (eccezione) {
    console.error("[crowdsec] storico non aggiornato:", eccezione);
  }
}

/**
 * Le decisioni già viste, per il pannello: prima le attive, poi le scadute.
 *
 * Risponde alla domanda che il solo elenco in vigore non può reggere:
 * «questo indirizzo era già stato bloccato?». Il traffico bloccato muore
 * nel firewall e non lascia traccia altrove, quindi o lo si conserva qui o
 * non lo si sa più.
 */
export async function storicoCrowdSec(quante = 40) {
  try {
    return await prisma.decisioneCrowdSec.findMany({
      orderBy: [{ scadutaIl: { sort: "asc", nulls: "first" } }, { vistoIl: "desc" }],
      take: quante,
      select: {
        id: true,
        valore: true,
        scenario: true,
        durata: true,
        vistoIl: true,
        scadutaIl: true,
      },
    });
  } catch {
    return [];
  }
}

/** L'API locale ascolta solo su loopback: non esce dalla macchina. */
const API = process.env.CROWDSEC_API_URL ?? "http://127.0.0.1:8080";

/**
 * Decisioni tenute in memoria per il pannello.
 *
 * Il tetto vale come per ogni altra struttura del progetto. Qui il numero
 * non lo decide chi bussa ma CrowdSec, e con l'elenco condiviso attivo può
 * essere grande: si mostra ciò che serve a capire cosa sta succedendo, non
 * l'intero elenco mondiale.
 */
const MAX_IN_MEMORIA = 300;

/** Oltre questo tempo si rinuncia: il pannello non aspetta un servizio. */
const TIMEOUT_MS = 2000;

export type DecisioneCrowdSec = {
  /** Indirizzo o rete colpita. */
  valore: string;
  /** "ban", "captcha", … Da noi arriva praticamente sempre "ban". */
  tipo: string;
  /** Lo scenario che l'ha prodotta: dice *perché*, ed è la parte utile. */
  scenario: string;
  /** "crowdsec" per le decisioni locali, "CAPI" per l'elenco condiviso. */
  origine: string;
  durata: string;
  vista: number;
};

type Deposito = {
  decisioni: Map<string, DecisioneCrowdSec>;
  /** Vero dopo il primo giro andato a buon fine. */
  collegato: boolean;
  ultimoErrore: string | null;
  ultimaLettura: number;
  /** Quante decisioni gia scadute ha restituito lultima lettura. */
  scadutePerse: number;
  /** Serve a non riannunciare su Telegram ciò che è già stato annunciato. */
  annunciate: Set<string>;
};

function deposito(): Deposito {
  const globale = globalThis as unknown as { __crowdsec?: Deposito };
  globale.__crowdsec ??= {
    decisioni: new Map(),
    collegato: false,
    ultimoErrore: null,
    ultimaLettura: 0,
    scadutePerse: 0,
    annunciate: new Set(),
  };
  return globale.__crowdsec;
}

type RigaApi = {
  value?: string;
  type?: string;
  scenario?: string;
  origin?: string;
  duration?: string;
};

/**
 * Una decisione già scaduta.
 *
 * CrowdSec esprime il tempo residuo come durata firmata: `47h12m` è
 * «ancora quarantasette ore», `-49h41m45s` è «finita da quarantanove ore».
 * Con `startup=true` l'API restituisce anche queste, perché la pulizia del
 * suo archivio è periodica e non istantanea.
 *
 * Trattarle come attive — che è quello che facevamo — significa mostrare
 * sotto «bloccati adesso» centinaia di indirizzi che passano da giorni, e
 * scriverli nello storico marcati come in vigore. Un pannello che dichiara
 * un blocco inesistente è peggio di un pannello vuoto: ci si fida di lui
 * per decidere.
 */
function eScaduta(durata: string): boolean {
  return durata.trim().startsWith("-");
}

function normalizza(riga: RigaApi, adesso: number): DecisioneCrowdSec | null {
  if (!riga.value) return null;
  return {
    valore: String(riga.value).slice(0, 60),
    tipo: String(riga.type ?? "ban").slice(0, 20),
    scenario: String(riga.scenario ?? "").slice(0, 120),
    origine: String(riga.origin ?? "").slice(0, 30),
    durata: String(riga.duration ?? "").slice(0, 30),
    vista: adesso,
  };
}

/**
 * Un giro di lettura. Restituisce quante decisioni sono in vigore, o null
 * se CrowdSec non è configurato o non risponde.
 *
 * Non solleva mai: la chiama un timer di sistema, dove un'eccezione
 * diventa un rifiuto non gestito e in Node può abbattere il processo.
 */
/**
 * Racconta nel log solo i cambi di stato, non ogni giro.
 *
 * Serviva: finché l'esito viveva soltanto in `ultimoErrore`, l'unico modo
 * di sapere perché il pannello dicesse "non collegato" era aprire il
 * pannello — cioè proprio la cosa che non funzionava. Un motivo leggibile
 * con `pm2 logs` cambia la diagnosi da indovinello a lettura.
 *
 * Solo le transizioni, però: un errore ripetuto ogni venti secondi
 * riempirebbe il log di righe identiche e seppellirebbe tutto il resto.
 */
function annota(dep: Deposito, collegato: boolean, motivo?: string) {
  if (dep.collegato === collegato) {
    dep.ultimoErrore = collegato ? null : (motivo ?? dep.ultimoErrore);
    return;
  }

  dep.collegato = collegato;
  dep.ultimoErrore = collegato ? null : (motivo ?? null);

  if (collegato) {
    console.log("[crowdsec] collegato all'API locale.");
  } else {
    console.error(`[crowdsec] non raggiungibile: ${motivo ?? "motivo ignoto"}`);
  }
}

export async function leggiDecisioni(): Promise<number | null> {
  const chiave = process.env.CROWDSEC_API_KEY;
  if (!chiave) return null;

  const dep = deposito();

  try {
    /**
     * `startup=true` a ogni giro, non `false`.
     *
     * Il flusso incrementale consegna solo le differenze dall'ultima
     * chiamata, e sarebbe più economico — ma basta un giro perso, un
     * riavvio dell'agente o un errore di rete perché l'elenco in memoria
     * resti disallineato per sempre, senza che nulla lo segnali. Qui
     * l'elenco intero costa qualche decina di kilobyte da localhost una
     * volta ogni venti secondi: si preferisce pagarlo e non avere stati
     * che divergono in silenzio.
     */
    const risposta = await fetch(
      `${API}/v1/decisions/stream?startup=true`,
      {
        headers: { "X-Api-Key": chiave },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!risposta.ok) {
      // 403 significa quasi sempre chiave sbagliata o cancellata: dirlo
      // esplicitamente evita di cercare il guasto nella rete.
      const spiegazione =
        risposta.status === 403
          ? "HTTP 403: chiave rifiutata. Rigenerala con `cscli bouncers delete phantomlab-pannello` e `cscli bouncers add phantomlab-pannello -o raw`, poi rimettila nel .env."
          : `HTTP ${risposta.status}`;
      annota(dep, false, spiegazione);
      return null;
    }

    const corpo = (await risposta.json()) as { new?: RigaApi[] };
    const adesso = Date.now();

    /**
     * Il tetto si applica DOPO aver scartato le scadute, non prima.
     *
     * L'API le restituisce in ordine di scadenza, quindi le più vecchie —
     * cioè le finite — arrivano per prime: tagliando a trecento sulla lista
     * grezza si riempiva la memoria di provvedimenti conclusi e si
     * buttavano proprio quelli in vigore.
     */
    const aggiornate = new Map<string, DecisioneCrowdSec>();
    let scadute = 0;
    for (const riga of corpo.new ?? []) {
      const voce = normalizza(riga, adesso);
      if (!voce) continue;
      if (eScaduta(voce.durata)) {
        scadute += 1;
        continue;
      }
      if (aggiornate.size >= MAX_IN_MEMORIA) break;
      aggiornate.set(`${voce.valore}|${voce.scenario}`, voce);
    }
    if (scadute > 0) {
      dep.scadutePerse = scadute;
    }

    /**
     * Si avvisa solo delle decisioni prese qui.
     *
     * Con l'elenco condiviso attivo, il primo giro porta decine di migliaia
     * di indirizzi segnalati da altri: annunciarli su Telegram renderebbe
     * il canale inutilizzabile all'istante. Quelle dell'elenco condiviso
     * sono rumore di fondo utile al firewall e inutile a una persona;
     * quelle locali sono qualcuno che ha attaccato *questo* sito, ed è
     * l'unica notizia.
     */
    const nuoveLocali: DecisioneCrowdSec[] = [];
    for (const [chiaveVoce, voce] of aggiornate) {
      if (!eLocale(voce.origine)) continue;
      if (dep.annunciate.has(chiaveVoce)) continue;
      // Al primo giro dopo un riavvio non si annuncia nulla: sarebbero
      // decisioni vecchie, già viste quando furono prese.
      if (dep.collegato) nuoveLocali.push(voce);
      dep.annunciate.add(chiaveVoce);
    }

    // L'insieme degli annunci ha una chiave per decisione: senza tetto
    // crescerebbe finché c'è memoria.
    if (dep.annunciate.size > MAX_IN_MEMORIA * 4) {
      dep.annunciate = new Set(
        [...dep.annunciate].slice(-MAX_IN_MEMORIA * 2),
      );
    }

    dep.decisioni = aggiornate;
    dep.ultimaLettura = adesso;
    annota(dep, true);

    // Dopo aver aggiornato lo stato in memoria, non prima: se la scrittura
    // a database è lenta o fallisce, il pannello mostra comunque le
    // decisioni correnti.
    await conservaStorico([...aggiornate.values()]);

    for (const voce of nuoveLocali.slice(0, 10)) {
      accodaAllerta({
        gravita: "media",
        titolo: `CrowdSec ha bloccato ${voce.valore}`,
        righe: [
          `scenario: ${voce.scenario}`,
          `durata: ${voce.durata}`,
          "il traffico da questo indirizzo non arriva più né a Nginx né al sito",
        ],
        chiave: `crowdsec:${voce.valore}`,
        raffreddamentoMinuti: 60,
      });
    }

    return aggiornate.size;
  } catch (eccezione) {
    // Servizio spento, non installato, o troppo lento: nessuno dei tre è
    // un guasto dell'applicazione.
    //
    // `cause` va guardata e non solo `message`: fetch avvolge gli errori di
    // rete in un generico "fetch failed", e il motivo vero — ECONNREFUSED,
    // EHOSTUNREACH — sta un livello sotto. Senza, il pannello direbbe
    // "fetch failed" e non si saprebbe se il servizio è spento o se
    // l'indirizzo è sbagliato.
    const errore = eccezione as { message?: string; cause?: { code?: string } };
    const codice = errore?.cause?.code;
    const motivo = [
      errore?.message ?? "errore",
      codice ? `(${codice})` : "",
      codice === "ECONNREFUSED" ? `— nessuno ascolta su ${API}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 160);

    annota(dep, false, motivo);
    return null;
  }
}

/** Quadro per il pannello. Vuoto e non collegato se CrowdSec non c'è. */
export function statoCrowdSec() {
  const dep = deposito();
  const decisioni = [...dep.decisioni.values()];

  return {
    attivo: Boolean(process.env.CROWDSEC_API_KEY),
    collegato: dep.collegato,
    ultimoErrore: dep.ultimoErrore,
    ultimaLettura: dep.ultimaLettura,
    totale: decisioni.length,
    /** Quante decisioni riguardano davvero questo sito. */
    locali: decisioni.filter((voce) => eLocale(voce.origine)).length,
    /** Le locali per prime: sono le uniche che riguardano questo sito. */
    decisioni: decisioni
      .sort((a, b) => Number(!eLocale(a.origine)) - Number(!eLocale(b.origine)))
      .slice(0, 40),
  };
}
