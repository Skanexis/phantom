"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

/**
 * Pannello a tutto schermo che sale dal basso, su mobile.
 *
 * Una conversazione dentro una scheda alta cinque schermate significa uno
 * scorrimento dentro un altro scorrimento: si perde il filo e il pollice
 * non sa quale dei due sta muovendo. A tutto schermo la conversazione ha
 * l'unico scorrimento della pagina e la casella di scrittura resta ferma
 * in fondo, come in qualsiasi applicazione di messaggistica.
 *
 * Da sm in su non serve: lo spazio c'è e il contenuto resta in linea.
 */
export function Foglio({
  aperto,
  titolo,
  sottotitolo,
  onChiudi,
  children,
}: {
  aperto: boolean;
  titolo: React.ReactNode;
  sottotitolo?: React.ReactNode;
  onChiudi: () => void;
  children: React.ReactNode;
}) {
  // Blocca lo scorrimento sotto al foglio: senza, trascinando sul bordo si
  // muove la pagina dietro e il pannello sembra staccarsi.
  useEffect(() => {
    if (!aperto) return;
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = precedente;
    };
  }, [aperto]);

  // La chiusura passa da un riferimento: se dipendesse direttamente da
  // onChiudi, una funzione ricreata a ogni render rieseguirebbe l'effetto
  // e impilerebbe una voce di cronologia dopo l'altra.
  const chiusura = useRef(onChiudi);
  useEffect(() => {
    chiusura.current = onChiudi;
  }, [onChiudi]);

  // Il tasto Indietro del telefono deve chiudere il foglio, non lasciare
  // la pagina: è il gesto che si usa d'istinto per tornare all'elenco.
  useEffect(() => {
    if (!aperto) return;

    window.history.pushState({ foglio: true }, "");
    const alRitorno = () => chiusura.current();
    window.addEventListener("popstate", alRitorno);

    return () => {
      window.removeEventListener("popstate", alRitorno);
      // Se il foglio è stato chiuso dall'interfaccia, tolgo la voce che
      // avevo aggiunto, altrimenti servirebbero due Indietro per uscire.
      if (window.history.state?.foglio) window.history.back();
    };
  }, [aperto]);

  useEffect(() => {
    if (!aperto) return;
    const allaFuga = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") chiusura.current();
    };
    document.addEventListener("keydown", allaFuga);
    return () => document.removeEventListener("keydown", allaFuga);
  }, [aperto]);

  return (
    <AnimatePresence>
      {aperto && (
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex flex-col bg-[var(--sfondo)] sm:hidden"
        >
          <motion.div
            initial={{ y: "3%" }}
            animate={{ y: 0 }}
            exit={{ y: "2%" }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Intestazione fissa: il titolo dice sempre dove ci si trova,
                anche dopo aver scorso mille messaggi. */}
            <header
              className="flex shrink-0 items-center gap-3 border-b border-[var(--bordo)] px-4 py-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <button
                type="button"
                onClick={() => {
                  vibra();
                  onChiudi();
                }}
                aria-label="Chiudi"
                className="mono -ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-[var(--testo-tenue)]"
              >
                ←
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                  {titolo}
                </div>
                {sottotitolo && (
                  <div className="mono truncate text-[11px] text-[var(--testo-tenue)]">
                    {sottotitolo}
                  </div>
                )}
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
