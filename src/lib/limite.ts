/**
 * Limite di frequenza a finestra fissa, tenuto in memoria.
 *
 * Perché in memoria e non in Redis: PM2 avvia una sola istanza in fork
 * (vedi ecosystem.config.js, dove la scelta è spiegata per il bus degli
 * eventi). Con un processo solo la mappa è la verità completa. Passando a
 * più istanze questi contatori si sdoppiano e il limite effettivo diventa
 * il valore moltiplicato per il numero di worker: a quel punto va spostato
 * su uno store condiviso, insieme al bus.
 *
 * Nginx applica già un limite sugli endpoint di autenticazione, ma lavora
 * solo per IP e non sa chi è collegato. Qui si può limitare per utente,
 * che è ciò che serve contro l'abuso fatto da un account autenticato.
 */

type Voce = { conteggio: number; scadenza: number };

/**
 * Lo stato sta su globalThis, non in una const di modulo.
 *
 * Il proxy e le rotte finiscono in bundle separati: `new Map()` a livello
 * di modulo verrebbe eseguito una volta per bundle e i due lati
 * conterebbero su mappe diverse. Finché le chiavi dei due lati non si
 * incrociano il difetto non si vede, ed è proprio per questo che conviene
 * toglierlo di mezzo adesso invece di scoprirlo il giorno in cui un limite
 * viene condiviso e conta la metà di quel che dovrebbe.
 */
type Deposito = { contatori: Map<string, Voce>; aperte: Map<string, number> };

function deposito(): Deposito {
  const globale = globalThis as unknown as { __limiti?: Deposito };
  globale.__limiti ??= { contatori: new Map(), aperte: new Map() };
  return globale.__limiti;
}

/**
 * La mappa cresce di una voce per chiave vista: senza potatura, un attacco
 * distribuito la farebbe gonfiare fino a esaurire la memoria — il limite
 * stesso diventerebbe il modo per far cadere il processo. La pulizia gira
 * quando la mappa supera la soglia, non a ogni chiamata.
 */
const SOGLIA_PULIZIA = 10_000;

function potaScaduti(contatori: Map<string, Voce>, adesso: number) {
  for (const [chiave, voce] of contatori) {
    if (voce.scadenza < adesso) contatori.delete(chiave);
  }
}

export type EsitoLimite = {
  /** Vero quando la richiesta va respinta. */
  superato: boolean;
  /** Secondi da attendere prima di riprovare, per l'intestazione Retry-After. */
  attesaSecondi: number;
};

/**
 * Registra un tentativo e dice se il limite è stato superato.
 *
 * @param chiave  Ambito del conteggio: va sempre composta con il nome
 *                dell'operazione, così due endpoint diversi non si
 *                consumano a vicenda lo stesso budget.
 * @param massimo Tentativi consentiti nella finestra.
 * @param finestraMs Durata della finestra.
 */
export function registraTentativo(
  chiave: string,
  massimo: number,
  finestraMs: number,
): EsitoLimite {
  const adesso = Date.now();
  const { contatori } = deposito();

  if (contatori.size > SOGLIA_PULIZIA) potaScaduti(contatori, adesso);

  const voce = contatori.get(chiave);

  if (!voce || voce.scadenza < adesso) {
    contatori.set(chiave, { conteggio: 1, scadenza: adesso + finestraMs });
    return { superato: false, attesaSecondi: 0 };
  }

  voce.conteggio += 1;

  if (voce.conteggio > massimo) {
    return {
      superato: true,
      attesaSecondi: Math.max(1, Math.ceil((voce.scadenza - adesso) / 1000)),
    };
  }

  return { superato: false, attesaSecondi: 0 };
}

/** Azzera il conteggio: si chiama dopo un tentativo andato a buon fine. */
export function azzeraLimite(chiave: string) {
  deposito().contatori.delete(chiave);
}

/**
 * Conteggio di risorse aperte contemporaneamente (non di tentativi nel
 * tempo). Serve per il flusso SSE, dove il problema non è la frequenza
 * delle richieste ma quante connessioni restano appese insieme.
 */
export function apri(chiave: string, massimo: number): boolean {
  const { aperte } = deposito();
  const attuali = aperte.get(chiave) ?? 0;
  if (attuali >= massimo) return false;
  aperte.set(chiave, attuali + 1);
  return true;
}

export function chiudi(chiave: string) {
  const { aperte } = deposito();
  const attuali = aperte.get(chiave) ?? 0;
  // Cancellare la voce a zero evita che la mappa conservi una riga per
  // ogni utente che si è collegato almeno una volta.
  if (attuali <= 1) aperte.delete(chiave);
  else aperte.set(chiave, attuali - 1);
}

/**
 * Fotografia delle connessioni aperte, per il pannello di sorveglianza.
 *
 * Le due cifre rispondono a domande diverse e vanno lette insieme:
 * `connessioni` è il carico sul processo, `soggetti` è quante persone
 * sono davvero collegate in questo momento. Una sola persona con sei
 * schede aperte pesa come sei, ma resta una — e vederle confuse in un
 * numero solo farebbe sembrare affollato un sito vuoto.
 */
export function statoFlussi(prefisso = "flusso:") {
  let connessioni = 0;
  let soggetti = 0;
  let massimoSingolo = 0;

  for (const [chiave, valore] of deposito().aperte) {
    if (!chiave.startsWith(prefisso)) continue;
    soggetti += 1;
    connessioni += valore;
    if (valore > massimoSingolo) massimoSingolo = valore;
  }

  return { connessioni, soggetti, massimoSingolo };
}
