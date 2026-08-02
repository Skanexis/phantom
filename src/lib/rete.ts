/**
 * Identità di chi chiama: indirizzo IP e origine della richiesta.
 *
 * Il modulo non importa nulla da Node: gira anche nel runtime edge, dove
 * vive il middleware. Tenerlo puro permette di usare le stesse regole nel
 * perimetro e dentro le singole rotte, senza due implementazioni che con
 * il tempo divergono.
 */

/**
 * IP reale del client, dietro il proxy.
 *
 * L'ordine dei tentativi non è casuale ed è la parte che si sbaglia più
 * spesso. `X-Forwarded-For` è una lista che il client può iniziare da solo:
 * Nginx la costruisce con `$proxy_add_x_forwarded_for`, che ACCODA
 * l'indirizzo vero a quanto è arrivato. Quindi la prima voce è scritta da
 * chi chiama e non vale niente — leggerla significa lasciare che un
 * attaccante cambi "identità" a ogni richiesta con una riga di curl,
 * azzerando qualunque limite per IP.
 *
 * `X-Real-IP` invece Nginx la SOVRASCRIVE con `$remote_addr`: è l'unica
 * voce di cui ci si può fidare. Si prova per prima; se manca si prende
 * l'ULTIMO elemento di X-Forwarded-For, che è quello aggiunto dal proxy.
 */
/**
 * Solo `get`: così la stessa funzione serve al middleware, che riceve
 * `Headers`, e alle pagine, che ricevono la versione di sola lettura
 * restituita da `headers()`. Chiedere `Headers` costringerebbe a una
 * conversione fittizia in uno dei due punti.
 */
export type IntestazioniLeggibili = { get(nome: string): string | null };

export function ipClient(intestazioni: IntestazioniLeggibili): string {
  const reale = intestazioni.get("x-real-ip")?.trim();
  if (reale) return reale;

  const catena = intestazioni.get("x-forwarded-for");
  if (catena) {
    const voci = catena
      .split(",")
      .map((voce) => voce.trim())
      .filter(Boolean);
    // L'ultimo hop è l'unico che non ha potuto scrivere il client.
    const ultimo = voci[voci.length - 1];
    if (ultimo) return ultimo;
  }

  return "sconosciuto";
}

/* -------------------------------- Sottoreti ------------------------------- */

/**
 * Prefissi ammessi per il bando di rete, per famiglia di indirizzi.
 *
 * L'elenco è chiuso, ed è la scelta su cui poggia tutto il resto.
 *
 * Un bando di rete si potrebbe esprimere con un CIDR qualunque, ma allora
 * verificarlo significherebbe, a ogni richiesta, confrontare l'indirizzo con
 * *ogni* CIDR in elenco: costo proporzionale al numero di bandi, pagato sul
 * percorso caldo, e crescente proprio mentre si sta bandendo di più. Fissando
 * i prefissi possibili, il bando si può conservare già normalizzato e la
 * verifica diventa una manciata di letture da un insieme — costo costante
 * qualunque sia il numero di provvedimenti in vigore.
 *
 * Il primo di ogni elenco è quello proposto dal pannello: /24 è la rete
 * assegnata a un singolo cliente da un provider, /48 l'allocazione tipica di
 * un sito su IPv6. I secondi sono il massimo consentito: più larghi di così
 * si chiude fuori un operatore intero.
 */
export const PREFISSI_SOTTORETE = {
  v4: [24, 16] as const,
  v6: [48, 32] as const,
};

/** Un IPv6 ha i due punti; un IPv4 no. Non serve altro per distinguerli. */
function eIpv6(ip: string) {
  return ip.includes(":");
}

/**
 * Espande la forma abbreviata di un IPv6 negli otto gruppi che la
 * compongono. `null` se l'indirizzo non ha una forma plausibile: qui non si
 * indovina, perché il risultato finisce in un elenco di blocco.
 */
