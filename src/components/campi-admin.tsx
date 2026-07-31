/**
 * text-base (16px) sotto sm: iOS Safari ingrandisce automaticamente la
 * pagina quando un campo ha caratteri più piccoli di 16px, e l'utente si
 * ritrova fuori inquadratura a ogni tocco. Da sm in su si torna a 12.5px.
 *
 * min-h-11 garantisce il bersaglio di 44px raccomandato per il tocco.
 */
const classiCampo =
  "mono w-full min-h-11 border border-[var(--bordo)] bg-[var(--sfondo)] px-3.5 py-2.5 text-base text-[var(--testo)] outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)] focus-visible:ring-2 focus-visible:ring-[var(--accento)] focus-visible:ring-offset-0 sm:text-[12.5px]";

const classiEtichetta =
  "mono text-[11px] uppercase tracking-[0.14em] text-[var(--testo-tenue)] sm:text-[10px]";

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
  // L'intera etichetta è il bersaglio del tocco, non solo il quadratino.
  return (
    <label className="mono flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-[12.5px] uppercase tracking-[0.08em] sm:min-h-0 sm:text-[12px]">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={attivo}
        className="h-5 w-5 shrink-0 accent-[var(--accento)] sm:h-3.5 sm:w-3.5"
      />
      {etichetta}
    </label>
  );
}

export { BottoneElimina, BottoneSalva } from "@/components/bottoni-admin";

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
