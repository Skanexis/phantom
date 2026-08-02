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
export function ipClient(intestazioni: Headers): string {
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
