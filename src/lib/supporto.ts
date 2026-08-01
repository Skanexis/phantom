/**
 * I tre tipi di richiesta di supporto, in un solo posto: li usano sia il
 * selettore nel modulo sia i badge in area personale e in admin, così
 * colore, icona e testo restano sempre uno specchio degli altri.
 */
export const TIPI_SUPPORTO = [
  {
    valore: "PROBLEMA",
    etichetta: "Problema",
    descrizione: "Qualcosa non funziona come dovrebbe",
    icona: "problema",
    colore: "var(--allarme)",
  },
  {
    valore: "DOMANDA",
    etichetta: "Domanda",
    descrizione: "Ti serve un chiarimento",
    icona: "domanda",
    colore: "var(--info)",
  },
  {
    valore: "MIGLIORAMENTO",
    etichetta: "Miglioramento",
    descrizione: "Un'idea per fare meglio",
    icona: "miglioramento",
    colore: "var(--ok)",
  },
] as const;

export type TipoSupportoValore = (typeof TIPI_SUPPORTO)[number]["valore"];

export function vociTipoSupporto(valore: string | null | undefined) {
  return TIPI_SUPPORTO.find((v) => v.valore === valore) ?? null;
}
