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
      dep.ultimoErrore = `API CrowdSec: HTTP ${risposta.status}`;
      dep.collegato = false;
      return null;
    }

    const corpo = (await risposta.json()) as { new?: RigaApi[] };
    const adesso = Date.now();

    const aggiornate = new Map<string, DecisioneCrowdSec>();
    for (const riga of corpo.new ?? []) {
      const voce = normalizza(riga, adesso);
      if (!voce) continue;
      if (aggiornate.size >= MAX_IN_MEMORIA) break;
      aggiornate.set(`${voce.valore}|${voce.scenario}`, voce);
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
      const locale = voce.origine !== "CAPI" && voce.origine !== "lists";
      if (!locale) continue;
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
    dep.collegato = true;
    dep.ultimoErrore = null;
    dep.ultimaLettura = adesso;

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
    dep.ultimoErrore =
      eccezione instanceof Error ? eccezione.message.slice(0, 120) : "errore";
    dep.collegato = false;
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
    /** Le locali per prime: sono le uniche che riguardano questo sito. */
    decisioni: decisioni
      .sort((a, b) => {
        const localeA = a.origine !== "CAPI" && a.origine !== "lists" ? 0 : 1;
        const localeB = b.origine !== "CAPI" && b.origine !== "lists" ? 0 : 1;
        return localeA - localeB;
      })
      .slice(0, 40),
  };
}
