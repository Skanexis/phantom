"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type Scheda = { id: string; etichetta: string; contatore?: number };

export function SchedeAdmin({
  schede,
  children,
}: {
  schede: Scheda[];
  children: Record<string, React.ReactNode>;
}) {
  const [attiva, setAttiva] = useState(schede[0]?.id ?? "");

  return (
    <div className="mt-10">
      <div className="nascondi-barra -mx-4 flex overflow-x-auto border-y border-[var(--bordo)] sm:mx-0">
        {schede.map((scheda, indice) => {
          const selezionata = attiva === scheda.id;
          return (
            <button
              key={scheda.id}
              type="button"
              onClick={() => setAttiva(scheda.id)}
              className={`mono relative shrink-0 border-r border-[var(--bordo)] px-4 py-3 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                selezionata
                  ? "bg-[var(--accento)] text-[var(--accento-testo)]"
                  : "text-[var(--testo-tenue)] hover:bg-[var(--sfondo-alt)]"
              } ${indice === 0 ? "border-l sm:border-l-0" : ""}`}
            >
              <span className="flex items-center gap-2">
                {scheda.etichetta}
                {scheda.contatore !== undefined && scheda.contatore > 0 && (
                  <span
                    className={`px-1 text-[10px] font-bold ${
                      selezionata
                        ? "bg-[var(--accento-testo)] text-[var(--accento)]"
                        : "bg-[var(--allarme)] text-white"
                    }`}
                  >
                    {scheda.contatore}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={attiva}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="mt-8"
      >
        {children[attiva]}
      </motion.div>
    </div>
  );
}