function espandiIpv6(ip: string): number[] | null {
  // La coda in notazione IPv4 (::ffff:203.0.113.9) non serve a nulla qui:
  // quegli indirizzi sono IPv4 travestiti, e vanno trattati come tali.
  if (ip.includes(".")) return null;

  const puro = ip.split("%")[0].toLowerCase();
  const meta = puro.split("::");
  if (meta.length > 2) return null;

  const leggi = (parte: string) =>
    parte === "" ? [] : parte.split(":").map((gruppo) => parseInt(gruppo, 16));

  const testa = leggi(meta[0] ?? "");
  const coda = meta.length === 2 ? leggi(meta[1]) : [];
  if ([...testa, ...coda].some((valore) => !Number.isInteger(valore))) {
    return null;
  }

  if (meta.length === 1) return testa.length === 8 ? testa : null;

  const mancanti = 8 - testa.length - coda.length;
  if (mancanti < 1) return null;
  return [...testa, ...Array(mancanti).fill(0), ...coda];
}

/**
 * La sottorete a cui appartiene l'indirizzo, in forma CIDR normalizzata.
 *
 * Restituisce `null` per gli indirizzi che non hanno una rete di
 * appartenenza sensata — "sconosciuto", forme malformate — invece di
 * inventarne una: un bando su una rete dedotta da un indirizzo che non si è
 * saputo leggere colpirebbe a caso.
 *
 * Sta sul percorso di ogni richiesta: nessuna espressione regolare, nessun
 * BigInt, solo aritmetica su interi piccoli.
 */
export function sottorete(ip: string, prefisso?: number): string | null {
  if (!ip || ip === "sconosciuto") return null;

  if (eIpv6(ip)) {
    const gruppi = espandiIpv6(ip);
    if (!gruppi) return null;

    const bit = prefisso ?? PREFISSI_SOTTORETE.v6[0];
    if (bit < 1 || bit > 128) return null;

    // Si lavora per gruppi da sedici bit: interi, quanti ne copre il
    // prefisso; poi al massimo uno da mascherare a metà.
    const interi = Math.floor(bit / 16);
    const resto = bit % 16;
    const mantenuti = gruppi.slice(0, interi);
    if (resto > 0) {
      const maschera = (0xffff << (16 - resto)) & 0xffff;
      mantenuti.push(gruppi[interi] & maschera);
    }

    const testa = mantenuti.map((gruppo) => gruppo.toString(16)).join(":");
    // "::" finale: la parte azzerata resta esplicitamente azzerata, così la
    // stringa è confrontabile carattere per carattere.
    return `${testa}::/${bit}`;
  }

  const ottetti = ip.split(".");
  if (ottetti.length !== 4) return null;

  const valori = ottetti.map((parte) => Number(parte));
  if (
    valori.some(
      (valore) => !Number.isInteger(valore) || valore < 0 || valore > 255,
    )
  ) {
    return null;
  }

  const bit = prefisso ?? PREFISSI_SOTTORETE.v4[0];
  if (bit < 1 || bit > 32) return null;

  // Operatori bit a bit su un intero a 32 bit con segno: `>>> 0` riporta il
  // risultato nel dominio senza segno prima di ricomporre gli ottetti.
  const numero =
    ((valori[0] << 24) | (valori[1] << 16) | (valori[2] << 8) | valori[3]) >>> 0;
  const maschera = bit === 32 ? 0xffffffff : (0xffffffff << (32 - bit)) >>> 0;
  const rete = (numero & maschera) >>> 0;

  const parti = [
    (rete >>> 24) & 255,
    (rete >>> 16) & 255,
    (rete >>> 8) & 255,
    rete & 255,
  ];

  return `${parti.join(".")}/${bit}`;
}

/**
 * Tutte le sottoreti a cui l'indirizzo appartiene, fra quelle bandibili.
 *
 * È ciò che il perimetro confronta con l'elenco delle esclusioni: due
 * letture da un insieme al massimo, invece di scorrere i provvedimenti.
 */
