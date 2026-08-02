"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Incrocio fra una pagina e la successiva: senza, Next sostituiva il
 * contenuto di scatto non appena i dati erano pronti — nessun errore,
 * solo un cambio secco che si percepiva come un piccolo scatto/lampo.
 *
 * Vive nel layout condiviso sopra Navigazione e PiedePagina, così è
 * solo il contenuto centrale a dissolversi: l'intestazione resta ferma
 * invece di rimontarsi a ogni cambio pagina.
 */
export function TransizionePagina({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ridotto = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: ridotto ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: ridotto ? 0 : -6 }}
        transition={{
          duration: ridotto ? 0.01 : 0.22,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="flex flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
