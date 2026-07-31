"use client";

import { useTema } from "@/components/tema-provider";

export function InterruttoreTema({ className = "" }: { className?: string }) {
  const { tema, alterna } = useTema();
  const scuro = tema === "scuro";

  return (
    <button
      type="button"
      onClick={alterna}
      aria-label={scuro ? "Passa al tema chiaro" : "Passa al tema scuro"}
      className={`mono flex items-center gap-1.5 border border-[var(--bordo)] px-2 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors hover:border-[var(--bordo-forte)] ${className}`}
    >
      <span
        className={
          scuro ? "text-[var(--accento)]" : "text-[var(--testo-debole)]"
        }
      >
        DRK
      </span>
      <span className="text-[var(--bordo-forte)]">/</span>
      <span
        className={
          !scuro ? "text-[var(--accento)]" : "text-[var(--testo-debole)]"
        }
      >
        LGT
      </span>
    </button>
  );
}
