import { Icona } from "@/components/icone";
import { Freccia } from "@/components/ui";
import {
  calcolaCommissione,
  formattaEuro,
  voceCriptovaluta,
  voceDirezione,
} from "@/lib/scambio";

/** Riepilogo di una richiesta di ambito EXCHANGE: direzione, valuta e
 * scomposizione dell'importo. Usato sia in area personale sia in admin. */
export function DettaglioScambio({
  direzione,
  criptovaluta,
  importoCentesimi,
}: {
  direzione: string | null;
  criptovaluta: string | null;
  importoCentesimi: number | null;
}) {
  const voce = voceDirezione(direzione);
  const cripto = voceCriptovaluta(criptovaluta);
  if (!voce || !cripto || importoCentesimi == null) return null;

  const { commissioneCentesimi, nettoCentesimi } =
    calcolaCommissione(importoCentesimi);

  return (
    <div className="superficie flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex shrink-0 items-center gap-1.5 text-[var(--accento)]">
          <Icona nome={voce.da} className="h-5 w-5" />
          <Freccia className="h-3 w-3 opacity-60" />
          <Icona nome={voce.a} className="h-5 w-5" />
        </span>
        <span className="text-[13px] font-semibold tracking-[-0.01em]">
          {voce.etichetta}
        </span>
        <span className="mono ml-auto border border-[var(--bordo)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--testo-tenue)]">
          {cripto.valore}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 border-t border-dashed border-[var(--bordo)] pt-3 text-center">
        <div>
          <dt className="mono text-[9px] uppercase tracking-[0.08em] text-[var(--testo-debole)]">
            Importo
          </dt>
          <dd className="mono mt-1 text-[13px]">
            {formattaEuro(importoCentesimi)}
          </dd>
        </div>
        <div>
          <dt className="mono text-[9px] uppercase tracking-[0.08em] text-[var(--testo-debole)]">
            Commissione
          </dt>
          <dd className="mono mt-1 text-[13px] text-[var(--allarme)]">
            −{formattaEuro(commissioneCentesimi)}
          </dd>
        </div>
        <div>
          <dt className="mono text-[9px] uppercase tracking-[0.08em] text-[var(--testo-debole)]">
            Netto
          </dt>
          <dd className="mono mt-1 text-[13px] font-bold text-[var(--ok)]">
            {formattaEuro(nettoCentesimi)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
