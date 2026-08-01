import { Icona } from "@/components/icone";
import type { Ruolo } from "@/generated/prisma/client";

const VOCI: Partial<
  Record<Ruolo, { etichetta: string; icona: string; colore: string }>
> = {
  DEVELOPER: {
    etichetta: "Developer",
    icona: "code",
    colore: "var(--accento)",
  },
  ADMIN: {
    etichetta: "Admin",
    icona: "shield",
    colore: "var(--info)",
  },
  SUPPORTO: {
    etichetta: "Supporto",
    icona: "chat",
    colore: "var(--ok)",
  },
};

/**
 * Bollino di ruolo: compare solo per lo staff, un utente normale non ne ha
 * bisogno. DEVELOPER è l'unico assegnabile solo da console, per cui il
 * bollino gli dà più risalto rispetto agli altri due.
 */
export function BadgeRuolo({
  ruolo,
  className = "",
}: {
  ruolo: Ruolo;
  className?: string;
}) {
  const voce = VOCI[ruolo];
  if (!voce) return null;

  return (
    <span
      className={`mono inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
      style={{ borderColor: voce.colore, color: voce.colore }}
    >
      <Icona nome={voce.icona} className="h-3 w-3" />
      {voce.etichetta}
    </span>
  );
}