export function sottoretiDi(ip: string): string[] {
  if (!ip || ip === "sconosciuto") return [];
  const prefissi = eIpv6(ip)
    ? PREFISSI_SOTTORETE.v6
    : PREFISSI_SOTTORETE.v4;

  const esito: string[] = [];
  for (const bit of prefissi) {
    const rete = sottorete(ip, bit);
    if (rete) esito.push(rete);
  }
  return esito;
}

/**
 * Verifica che un CIDR sia una sottorete bandibile: forma valida, prefisso
 * fra quelli ammessi e già normalizzato. Serve a rifiutare all'ingresso —
 * con un messaggio — quello che altrimenti finirebbe in elenco senza
 * corrispondere mai a nessuno.
 */
export function sottoreteBandibile(valore: string): {
  valida: boolean;
  motivo?: string;
  normalizzata?: string;
} {
  const taglio = valore.indexOf("/");
  if (taglio < 0) return { valida: false, motivo: "Manca il prefisso (/24)." };

  const indirizzo = valore.slice(0, taglio);
  const bit = Number(valore.slice(taglio + 1));
  if (!Number.isInteger(bit)) {
    return { valida: false, motivo: "Prefisso non numerico." };
  }

  const ammessi: readonly number[] = eIpv6(indirizzo)
    ? PREFISSI_SOTTORETE.v6
    : PREFISSI_SOTTORETE.v4;

  if (!ammessi.includes(bit)) {
    return {
      valida: false,
      motivo: `Prefisso non ammesso: solo /${ammessi.join(" o /")}. Più largo chiuderebbe fuori un operatore intero.`,
    };
  }

  const normalizzata = sottorete(indirizzo, bit);
  if (!normalizzata) return { valida: false, motivo: "Indirizzo illeggibile." };

  return { valida: true, normalizzata };
}

/** Metodi che modificano lo stato e vanno protetti dalle chiamate esterne. */
const METODI_MUTANTI = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function eMutante(metodo: string) {
  return METODI_MUTANTI.has(metodo.toUpperCase());
}

/**
 * Host di cui ci si fida, letto dall'intestazione Host che Nginx riscrive
 * con `$host`. In sviluppo il server risponde direttamente e l'Host è
 * quello del browser: in entrambi i casi è il nome con cui il sito è stato
 * raggiunto, ed è esattamente quello che deve comparire nell'Origin.
 */
function hostAtteso(intestazioni: Headers): string | null {
  const host =
    intestazioni.get("x-forwarded-host") ?? intestazioni.get("host") ?? null;
  return host ? host.trim().toLowerCase() : null;
}

/**
 * Verifica che una richiesta che modifica dati arrivi davvero dal sito.
 *
 * Il cookie di sessione è `SameSite=Lax`, quindi il browser non lo allega
 * a una POST partita da un altro sito: la CSRF classica è già fuori gioco.
 * Questo controllo copre il caso diverso e più concreto — la chiamata
 * fatta a mano con curl, un client HTTP o uno script, dove il cookie viene
 * incollato dall'attaccante e SameSite non protegge nulla, perché non c'è
 * nessun browser ad applicarlo.
 *
 * Un browser mette sempre `Origin` sulle richieste non-GET. Chi non lo
 * manda, o ne manda uno diverso dal nostro host, non sta usando il sito:
 * viene respinto. È una barriera contro l'uso automatizzato dell'API, non
 * un segreto — chi vuole può copiare l'intestazione. Serve a rendere
 * l'abuso deliberato invece che banale, e a far fallire subito gli script
 * generici che sondano gli endpoint.
 */
export function origineValida(richiesta: Request): boolean {
  const origine = richiesta.headers.get("origin");
  const atteso = hostAtteso(richiesta.headers);
  if (!origine || !atteso) return false;

  try {
    return new URL(origine).host.toLowerCase() === atteso;
  } catch {
    // Origin malformato: non è un browser.
    return false;
  }
}
