/**
 * Formati per i numeri che si leggono di sfuggita.
 *
 * Sta a parte perché lo usano più schede del pannello, e due copie della
 * stessa regola divergono alla prima modifica: una scheda che scrive 12,5k
 * accanto a un'altra che scrive 12.480 fa dubitare che siano lo stesso dato.
 */

/**
 * Numeri grandi resi corti: 12.480 diventa 12,5k.
 *
 * Su una piastrella larga mezzo schermo di telefono, sette cifre e due
 * separatori non ci stanno: o rimpiccioliscono fino a non leggersi, o
 * escono dal riquadro. Il valore esatto non si perde — resta nel titolo
 * dell'elemento, dove lo trova chi lo cerca — ma la cifra che si legge di
 * sfuggita dev'essere corta.
 *
 * La soglia è diecimila e non mille: sotto, il numero per esteso sta
 * comodo e dice di più (`8.400` è più informativo di `8,4k`).
 */
export function compatta(valore: number): string {
  if (Math.abs(valore) < 10_000) return valore.toLocaleString("it-IT");
  if (Math.abs(valore) < 1_000_000) {
    return `${(valore / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k`;
  }
  return `${(valore / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}M`;
}

/** Migliaia separate: 12480 diventa illeggibile in una griglia di numeri. */
export function cifra(valore: number): string {
  return valore.toLocaleString("it-IT");
}
