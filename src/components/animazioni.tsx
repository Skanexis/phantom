"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

/*
  Movimento meccanico: scatti brevi e decisi, nessun rimbalzo elastico.
  Coerente con l'estetica tecnica del resto dell'interfaccia.
*/
const SCATTO = [0.16, 1, 0.3, 1] as const;

/** Contenitore che scagliona l'ingresso dei figli. */
export function Scaglionato({
  children,
  className = "",
  ritardo = 0,
  passo = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  ritardo?: number;
  passo?: number;
}) {
  const ridotto = useReducedMotion();

  const varianti: Variants = {
    nascosto: {},
    visibile: {
      transition: {
        staggerChildren: ridotto ? 0 : passo,
        delayChildren: ridotto ? 0 : ritardo,
      },
    },
  };

  return (
    <motion.div
      variants={varianti}
      initial="nascosto"
      whileInView="visibile"
      viewport={{ once: true, margin: "-60px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Singolo elemento in ingresso; da usare dentro Scaglionato. */
export function Voce({
  children,
  className = "",
  distanza = 16,
}: {
  children: React.ReactNode;
  className?: string;
  distanza?: number;
}) {
  const ridotto = useReducedMotion();

  const varianti: Variants = {
    nascosto: { opacity: 0, y: ridotto ? 0 : distanza },
    visibile: {
      opacity: 1,
      y: 0,
      transition: { duration: ridotto ? 0.01 : 0.5, ease: SCATTO },
    },
  };

  return (
    <motion.div variants={varianti} className={className}>
      {children}
    </motion.div>
  );
}

/** Elemento singolo che si rivela allo scroll. */
export function Rivela({
  children,
  className = "",
  ritardo = 0,
  distanza = 16,
}: {
  children: React.ReactNode;
  className?: string;
  ritardo?: number;
  distanza?: number;
}) {
  const ridotto = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: ridotto ? 0 : distanza }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: ridotto ? 0.01 : 0.55,
        ease: SCATTO,
        delay: ridotto ? 0 : ritardo,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Linea che si estende da sinistra: separatore animato. */
export function LineaAnimata({ className = "" }: { className?: string }) {
  const ridotto = useReducedMotion();

  return (
    <motion.div
      initial={{ scaleX: ridotto ? 1 : 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: ridotto ? 0.01 : 0.7, ease: SCATTO }}
      className={`h-px origin-left bg-[var(--bordo)] ${className}`}
    />
  );
}
