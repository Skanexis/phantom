"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

/**
 * Blocco richiudibile per contenuto secondario (es. richieste già chiuse).
 *
 * Tenerlo ripiegato di default toglie peso visivo a ciò che non richiede più
 * attenzione, senza farlo sparire: resta a un tocco di distanza.
 */
export function Divulgatore({
  titolo,
  contatore,
  apertoIniziale = false,
  children,
}: {
  titolo: string;
  contatore: number;
  apertoIniziale?: boolean;
  children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(apertoIniziale);

  if (contatore === 0) return null;

  return (
    <div className="border-t border-[var(--bordo)]">
      <button
        type="button"
        onClick={() => {
          vibra();
          setAperto((valore) => !valore);
        }}
        aria-expanded={aperto}
        className="mono flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
      >
        <span className="flex items-center gap-2.5">
          <motion.span
            aria-hidden="true"
            animate={{ rotate: aperto ? 90 : 0 }}
            transition={{ duration: 0.18 }}
          >
            ▸
          </motion.span>
          {titolo} · {contatore}
        </span>
        <span>{aperto ? "Nascondi" : "Mostra"}</span>
      </button>

      <AnimatePresence initial={false}>
        {aperto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
