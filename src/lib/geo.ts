/**
 * Provenienza geografica di una richiesta.
 *
 * Il modulo è puro e senza dipendenze: gira nel perimetro, quindi non può
 * interrogare nulla. Il paese non si *calcola* qui — si legge da
 * un'intestazione che deve mettere chi sta davanti (Nginx con GeoIP2, o
 * Cloudflare). È una scelta deliberata: l'alternativa sarebbe una chiamata
 * di rete per richiesta, cioè far dipendere il tempo di risposta del sito
 * da un servizio esterno proprio sul percorso che deve restare più veloce.
 *
 * Se nessuno popola l'intestazione, il paese resta ignoto e il pannello lo
 * dice. Non c'è nessuna stima di ripiego: una bandiera sbagliata in un
 * pannello con cui si decide chi bloccare è peggio di nessuna bandiera.
 *
 * Per accenderlo su questo server, in `deploy/nginx.conf`:
 *
 *     # richiede il modulo ngx_http_geoip2_module e il database GeoLite2
 *     geoip2 /usr/share/GeoIP/GeoLite2-Country.mmdb {
 *         $geoip2_paese country iso_code;
 *     }
 *     proxy_set_header X-Geo-Country $geoip2_paese;
 */

/**
 * Intestazioni note, in ordine di fiducia. Vengono tutte da chi fa da
 * proxy: Nginx le sovrascrive, quindi un client non può falsificarle —
 * vale la stessa logica per cui `ipClient` si fida di X-Real-IP e non di
 * X-Forwarded-For.
 */
const INTESTAZIONI_PAESE = [
  "cf-ipcountry",
  "x-geo-country",
  "x-vercel-ip-country",
];

/** Codice ISO 3166-1 alpha-2, o null. */
export function paeseDaIntestazioni(intestazioni: Headers): string | null {
  for (const nome of INTESTAZIONI_PAESE) {
    const valore = intestazioni.get(nome)?.trim().toUpperCase();
    // "XX" e "T1" sono i valori che Cloudflare usa per "sconosciuto" e per
    // il traffico Tor: nessuno dei due è un paese.
    if (valore && /^[A-Z]{2}$/.test(valore) && valore !== "XX") return valore;
  }
  return null;
}

/**
 * Sigla del paese, in due lettere. Non una bandiera.
 *
 * Le bandiere emoji sembravano la scelta ovvia e sono risultate la
 * peggiore per tre motivi che si vedono solo all'uso. Sono minuscole in un
 * elenco a corpo dieci; su Windows non esistono affatto — il sistema non
 * ha i glifi e disegna due lettere in un riquadro, o niente; e soprattutto
 * quando il paese è ignoto la bandiera bianca è indistinguibile da una
 * bandiera vera vista di sfuggita, quindi il pannello sembra funzionare
 * mentre non sta dicendo nulla.
 *
 * Due lettere si leggono ovunque, si allineano in colonna e quando manca
 * il dato dicono "??", che è un'informazione invece di un'ambiguità.
 */
export function siglaPaese(codice: string | null | undefined): string {
  if (!codice || !/^[A-Z]{2}$/.test(codice)) return "??";
  return codice;
}

/**
 * Nomi dei paesi che compaiono di più, per la sola etichetta di
 * accessibilità: una bandiera senza testo è invisibile a chi usa un lettore
 * di schermo, e un elenco completo di duecento voci non vale il peso.
 */
const NOMI: Record<string, string> = {
  IT: "Italia",
  RU: "Russia",
  UA: "Ucraina",
  DE: "Germania",
  FR: "Francia",
  ES: "Spagna",
  GB: "Regno Unito",
  US: "Stati Uniti",
  NL: "Paesi Bassi",
  PL: "Polonia",
  RO: "Romania",
  CH: "Svizzera",
  AT: "Austria",
  CN: "Cina",
  IN: "India",
  BR: "Brasile",
  TR: "Turchia",
  SG: "Singapore",
  HK: "Hong Kong",
  CA: "Canada",
};

export function nomePaese(codice: string | null | undefined): string {
  if (!codice) return "provenienza sconosciuta";
  return NOMI[codice] ?? codice;
}
