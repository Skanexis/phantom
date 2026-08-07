/**
 * Riconoscimento dell'operatore a cui appartiene un indirizzo.
 *
 * Nasce da un caso concreto. Lo stesso scanner ha bussato quattro volte in
 * otto ore chiedendo `/wp-admin/install.php`, ogni volta da una sottorete
 * diversa: 104.23.170.x, 104.23.221.x, 172.71.172.x, 162.158.111.x. Sembrano
 * quattro attaccanti; sono tutti e quattro Cloudflare, cioè lo stesso
 * scanner che passa da un CDN per non mostrare il proprio indirizzo.
 *
 * La differenza è operativa, non accademica. Su un indirizzo di datacenter
 * il bando della sottorete funziona: quella macchina sta lì. Su un indirizzo
 * di Cloudflare non funziona affatto — si bandisce una fetta di CDN, lo
 * scanner ricompare da un altro indirizzo entro poche ore, e il giorno in
 * cui si decidesse di mettere il sito dietro Cloudflare quei bandi
 * sparerebbero sui piedi. Il pannello deve dirlo prima che qualcuno prema
 * il pulsante, non dopo.
 *
 * ---
 *
 * Onestà su cosa questo modulo è e non è.
 *
 * È una tabella scritta a mano, quindi **parziale e destinata a invecchiare**.
 * Copre gli operatori da cui arriva davvero il traffico automatico, non
 * tutta internet: un indirizzo non riconosciuto non è "residenziale", è solo
 * "non in tabella". Per questo il verdetto si presenta come indizio accanto
 * all'indirizzo, mai come motivo di un blocco automatico.
 *
 * Perché una tabella invece di un servizio esterno. Interrogare un'API di
 * geolocalizzazione o WHOIS a ogni aggiornamento del pannello significa
 * legare la nostra schermata alla disponibilità di qualcun altro, e
 * spedirgli l'elenco degli indirizzi dei nostri visitatori. Una tabella
 * costa qualche decina di confronti fra interi e non esce dalla macchina.
 *
 * Si affianca a `rete-inversa.ts`, che risolve il nome inverso: quello sa
 * riconoscere macchine a noleggio che qui non ci sono, ma richiede una
 * chiamata DNS e non dice il nome dell'operatore. I due si completano — qui
 * la certezza sugli intervalli noti, là l'euristica su tutto il resto.
 */

export type GenereRete = "cdn" | "cloud" | "vpn";

export type OperatoreRete = {
  nome: string;
  genere: GenereRete;
};

/**
 * Perché il genere conta più del nome.
 *
 * - `cdn`: l'indirizzo non è di chi bussa, è del servizio che sta in mezzo.
 *   Bandire la rete colpisce il CDN, non l'attaccante.
 * - `cloud`: una macchina a noleggio. Chi la usa la tiene finché serve,
 *   quindi il bando dell'indirizzo o della sottorete ha effetto reale.
 * - `vpn`: uscita di un servizio commerciale. Sta in mezzo come un CDN, ma
 *   dietro c'è una persona che ha scelto di nascondersi.
 */
type Voce = { rete: string; operatore: OperatoreRete };

/**
 * Intervalli IPv4.
 *
 * Cloudflare è l'elenco pubblicato dall'operatore ed è quello di cui questo
 * modulo ha più bisogno: è stabile, corto, e copre il caso che ci ha fatto
 * scrivere il file. Gli altri sono i blocchi principali da cui arriva il
 * traffico automatico — volutamente pochi e larghi: meglio riconoscere il
 * novanta per cento con dieci righe che inseguire il cento per cento con
 * mille righe che nessuno terrà aggiornate.
 */
