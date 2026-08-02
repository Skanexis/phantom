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
 * Quanti indirizzi nuovi risolvere per ogni apertura del pannello.
 *
 * Un tetto e non "tutti quelli che mancano": sotto una raffica da mille
 * sorgenti, la prima apertura del pannello lancerebbe mille risoluzioni
 * insieme — il monitoraggio che diventa esso stesso un carico, proprio nel
 * momento peggiore. A dodici per giro, cinque secondi l'uno, gli indirizzi
 * che contano si popolano in una manciata di aggiornamenti.
 */
const NUOVI_PER_GIRO = 12;

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

type Deposito = { cache: Map<string, Voce> };

function deposito(): Deposito {
  const globale = globalThis as unknown as { __reteInversa?: Deposito };
  globale.__reteInversa ??= { cache: new Map() };
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
 * Classifica gli indirizzi indicati, usando la cache dove possibile.
 *
 * Restituisce solo ciò che è già noto più i pochi risolti in questo giro:
 * gli altri compaiono senza verdetto, e il pannello li mostra come tali.
 */
export async function classificaIndirizzi(
  indirizzi: string[],
): Promise<Record<string, SchedaRete>> {
  const { cache } = deposito();
  const adesso = Date.now();
  const esito: Record<string, SchedaRete> = {};

  const daRisolvere: string[] = [];

  for (const ip of new Set(indirizzi)) {
    const voce = cache.get(ip);
    if (voce && voce.scadenza > adesso) {
      esito[ip] = { ptr: voce.ptr, hosting: voce.hosting, locale: voce.locale };
      continue;
    }
    if (daRisolvere.length < NUOVI_PER_GIRO) daRisolvere.push(ip);
  }

  const risolti = await Promise.all(
    daRisolvere.map(async (ip) => [ip, await risolvi(ip)] as const),
  );

  for (const [ip, scheda] of risolti) {
    cache.set(ip, { ...scheda, scadenza: adesso + VALIDITA_MS });
    esito[ip] = scheda;
  }

  pota(cache);

  return esito;
}
