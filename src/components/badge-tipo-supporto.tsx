import { Icona } from "@/components/icone";
import { vociTipoSupporto } from "@/lib/supporto";

/** Pallino colorato + icona + etichetta per una richiesta di supporto. */
export function BadgeTipoSupporto({ tipo }: { tipo: string | null }) {
  const voce = vociTipoSupporto(tipo);
  if (!voce) return null;

  return (
    <span
      className="mono inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
      style={{ borderColor: voce.colore, color: voce.colore }}
    >
      <Icona nome={voce.icona} className="h-3 w-3" />
      {voce.etichetta}
    </span>
  );
}
