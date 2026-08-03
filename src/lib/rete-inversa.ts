/**
 * Riconoscimento di VPN e indirizzi da datacenter, per risoluzione inversa.
 *
 * Il problema: un indirizzo IP dice poco: chi vuole nascondersi lo cambia,
 * e la sola cosa che distingue un visitatore da qualcuno dietro una VPN è
 * *da che tipo di rete* arriva. Le persone navigano da reti di operatori
 * telefonici e provider domestici; le VPN e gli script vivono su macchine
 * a noleggio.
 *
 * Il come: il nome inverso (PTR) di un indirizzo di datacenter lo dichiara
 * quasi sempre da sé — `ec2-…compute.amazonaws.com`, `…hetzner.com`,
 * `vps-….ovh.net`. È un'euristica, non una prova, e il pannello la presenta
 * per quello che è: un segno accanto all'indirizzo, con il nome trovato
 * come motivazione visibile.
 *
 * Il dove: qui, e mai nel perimetro. Una risoluzione DNS è una chiamata di
 * rete con latenza propria; farla mentre si decide se servire una richiesta
 * significherebbe legare il tempo di risposta del sito a un server DNS.
 * Questo modulo lo usa solo la rotta del pannello, su un numero chiuso di
 * indirizzi per volta, con i risultati in cache.
 */

import { promises as dns } from "node:dns";

export type SchedaRete = {
  /** Nome inverso, se esiste. È anche la prova di ciò che si afferma. */
  ptr: string | null;
  /** Vero quando il nome indica una rete di macchine, non di persone. */
  hosting: boolean;
  /** Indirizzo privato o di loopback: non esce da qui, niente da risolvere. */
  locale: boolean;
};

type Voce = SchedaRete & { scadenza: number };

/**
 * Il PTR di un indirizzo non cambia quasi mai; sei ore evitano di
 * ripetere migliaia di risoluzioni per un pannello che si aggiorna ogni
 * cinque secondi.
 */
const VALIDITA_MS = 6 * 60 * 60 * 1000;

/** Indirizzi in cache. Oltre, si scartano i più vecchi. */
const MAX_CACHE = 3000;

/**
 * Quanti indirizzi nuovi risolvere per ogni giro del compito periodico.
 *
 * Un tetto e non "tutti quelli che mancano": sotto una raffica da mille
 * sorgenti, si lancerebbero mille risoluzioni insieme — il monitoraggio che
 * diventa esso stesso un carico, proprio nel momento peggiore. A dodici per
 * giro gli indirizzi che contano si popolano in una manciata di giri.
 */
const NUOVI_PER_GIRO = 12;

/**
 * Indirizzi in attesa di essere risolti.
 *
 * Il tetto vale come per ogni altra struttura del progetto: la coda la
 * riempie chi bussa, quindi senza un limite sarebbe il solito modo di far
 * crescere la memoria da fuori. Quando è piena si smette di accodare — non
 * si scarta la testa: le richieste più vecchie in coda sono anche le più
 * vicine a essere risolte, e buttarle significherebbe non risolvere mai
 * nessuno sotto una raffica.
 */
const MAX_CODA = 500;

/** Oltre questo tempo la risoluzione si abbandona: il pannello non aspetta. */
const TIMEOUT_MS = 1200;

/**
 * Operatori di macchine a noleggio, reti VPN commerciali e servizi proxy.
 * L'elenco non deve essere completo — non lo sarà mai — deve coprire ciò
 * da cui arriva davvero il traffico automatico.
 */
const NOMI_HOSTING =
  /(amazonaws|compute\.internal|azure|cloudapp|googleusercontent|gcp|digitalocean|linode|vultr|hetzner|ovh|scaleway|contabo|hostinger|leaseweb|choopa|m247|datacamp|datapacket|packethub|zenlayer|colocrossing|servers?\.com|serverius|worldstream|ip-\d+-\d+-\d+-\d+\.(eu|us|net)|vps|vpn|proxy|tor-exit|torexit|relay|nordvpn|expressvpn|surfshark|mullvad|protonvpn|cyberghost|privateinternetaccess|pia\.|windscribe)/i;

/** Reti private, loopback e link-local: non hanno un PTR pubblico. */
const LOCALI =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fe80:|fc00:|fd)/i;

type Deposito = { cache: Map<string, Voce>; coda: Set<string> };

function deposito(): Deposito {
  const globale = globalThis as unknown as { __reteInversa?: Deposito };
  globale.__reteInversa ??= { cache: new Map(), coda: new Set() };
  return globale.__reteInversa;
}

