/**
 * Riscontro globale durante il caricamento di qualunque pagina dinamica.
 *
 * Senza, una navigazione lenta lasciava la pagina precedente ferma e poi
 * sostituiva tutto di scatto: sembrava un blocco, non un caricamento. Il
 * marchio pulsante compare solo dopo un attimo (vedi .marchio-caricamento
 * in globals.css), così le navigazioni rapide restano istantanee e non
 * lampeggiano.
 */
export default function Caricamento() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center py-24">
      <span
        aria-hidden="true"
        className="marchio-caricamento mono flex h-10 w-10 items-center justify-center bg-[var(--accento)] text-[16px] font-bold text-[var(--accento-testo)]"
      >
        P
      </span>
      <span className="sr-only">Caricamento…</span>
    </div>
  );
}
