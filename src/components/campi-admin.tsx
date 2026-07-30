const classiCampo =
  "mono w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-3.5 py-2.5 text-[12.5px] text-[var(--testo)] outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)]";

const classiEtichetta =
  "mono text-[10px] uppercase tracking-[0.14em] text-[var(--testo-debole)]";

export function Campo({
  etichetta,
  nome,
  valore,
  tipo = "text",
  step,
  placeholder,
  richiesto,
}: {
  etichetta: string;
  nome: string;
  valore?: string | null;
  tipo?: string;
  step?: string;
  placeholder?: string;
  richiesto?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={classiEtichetta}>{etichetta}</span>
      <input
        name={nome}
        type={tipo}
        step={step}
        required={richiesto}
        placeholder={placeholder}
        defaultValue={valore ?? ""}
        className={classiCampo}
      />
    </label>
  );
}

export function AreaTesto({
  etichetta,
  nome,
  valore,
  righe = 2,
  placeholder,
}: {
  etichetta: string;
  nome: string;
  valore?: string | null;
  righe?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={classiEtichetta}>{etichetta}</span>
      <textarea
        name={nome}
        rows={righe}
        placeholder={placeholder}
        defaultValue={valore ?? ""}
        className={`${classiCampo} resize-none leading-[1.65]`}
      />
    </label>
  );
}

export function Spunta({
  etichetta,
  nome,
  attivo,
}: {
  etichetta: string;
  nome: string;
  attivo: boolean;
}) {
  return (
    <label className="mono flex items-center gap-2 text-[12px] uppercase tracking-[0.08em]">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={attivo}
        className="h-3.5 w-3.5 accent-[var(--accento)]"
      />
      {etichetta}
    </label>
  );
}

export function BottoneSalva({ testo = "Salva" }: { testo?: string }) {
  return (
    <button
      type="submit"
      className="mono spinta border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)]"
    >
      {testo}
    </button>
  );
}

export function BottoneElimina({ testo = "Elimina" }: { testo?: string }) {
  return (
    <button
      type="submit"
      className="mono border border-[var(--bordo)] px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:border-[var(--allarme)] hover:text-[var(--allarme)]"
    >
      {testo}
    </button>
  );
}

export const iconeDisponibili = [
  "globe",
  "app",
  "bolt",
  "chat",
  "rocket",
  "sliders",
  "phone",
  "shield",
  "telegram",
  "mail",
  "code",
  "spark",
  "link",
];

export function SelettoreIcona({
  nome,
  valore,
}: {
  nome: string;
  valore: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={classiEtichetta}>Icona</span>
      <select name={nome} defaultValue={valore} className={classiCampo}>
        {iconeDisponibili.map((icona) => (
          <option key={icona} value={icona} className="bg-[var(--sfondo)]">
            {icona}
          </option>
        ))}
      </select>
    </label>
  );
}

export const classiSelettore = classiCampo;