function pota(cache: Map<string, Voce>) {
  if (cache.size <= MAX_CACHE) return;
  const ordinate = [...cache.entries()].sort(
    (a, b) => a[1].scadenza - b[1].scadenza,
  );
  for (let i = 0; i < Math.ceil(MAX_CACHE * 0.2); i += 1) {
    const voce = ordinate[i];
    if (voce) cache.delete(voce[0]);
  }
}

async function risolvi(ip: string): Promise<SchedaRete> {
  if (LOCALI.test(ip) || ip === "sconosciuto") {
    return { ptr: null, hosting: false, locale: true };
  }

  try {
    const nomi = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, rifiuta) =>
        setTimeout(() => rifiuta(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);

    const ptr = nomi[0] ?? null;
    return { ptr, hosting: ptr ? NOMI_HOSTING.test(ptr) : false, locale: false };
  } catch {
    // Nessun PTR, o risoluzione troppo lenta. Non è di per sé un segnale:
    // molti indirizzi domestici non ne hanno uno, e affermare "hosting"
    // per assenza di prove sarebbe il tipo di deduzione che riempie un
    // pannello di sospetti inventati.
    return { ptr: null, hosting: false, locale: false };
  }
}

/**
 * Classifica gli indirizzi indicati leggendo **solo** la cache, e accoda i
 * mancanti per il compito periodico.
 *
 * Prima questa funzione risolveva sul posto, dentro la richiesta del
 * pannello: fino a dodici risoluzioni DNS in parallelo con un secondo e due
 * di timeout ciascuna, cioè fino a un secondo e due di attesa aggiunti alla
 * risposta. E siccome il pannello si aggiorna ogni cinque secondi, sotto un
 * attacco con indirizzi sempre nuovi ogni giro ne lanciava dodici nuove:
 * guardare l'attacco costava traffico DNS proporzionale all'attacco stesso.
 *
 * Adesso non aspetta nulla. Gli indirizzi non ancora noti compaiono senza
 * verdetto per un giro o due e poi si popolano da soli — per un marcatore
 * che dice "probabile VPN" è più che sufficiente, e la risposta del
 * pannello non dipende più da un server DNS.
 */
export function leggiClassificazioni(
  indirizzi: string[],
): Record<string, SchedaRete> {
  const { cache, coda } = deposito();
  const adesso = Date.now();
  const esito: Record<string, SchedaRete> = {};

  for (const ip of new Set(indirizzi)) {
    const voce = cache.get(ip);
    if (voce && voce.scadenza > adesso) {
      esito[ip] = { ptr: voce.ptr, hosting: voce.hosting, locale: voce.locale };
      continue;
    }
    // Un Set: lo stesso indirizzo chiesto da venti righe si accoda una
    // volta sola, e l'ordine di inserimento — che è quello di importanza,
    // deciso dal chiamante — viene conservato.
    if (coda.size < MAX_CODA) coda.add(ip);
  }

  return esito;
}

/**
 * Risolve un lotto di indirizzi in coda. La chiama il compito periodico di
 * `src/instrumentation.ts`, mai una richiesta.
 *
 * Non solleva mai: gira dentro un timer di sistema, dove un'eccezione
 * diventa un rifiuto non gestito e in Node può abbattere il processo.
 */
export async function risolviInCoda(): Promise<number> {
  const { cache, coda } = deposito();
  if (coda.size === 0) return 0;

  const lotto: string[] = [];
  for (const ip of coda) {
    if (lotto.length >= NUOVI_PER_GIRO) break;
    lotto.push(ip);
  }
  for (const ip of lotto) coda.delete(ip);

  const adesso = Date.now();

  try {
    const risolti = await Promise.all(
      lotto.map(async (ip) => [ip, await risolvi(ip)] as const),
    );
    for (const [ip, scheda] of risolti) {
      cache.set(ip, { ...scheda, scadenza: adesso + VALIDITA_MS });
    }
  } catch (eccezione) {
    // `risolvi` cattura già per conto suo: qui si arriva solo per un
    // guasto imprevisto, e va detto senza fermare il giro.
    console.error("[rete-inversa] risoluzione fallita:", eccezione);
  }

  pota(cache);
  return lotto.length;
}

/** Quanti indirizzi aspettano un verdetto: lo dichiara il pannello. */
export function inAttesaDiRisoluzione(): number {
  return deposito().coda.size;
}