const IPV4: Voce[] = [
  // --- Cloudflare (elenco ufficiale) ---
  ...[
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ].map((rete) => ({
    rete,
    operatore: { nome: "Cloudflare", genere: "cdn" as const },
  })),

  // --- Microsoft Azure ---
  // 4.0.0.0/8 è passato a Microsoft: è da lì che è arrivata la raffica di
  // dodici percorsi PHP in due secondi del 5 agosto.
  ...["4.0.0.0/8", "13.64.0.0/11", "20.0.0.0/8", "40.64.0.0/10", "52.224.0.0/11", "104.40.0.0/13"].map(
    (rete) => ({
      rete,
      operatore: { nome: "Microsoft Azure", genere: "cloud" as const },
    }),
  ),

  // --- Amazon AWS ---
  ...["3.0.0.0/8", "13.32.0.0/15", "18.128.0.0/9", "34.192.0.0/10", "35.152.0.0/13", "52.0.0.0/11", "54.64.0.0/11"].map(
    (rete) => ({
      rete,
      operatore: { nome: "Amazon AWS", genere: "cloud" as const },
    }),
  ),

  // --- Google Cloud ---
  ...["34.64.0.0/10", "35.184.0.0/13", "104.196.0.0/14", "130.211.0.0/22"].map(
    (rete) => ({
      rete,
      operatore: { nome: "Google Cloud", genere: "cloud" as const },
    }),
  ),

  // --- Hetzner ---
  ...["5.9.0.0/16", "78.46.0.0/15", "88.198.0.0/16", "116.202.0.0/15", "135.181.0.0/16", "138.201.0.0/16", "144.76.0.0/16", "148.251.0.0/16", "157.90.0.0/16", "159.69.0.0/16", "162.55.0.0/16", "167.233.0.0/16", "168.119.0.0/16", "176.9.0.0/16", "178.63.0.0/16", "188.40.0.0/16", "195.201.0.0/16"].map(
    (rete) => ({
      rete,
      operatore: { nome: "Hetzner", genere: "cloud" as const },
    }),
  ),

  // --- DigitalOcean ---
  ...["104.131.0.0/16", "138.68.0.0/16", "139.59.0.0/16", "142.93.0.0/16", "143.110.0.0/16", "157.230.0.0/16", "159.65.0.0/16", "159.89.0.0/16", "161.35.0.0/16", "164.90.0.0/16", "165.22.0.0/16", "167.71.0.0/16", "167.99.0.0/16", "178.62.0.0/16", "188.166.0.0/16", "206.189.0.0/16", "209.97.0.0/16"].map(
    (rete) => ({
      rete,
      operatore: { nome: "DigitalOcean", genere: "cloud" as const },
    }),
  ),

  // --- OVH ---
  ...["51.68.0.0/14", "51.75.0.0/16", "51.77.0.0/16", "51.79.0.0/16", "51.83.0.0/16", "51.89.0.0/16", "51.91.0.0/16", "91.121.0.0/16", "137.74.0.0/16", "147.135.0.0/16", "151.80.0.0/16", "164.132.0.0/16", "167.114.0.0/16", "176.31.0.0/16", "178.32.0.0/15", "188.165.0.0/16", "192.99.0.0/16", "213.32.0.0/16"].map(
    (rete) => ({
      rete,
      operatore: { nome: "OVH", genere: "cloud" as const },
    }),
  ),

  // --- Vultr / Linode / Scaleway: i restanti abituali ---
  ...["45.32.0.0/16", "45.63.0.0/16", "45.76.0.0/16", "45.77.0.0/16", "95.179.128.0/17", "108.61.0.0/16", "140.82.0.0/18", "149.28.0.0/16", "155.138.128.0/17", "207.148.0.0/18", "216.128.128.0/17"].map(
    (rete) => ({ rete, operatore: { nome: "Vultr", genere: "cloud" as const } }),
  ),
  ...["45.33.0.0/16", "45.56.0.0/16", "45.79.0.0/16", "50.116.0.0/16", "139.162.0.0/16", "172.104.0.0/15", "173.255.192.0/18", "176.58.96.0/19", "178.79.128.0/18", "198.58.96.0/19"].map(
    (rete) => ({ rete, operatore: { nome: "Linode", genere: "cloud" as const } }),
  ),
  ...["51.15.0.0/16", "51.158.0.0/15", "163.172.0.0/16", "212.47.224.0/19"].map(
    (rete) => ({
      rete,
      operatore: { nome: "Scaleway", genere: "cloud" as const },
    }),
  ),

  // --- Rivenditori usati soprattutto per proxy e VPN ---
  ...["5.180.0.0/16", "77.83.0.0/16", "84.17.32.0/19", "138.199.0.0/16", "143.244.32.0/19", "185.156.172.0/22"].map(
    (rete) => ({
      rete,
      operatore: { nome: "Datapacket / M247", genere: "vpn" as const },
    }),
  ),
];

