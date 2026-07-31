"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { vibra } from "@/components/telegram-provider";

/**
 * Numero che sale da zero quando entra in vista.
 *
 * I riepiloghi restavano statici mentre tutto il resto della pagina si
 * rivelava allo scroll: il movimento porta l'occhio sul dato invece che
 * lasciarlo scivolare via.
 */
export function NumeroAnimato({
  valore,
  cifre = 2,
  className = "",
}: {
  valore: number;
  /** Zeri di riempimento, per l'allineamento tipografico. */
  cifre?: number;
  className?: string;
}) {
  const ridotto = useReducedMotion();
  const riferimento = useRef<HTMLSpanElement>(null);
  const inVista = useInView(riferimento, { once: true, margin: "-40px" });

  const grezzo = useMotionValue(0);
  const morbido = useSpring(grezzo, { stiffness: 90, damping: 20 });
  const testo = useTransform(morbido, (v) =>
    String(Math.round(v)).padStart(cifre, "0"),
  );

  useEffect(() => {
    if (!inVista) return;
    if (ridotto) {
      grezzo.jump(valore);
      return;
    }
    grezzo.set(valore);
  }, [inVista, ridotto, valore, grezzo]);

  return (
    <span ref={riferimento} className={className}>
      {/* Il valore finale resta nel DOM per screen reader e per il caso
          in cui JavaScript non parta. */}
      <span className="sr-only">{valore}</span>
      <motion.span aria-hidden="true">{testo}</motion.span>
    </span>
  );
}

/**
 * Codice pratica che si copia con un tocco.
 *
 * Il codice va dettato o incollato nei messaggi: selezionarlo a mano su
 * mobile è la parte più scomoda dell'intero flusso.
 */
export function CodiceCopiabile({
  codice,
  className = "",
}: {
  codice: string;
  className?: string;
}) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(codice);
      setCopiato(true);
      vibra("successo");
      setTimeout(() => setCopiato(false), 1600);
    } catch {
      // Clipboard negata (contesto non sicuro o permesso rifiutato):
      // il codice resta comunque selezionabile a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copia}
      title={`Copia ${codice}`}
      aria-label={copiato ? `${codice} copiato` : `Copia il codice ${codice}`}
      className={`mono group relative inline-flex items-center gap-1.5 transition-colors ${className}`}
    >
      {codice}
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ opacity: copiato ? 1 : 0.35, scale: copiato ? 1.1 : 1 }}
        transition={{ duration: 0.18 }}
        className="text-[10px]"
      >
        {copiato ? "✓" : "⧉"}
      </motion.span>
    </button>
  );
}

/** Bollino per ciò che si è mosso da poco. */
export function BollinoNovita({ testo = "Novità" }: { testo?: string }) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className="mono shrink-0 border border-[var(--accento)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--accento)]"
    >
      {testo}
    </motion.span>
  );
}

/**
 * Segnaposto in attesa dei dati.
 *
 * Un "Caricamento…" testuale su rete lenta sembra un blocco; una sagoma
 * della forma attesa comunica che qualcosa sta arrivando.
 */
export function Scheletro({
  righe = 3,
  className = "",
}: {
  righe?: number;
  className?: string;
}) {
  const ridotto = useReducedMotion();

  return (
    <div aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: righe }).map((_, indice) => (
        <motion.div
          key={indice}
          animate={ridotto ? undefined : { opacity: [0.35, 0.7, 0.35] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: indice * 0.12,
          }}
          className="h-3 bg-[var(--bordo)]"
          // Larghezze diverse: una pila di barre identiche sembra un
          // errore di rendering, non un caricamento.
          style={{ width: `${[92, 74, 83, 62][indice % 4]}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Avanzamento della pratica come percorso a tappe.
 *
 * Il badge dice dove sei, non quanto manca: la barra mostra il processo
 * intero e la posizione dentro di esso.
 */
export function PercorsoStato({
  tappe,
  corrente,
}: {
  tappe: string[];
  /** Indice della tappa raggiunta; -1 per nessuna. */
  corrente: number;
}) {
  return (
    <ol className="mt-4 flex items-center gap-1.5">
      {tappe.map((tappa, indice) => {
        const fatta = indice <= corrente;
        return (
          <li key={tappa} className="flex flex-1 flex-col gap-1.5">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, delay: indice * 0.08 }}
              className={`h-1 origin-left ${
                fatta ? "bg-[var(--accento)]" : "bg-[var(--bordo)]"
              }`}
            />
            <span
              className={`mono text-[9px] uppercase tracking-[0.08em] ${
                fatta
                  ? "text-[var(--testo-tenue)]"
                  : "text-[var(--testo-debole)]"
              }`}
            >
              {tappa}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
