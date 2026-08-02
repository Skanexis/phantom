/**
 * Riconoscimento delle richieste palesemente ostili.
 *
 * Una premessa, perché altrimenti questo file sembra ciò che non è: non è
 * un filtro che protegge da SQL injection o da XSS. Da quelli protegge
 * l'architettura — le interrogazioni passano tutte dal query builder di
 * Prisma, che parametrizza, e React scrive il testo come testo. Un elenco
 * di stringhe proibite come difesa primaria è una cattiva idea: si aggira
 * con una codifica diversa, e dà l'illusione di poter abbassare la guardia
 * altrove.
 *
 * Serve a un'altra cosa, che nessun controllo a valle può fare: accorgersi
 * che qualcuno *ci sta provando*. Un `UNION SELECT` in un parametro non
 * arriva per sbaglio. Non fa danni, viene ignorato dallo strato dati e non
 * lascia traccia da nessuna parte — e senza questo file il pannello non
 * saprebbe mai distinguere un visitatore da qualcuno che sta sondando le
 * difese per mezz'ora prima di trovare qualcosa di meglio.
 *
 * L'aggressività è tarata su questo sito: gli indirizzi veri sono pochi e
 * regolari (/admin, /richiesta, /api/...), i parametri sono identificativi
 * e cursori. Nessuna pagina accetta HTML, percorsi di file o espressioni.
 * Su un sito con una ricerca testuale libera, metà di queste regole
 * andrebbe tolta.
 */

export type Anomalia = {
  /** Nome della famiglia, per il pannello. */
  categoria: string;
  /** Il frammento che ha fatto scattare la regola, già accorciato. */
  prova: string;
};

type Regola = { categoria: string; schema: RegExp };

const REGOLE: Regola[] = [
  {
    // Risalita di directory, nelle forme più comuni di codifica.
    categoria: "attraversamento",
    schema: /(\.\.\/|\.\.\\|%2e%2e|\.\.%2f|%252e%252e)/i,
  },
  {
    // Il byte nullo tronca le stringhe in molti linguaggi: non esiste
    // ragione legittima per inviarlo in un URL.
    categoria: "byte nullo",
    schema: /(%00|\x00)/,
  },
  {
    categoria: "sql",
    schema:
      /(union[\s+]+select|select[\s+]+.*[\s+]+from[\s+]|insert[\s+]+into[\s+]|drop[\s+]+table|;[\s+]*--|'[\s+]*or[\s+]+'?1'?[\s+]*=|sleep\s*\(|benchmark\s*\(|pg_sleep\s*\()/i,
  },
  {
    categoria: "script",
    schema: /(<script|javascript:|onerror\s*=|onload\s*=|<iframe|%3cscript)/i,
  },
  {
    // Espressioni di template: bersaglio dei motori lato server.
    categoria: "template",
    schema: /(\$\{|\{\{.*\}\}|<%=)/,
  },
  {
    // Concatenazione di comandi verso una shell.
    categoria: "comando",
    schema: /(;\s*(cat|ls|wget|curl|nc|sh|bash)\s|\|\s*(nc|sh|bash)\s|\$\(.*\))/i,
  },
  {
    // File di configurazione e chiavi cercati per nome dentro il percorso.
    categoria: "segreti",
    schema: /(id_rsa|\.ssh\/|\.aws\/|credentials|\.htpasswd|web\.config)/i,
  },
];

/**
 * Lunghezza oltre la quale un indirizzo non è più plausibile.
 *
 * Le rotte di questo sito, cursori compresi, stanno abbondantemente sotto:
 * un URL da mezzo kilobyte è un tentativo di riempire qualcosa, non una
 * navigazione.
 */
const LUNGHEZZA_SOSPETTA = 512;

/**
 * Esamina percorso e query di una richiesta.
 *
 * Riceve la stringa già decodificata quando possibile: `%3cscript` e
 * `<script` sono lo stesso tentativo scritto in due modi, e controllare
 * solo la forma grezza lascerebbe passare la prima. La decodifica può
 * fallire su sequenze malformate — che a loro volta sono un segnale — e in
 * quel caso si esamina l'originale.
 */
export function esaminaUrl(percorso: string, query: string): Anomalia | null {
  const grezzo = `${percorso}${query}`;

  if (grezzo.length > LUNGHEZZA_SOSPETTA) {
    return {
      categoria: "url abnorme",
      prova: `${grezzo.length} caratteri`,
    };
  }

  let decodificato = grezzo;
  try {
    decodificato = decodeURIComponent(grezzo);
  } catch {
    // Percentuale malformata: resta il grezzo, e la cosa è già di per sé
    // un indizio — nessun browser produce sequenze non valide.
  }

  for (const regola of REGOLE) {
    const trovato = regola.schema.exec(decodificato) ?? regola.schema.exec(grezzo);
    if (trovato) {
      return {
        categoria: regola.categoria,
        prova: trovato[0].slice(0, 80),
      };
    }
  }

  return null;
}
