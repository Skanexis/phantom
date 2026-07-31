"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

/**
 * Riga richiudibile per le richieste del pannello.
 *
 * Chiusa occupa una riga: con venti richieste aperte tutte insieme il
 * pannello era una sequenza di moduli lunga decine di schermate, dove per
 * trovarne una bisognava scorrere tutte le precedenti. Aperta mostra il
 * dettaglio completo, una alla volta.
 */
export function SchedaRichiesta({
  titolo,
  sottotitolo,
  stato,
  intestazione,
  daLeggere = 0,
  children,
}: {
  titolo: string;
  sottotitolo: string;
  /** Badge dello stato, mostrato anche a scheda chiusa. */
  stato: React.ReactNode;
  /** Codice copiabile, reso dal componente server. */
  intestazione?: React.ReactNode;
  /** Messaggi del cliente non letti: pallino di richiamo sulla riga. */
  daLeggere?: number;
  children: React.ReactNode;
}) {
  const [aperta, setAperta] = useState(false);
  const idContenuto = useId();

  return (
    <article
      className={`border transition-colors ${
        daLeggere > 0 ? "border-[var(--accento)]" : "border-[var(--bordo)]"
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => {
            vibra();
            setAperta((valore) => !valore);
          }}
          aria-expanded={aperta}
          aria-controls={idContenuto}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sfondo-alt)]"
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
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-semibold tracking-[-0.01em] sm:text-[15px]">
                {titolo}
              </span>
              {daLeggere > 0 && (
                <span className="mono flex h-4 min-w-4 shrink-0 items-center justify-center bg-[var(--allarme)] px-1 text-[9px] font-bold text-white">
                  {daLeggere}
                </span>
              )}
            </span>
            <span className="mono mt-0.5 block truncate text-[11px] text-[var(--testo-tenue)]">
              {sottotitolo}
            </span>
          </span>

          <span className="shrink-0">{stato}</span>
        </button>
      </div>

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
              {/* Il codice resta dentro il dettaglio: sulla riga chiusa
                  ruberebbe spazio al titolo, che è ciò che si cerca. */}
              {intestazione && <div className="mb-4">{intestazione}</div>}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
