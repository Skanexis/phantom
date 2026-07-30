import crypto from "node:crypto";

/**
 * Codici brevi per richieste e abbonamenti: "R-4F2A" si detta al telefono,
 * si cerca a colpo d'occhio in una lista e sta nell'oggetto di un messaggio.
 * Un cuid da 25 caratteri non fa nessuna di queste cose.
 */

/**
 * Alfabeto senza 0/O, 1/I/L, 5/S, 8/B: sono le coppie che si confondono
 * leggendo ad alta voce o trascrivendo un codice visto di sfuggita.
 */
const ALFABETO = "234679ACDEFGHJKMNPQRTUVWXYZ";

/** Prefisso per tipo, così il codice dice da solo a cosa si riferisce. */
export const PREFISSO_RICHIESTA = "R";
export const PREFISSO_ABBONAMENTO = "S";

const LUNGHEZZA = 4;

/**
 * Genera un codice casuale. `crypto` invece di Math.random: i codici
 * finiscono nelle notifiche e non devono essere indovinabili in sequenza.
 */
export function generaCodice(prefisso: string) {
  const byte = crypto.randomBytes(LUNGHEZZA);
  let corpo = "";
  for (let i = 0; i < LUNGHEZZA; i += 1) {
    corpo += ALFABETO[byte[i] % ALFABETO.length];
  }
  return `${prefisso}-${corpo}`;
}

/**
 * Genera un codice non ancora presente. Con 27^4 (≈531 mila) combinazioni
 * la collisione è rara ma possibile: senza questo controllo il vincolo di
 * unicità farebbe fallire l'inserimento davanti all'utente.
 */
export async function codiceUnico(
  prefisso: string,
  esiste: (codice: string) => Promise<boolean>,
) {
  for (let tentativo = 0; tentativo < 8; tentativo += 1) {
    const codice = generaCodice(prefisso);
    if (!(await esiste(codice))) return codice;
  }
  // Dopo otto collisioni allungo invece di arrendermi: meglio un codice
  // di cinque caratteri che un errore di salvataggio.
  return `${generaCodice(prefisso)}${ALFABETO[crypto.randomBytes(1)[0] % ALFABETO.length]}`;
}
