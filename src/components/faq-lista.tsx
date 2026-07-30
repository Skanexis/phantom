"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

type VoceFaq = { id: string; domanda: string; risposta: string };

export function FaqLista({ voci }: { voci: VoceFaq[] }) {
  const [apertaId, setApertaId] = useState<string | null>(voci[0]?.id ?? null);

  return (
    <div className="border-t border-[var(--bordo)]">
      {voci.map((voce, indice) => {
        const aperta = apertaId === voce.id;
        return (
          <div
            key={voce.id}
            className={`border-b border-[var(--bordo)] transition-colors ${
              aperta ? "bg-[var(--sfondo-alt)]" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => {
                vibra();
                setApertaId(aperta ? null : voce.id);
              }}
              aria-expanded={aperta}
              className="flex w-full items-baseline gap-4 px-1 py-5 text-left sm:gap-8"
            >
              <span
                className={`mono shrink-0 text-[11px] tracking-[0.12em] ${
                  aperta ? "text-[var(--accento)]" : "text-[var(--testo-debole)]"
                }`}
              >
                {String(indice + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-[17px] font-semibold tracking-[-0.01em] sm:text-[20px]">
                {voce.domanda}
              </span>
              <span className="mono shrink-0 text-[18px] leading-none text-[var(--testo-tenue)]">
                {aperta ? "−" : "+"}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {aperta && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="mono px-1 pb-6 text-[12.5px] leading-[1.75] text-[var(--testo-tenue)] sm:pl-[calc(2rem+2ch)]">
                    {voce.risposta}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
