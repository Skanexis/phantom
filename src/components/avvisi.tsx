"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

type Tono = "ok" | "errore" | "neutro";

type Avviso = { id: number; testo: string; tono: Tono };

type Contesto = {
  /** Mostra un messaggio effimero in fondo allo schermo. */
  avvisa: (testo: string, tono?: Tono) => void;
};

const ContestoAvvisi = createContext<Contesto>({ avvisa: () => {} });

export const useAvvisi = () => useContext(ContestoAvvisi);

const DURATA_MS = 3200;

/**
 * Conferme effimere per le azioni che altrimenti non darebbero segnale.
 *
 * Salvando dal pannello la pagina si limitava a ridisegnarsi: senza un
 * riscontro esplicito non è chiaro se il salvataggio sia avvenuto o se il
 * clic sia andato perso.
 */
export function AvvisiProvider({ children }: { children: React.ReactNode }) {
  const [avvisi, setAvvisi] = useState<Avviso[]>([]);
  const prossimoId = useRef(0);

  const avvisa = useCallback((testo: string, tono: Tono = "ok") => {
    const id = (prossimoId.current += 1);
    setAvvisi((precedenti) => [...precedenti, { id, testo, tono }]);
    vibra(tono === "errore" ? "errore" : "successo");

    setTimeout(() => {
      setAvvisi((precedenti) => precedenti.filter((a) => a.id !== id));
    }, DURATA_MS);
  }, []);

  const valore = useMemo(() => ({ avvisa }), [avvisa]);

  return (
    <ContestoAvvisi.Provider value={valore}>
      {children}

      {/* aria-live: chi usa uno screen reader riceve la conferma senza
          doverla cercare nella pagina. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence initial={false}>
          {avvisi.map((avviso) => (
            <motion.div
              key={avviso.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`mono pointer-events-auto max-w-[min(28rem,calc(100vw-2rem))] border px-4 py-3 text-[12px] leading-[1.5] shadow-lg ${
                avviso.tono === "ok"
                  ? "border-[var(--ok)] bg-[var(--sfondo)] text-[var(--ok)]"
                  : avviso.tono === "errore"
                    ? "border-[var(--allarme)] bg-[var(--sfondo)] text-[var(--allarme)]"
                    : "border-[var(--bordo-forte)] bg-[var(--sfondo)] text-[var(--testo)]"
              }`}
            >
              {avviso.testo}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ContestoAvvisi.Provider>
  );
}