/** Prefissi IPv6, confrontati sui primi gruppi della forma normalizzata. */
const IPV6: { prefisso: string; operatore: OperatoreRete }[] = [
  ...["2400:cb00", "2606:4700", "2803:f800", "2405:b500", "2405:8100", "2a06:98c0", "2c0f:f248"].map(
    (prefisso) => ({
      prefisso,
      operatore: { nome: "Cloudflare", genere: "cdn" as const },
    }),
  ),
  { prefisso: "2600:1f", operatore: { nome: "Amazon AWS", genere: "cloud" } },
  { prefisso: "2a01:4f8", operatore: { nome: "Hetzner", genere: "cloud" } },
  { prefisso: "2a01:4f9", operatore: { nome: "Hetzner", genere: "cloud" } },
  { prefisso: "2a03:b0c0", operatore: { nome: "DigitalOcean", genere: "cloud" } },
  { prefisso: "2001:41d0", operatore: { nome: "OVH", genere: "cloud" } },
];

/* -------------------------------- Ricerca -------------------------------- */

/** Un intervallo compilato: base e maschera come interi a 32 bit. */
type Compilata = { base: number; maschera: number; operatore: OperatoreRete };

/**
 * La tabella si compila una volta sola, all'avvio.
 *
 * Il confronto diventa così due operazioni fra interi per riga. Rifarlo a
 * ogni ricerca significherebbe analizzare centocinquanta stringhe per ogni
 * indirizzo di ogni aggiornamento del pannello — lavoro ripetuto per
 * ottenere sempre lo stesso risultato.
 */
const COMPILATE: Compilata[] = IPV4.map(({ rete, operatore }) => {
  const [indirizzo, bit] = rete.split("/");
  const parti = indirizzo.split(".").map(Number);
  const numero =
    ((parti[0] << 24) | (parti[1] << 16) | (parti[2] << 8) | parti[3]) >>> 0;
  const lunghezza = Number(bit);
  const maschera =
    lunghezza === 0 ? 0 : (0xffffffff << (32 - lunghezza)) >>> 0;
  return { base: (numero & maschera) >>> 0, maschera, operatore };
});

function ipv4Numero(ip: string): number | null {
  const parti = ip.split(".");
  if (parti.length !== 4) return null;
  let numero = 0;
  for (const parte of parti) {
    const ottetto = Number(parte);
    if (!Number.isInteger(ottetto) || ottetto < 0 || ottetto > 255) return null;
    numero = (numero << 8) | ottetto;
  }
  return numero >>> 0;
}

/**
 * L'operatore a cui appartiene l'indirizzo, o `null` se non è in tabella.
 *
 * `null` significa "non lo so", non "è una persona a casa sua": vedi la
 * nota in testa al file.
 */
export function operatoreDi(ip: string): OperatoreRete | null {
  if (!ip || ip === "sconosciuto") return null;

  if (ip.includes(":")) {
    const normalizzato = ip.split("%")[0].toLowerCase();
    for (const { prefisso, operatore } of IPV6) {
      if (normalizzato.startsWith(`${prefisso}:`)) return operatore;
    }
    return null;
  }

  const numero = ipv4Numero(ip);
  if (numero === null) return null;

  for (const voce of COMPILATE) {
    if (((numero & voce.maschera) >>> 0) === voce.base) return voce.operatore;
  }
  return null;
}

/**
 * Il bando di rete ha senso su questo indirizzo?
 *
 * È la domanda che il pannello deve porsi al posto di chi lo usa, perché la
 * risposta sbagliata non si vede subito: si bandisce, sembra fatto, e lo
 * stesso scanner ricompare il giorno dopo da un indirizzo vicino.
 */
export function bandireLaReteHaSenso(ip: string): {
  sensato: boolean;
  motivo: string | null;
} {
  const operatore = operatoreDi(ip);

  if (operatore?.genere === "cdn") {
    return {
      sensato: false,
      motivo: `Questo è un indirizzo di ${operatore.nome}, non di chi ha bussato: il traffico ci passa attraverso. Bandire la rete colpisce il CDN, e la stessa richiesta tornerà da un altro suo indirizzo entro poche ore.`,
    };
  }

  if (operatore?.genere === "vpn") {
    return {
      sensato: false,
      motivo: `Uscita di ${operatore.nome}, un servizio di VPN o proxy: dietro possono esserci molte persone, e chi ha bussato ne cambia una a piacere.`,
    };
  }

  if (operatore?.genere === "cloud") {
    return {
      sensato: true,
      motivo: `Macchina a noleggio su ${operatore.nome}: qui il bando della sottorete morde davvero, perché chi la usa la tiene.`,
    };
  }

  return { sensato: true, motivo: null };
}
