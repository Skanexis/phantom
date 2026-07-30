import Link from "next/link";

/* Primitive del sistema brutalista: bordi netti, monospace, zero arrotondamenti. */

export function Etichetta({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`etichetta ${className}`}>{children}</span>;
}

/** Intestazione di sezione numerata, come in un documento tecnico. */
export function TitoloSezione({
  numero,
  titolo,
  descrizione,
}: {
  numero: string;
  titolo: string;
  descrizione?: string;
}) {
  return (
    <div className="border-t border-[var(--bordo)] pt-5">
      <div className="flex items-baseline gap-4">
        <Etichetta className="text-[var(--accento)]">{numero}</Etichetta>
        <div className="h-px flex-1 bg-[var(--bordo)]" />
      </div>
      <h2 className="display mt-5 text-[32px] sm:text-[52px]">{titolo}</h2>
      {descrizione && (
        <p className="mono mt-4 max-w-xl text-[13px] leading-[1.7] text-[var(--testo-tenue)]">
          {descrizione}
        </p>
      )}
    </div>
  );
}

type ProprietaBottone = {
  children: React.ReactNode;
  className?: string;
};

const baseBottone =
  "mono inline-flex items-center justify-center gap-2 border px-6 py-3.5 text-[12px] uppercase tracking-[0.14em] transition-all duration-150";

/** Azione primaria: blocco pieno ad alto contrasto. */
export function BottonePieno({
  children,
  href,
  className = "",
}: ProprietaBottone & { href: string }) {
  return (
    <Link
      href={href}
      className={`${baseBottone} spinta border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] font-semibold text-[var(--testo-inverso)] ${className}`}
    >
      {children}
    </Link>
  );
}

/** Azione secondaria: solo contorno. */
export function BottoneVuoto({
  children,
  href,
  className = "",
}: ProprietaBottone & { href: string }) {
  return (
    <Link
      href={href}
      className={`${baseBottone} spinta border-[var(--bordo)] text-[var(--testo)] ${className}`}
    >
      {children}
    </Link>
  );
}

/** Riquadro base con crocini opzionali agli angoli. */
export function Riquadro({
  children,
  className = "",
  marcato = false,
}: {
  children: React.ReactNode;
  className?: string;
  marcato?: boolean;
}) {
  return (
    <div
      className={`riquadro relative ${marcato ? "crocini" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** Riga di dati: chiave a sinistra, valore a destra, separatore puntinato. */
export function RigaDato({
  chiave,
  valore,
}: {
  chiave: string;
  valore: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <span className="mono shrink-0 text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
        {chiave}
      </span>
      <span
        aria-hidden="true"
        className="h-px min-w-4 flex-1 self-center border-b border-dashed border-[var(--bordo)]"
      />
      <span className="mono shrink-0 text-[12px] text-[var(--testo)]">
        {valore}
      </span>
    </div>
  );
}

/** Freccia tecnica, usata come indicatore direzionale. */
export function Freccia({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M2 8h12M9 3l5 5-5 5" />
    </svg>
  );
}
