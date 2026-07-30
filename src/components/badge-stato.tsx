import {
  etichetteStato,
  etichetteStatoAbbonamento,
} from "@/lib/telegram-bot";

/* Stato reso con un quadrato colorato + testo mono: nessun riempimento morbido. */
const colori: Record<string, string> = {
  NUOVA: "var(--accento)",
  IN_LAVORAZIONE: "var(--accento)",
  IN_ATTESA_CLIENTE: "var(--testo-tenue)",
  COMPLETATA: "var(--ok)",
  ANNULLATA: "var(--testo-debole)",
  IN_ATTESA: "var(--accento)",
  ATTIVO: "var(--ok)",
  SOSPESO: "var(--allarme)",
  SCADUTO: "var(--testo-debole)",
  ANNULLATO: "var(--testo-debole)",
};

export function BadgeStato({
  stato,
  tipo = "richiesta",
}: {
  stato: string;
  tipo?: "richiesta" | "abbonamento";
}) {
  const etichetta =
    tipo === "abbonamento"
      ? (etichetteStatoAbbonamento[stato] ?? stato)
      : (etichetteStato[stato] ?? stato);

  return (
    <span className="mono inline-flex shrink-0 items-center gap-2 border border-[var(--bordo)] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--testo-tenue)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5"
        style={{ background: colori[stato] ?? colori.ANNULLATA }}
      />
      {etichetta}
    </span>
  );
}
