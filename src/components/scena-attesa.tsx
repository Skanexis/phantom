"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const SCATTO = [0.16, 1, 0.3, 1] as const;

/**
 * Titolo che si compone lettera per lettera, come una stampante a matrice.
 *
 * Coerente con l'estetica meccanica del resto del sito: nessun rimbalzo
 * elastico, solo scatti brevi e decisi.
 */
export function TitoloComposto({ testo }: { testo: string }) {
  const ridotto = useReducedMotion();

  if (ridotto) return <>{testo}</>;

  return (
    <>
      {testo.split("").map((carattere, indice) => (
        <motion.span
          key={`${carattere}-${indice}`}
          initial={{ opacity: 0, y: "0.25em" }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.32,
            ease: SCATTO,
            delay: 0.3 + indice * 0.045,
          }}
          className="inline-block"
        >
          {carattere === " " ? " " : carattere}
        </motion.span>
      ))}
    </>
  );
}

/**
 * Sfondo animato: linee di scansione che attraversano lentamente lo schermo.
 *
 * Sta dietro a tutto e non intercetta i tocchi. L'opacità è volutamente
 * bassa: deve dare vita alla pagina, non competere col testo.
 */
export function SfondoAnimato() {
  const ridotto = useReducedMotion();
  if (ridotto) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      {/* Bagliore che respira, ancorato all'angolo alto. */}
      <motion.div
        animate={{ opacity: [0.05, 0.12, 0.05], scale: [1, 1.15, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-[var(--accento)] blur-[100px]"
      />
      <motion.div
        animate={{ opacity: [0.04, 0.09, 0.04], scale: [1.1, 1, 1.1] }}
        transition={{
          duration: 11,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute -bottom-40 -left-32 h-[24rem] w-[24rem] rounded-full bg-[var(--accento)] blur-[100px]"
      />

      {/* Due linee che scendono a velocità diverse: il movimento non si
          ripete mai identico e non diventa un battito prevedibile. */}
      {[
        { durata: 7, ritardo: 0 },
        { durata: 11, ritardo: 3.5 },
      ].map((linea, indice) => (
        <motion.div
          key={indice}
          initial={{ top: "-10%" }}
          animate={{ top: "110%" }}
          transition={{
            duration: linea.durata,
            repeat: Infinity,
            ease: "linear",
            delay: linea.ritardo,
          }}
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accento)] to-transparent opacity-[0.18]"
        />
      ))}
    </div>
  );
}

/**
 * Orologio in tempo reale.
 *
 * Parte vuoto e si popola dopo il montaggio: l'ora del server non coincide
 * con quella di chi guarda, e renderizzarla lato server produrrebbe un
 * errore di idratazione.
 */
export function Orologio() {
  const [ora, setOra] = useState<string | null>(null);

  useEffect(() => {
    const aggiorna = () =>
      setOra(
        new Date().toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );

    aggiorna();
    const id = setInterval(aggiorna, 1000);
    return () => clearInterval(id);
  }, []);

  // Spazio riservato anche da vuoto: senza, la riga salta al primo tick.
  return (
    <span className="mono tabular-nums">{ora ?? "--:--:--"}</span>
  );
}

/**
 * Barra di avanzamento indeterminata: segnala lavoro in corso senza
 * promettere una data che non possiamo garantire.
 */
export function BarraLavori() {
  const ridotto = useReducedMotion();

  return (
    <div className="relative h-px w-full overflow-hidden bg-[var(--bordo)]">
      {!ridotto && (
        <motion.div
          animate={{ x: ["-100%", "400%"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-y-0 w-1/4 bg-[var(--accento)]"
        />
      )}
    </div>
  );
}
