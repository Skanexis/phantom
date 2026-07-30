"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

export const bloccoAdmin = "border border-[var(--bordo)] p-5 sm:p-6";

/**
 * Scheda richiudibile per le voci del pannello.
 *
 * Su mobile ogni voce è un form alto diverse schermate: con dieci servizi
 * l'admin scorre a vuoto per trovarne uno. Chiuse per difetto, le voci
 * diventano un elenco navigabile e si apre solo quella da modificare.
 */
export function VoceRichiudibile({
  titolo,
  sottotitolo,
  accessorio,
  apertaIniziale = false,
  children,
}: {
  titolo: string;
  sottotitolo?: string | null;
  accessorio?: React.ReactNode;
  apertaIniziale?: boolean;
  children: React.ReactNode;
}) {
  const [aperta, setAperta] = useState(apertaIniziale);
  const idContenuto = useId();

  return (
    <div className="border border-[var(--bordo)]">
      <button
        type="button"
        onClick={() => {
          vibra();
          setAperta((valore) => !valore);
        }}
        aria-expanded={aperta}
        aria-controls={idContenuto}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sfondo-alt)] sm:px-5"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: aperta ? 90 : 0 }}
          transition={{ duration: 0.18 }}
          className="mono shrink-0 text-[12px] text-[var(--accento)]"
        >
          ▸
        </motion.span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-[16px]">
            {titolo}
          </span>
          {sottotitolo && (
            <span className="mono mt-0.5 block truncate text-[11px] text-[var(--testo-tenue)]">
              {sottotitolo}
            </span>
          )}
        </span>

        {accessorio && <span className="shrink-0">{accessorio}</span>}
      </button>

      <AnimatePresence initial={false}>
        {aperta && (
          <motion.div
            id={idContenuto}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--bordo)] p-4 sm:p-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Form di creazione, chiuso finché non serve: in cima a ogni sezione un
 * modulo vuoto sempre aperto allontana l'elenco di quanto già esiste.
 */
export function BloccoNuovo({
  etichetta,
  children,
}: {
  etichetta: string;
  children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const idContenuto = useId();

  return (
    <div className="border border-dashed border-[var(--bordo-forte)]">
      <button
        type="button"
        onClick={() => {
          vibra();
          setAperto((valore) => !valore);
        }}
        aria-expanded={aperto}
        aria-controls={idContenuto}
        className="mono flex min-h-14 w-full items-center gap-3 px-4 py-3 text-[12px] uppercase tracking-[0.12em] text-[var(--accento)] transition-colors hover:bg-[var(--sfondo-alt)] sm:px-5 sm:text-[11px]"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: aperto ? 45 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-[16px] leading-none"
        >
          +
        </motion.span>
        {etichetta}
      </button>

      <AnimatePresence initial={false}>
        {aperto && (
          <motion.div
            id={idContenuto}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-dashed border-[var(--bordo-forte)] p-4 sm:p-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
