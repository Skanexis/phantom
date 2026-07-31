"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

const SOGLIA = 70;
/** Oltre questa distanza il gesto non tira più: resistenza come su iOS. */
const MASSIMO = 110;

/**
 * Trascinamento verso il basso per ricaricare, come nelle app native.
 *
 * Su mobile è il gesto che si tenta d'istinto per aggiornare un elenco;
 * senza, resta solo il ricaricamento del browser, che è fuori dalla pagina.
 */
export function TrascinaAggiorna({
  children,
}: {
  /** Opzionale: il componente funziona anche come solo indicatore in cima. */
  children?: React.ReactNode;
}) {
  const [distanza, setDistanza] = useState(0);
  const [inCorso, setInCorso] = useState(false);
  const partenza = useRef<number | null>(null);
  const superata = useRef(false);
  const router = useRouter();
  const ridotto = useReducedMotion();

  useEffect(() => {
    if (ridotto) return;

    const inizio = (evento: TouchEvent) => {
      // Solo a pagina in cima: più in basso il gesto appartiene allo scroll.
      if (window.scrollY > 0) return;
      partenza.current = evento.touches[0].clientY;
      superata.current = false;
    };

    const muovi = (evento: TouchEvent) => {
      if (partenza.current === null || inCorso) return;

      const delta = evento.touches[0].clientY - partenza.current;
      if (delta <= 0) {
        partenza.current = null;
        setDistanza(0);
        return;
      }

      // Radice quadrata: la trazione si fa via via più dura, così il gesto
      // ha un limite percepibile invece di seguire il dito all'infinito.
      const tirato = Math.min(MASSIMO, Math.sqrt(delta) * 7);
      setDistanza(tirato);

      // Vibra una sola volta, nel momento in cui si supera la soglia.
      if (tirato >= SOGLIA && !superata.current) {
        superata.current = true;
        vibra();
      }
    };

    const fine = () => {
      if (partenza.current === null) return;
      partenza.current = null;

      if (superata.current && !inCorso) {
        setInCorso(true);
        setDistanza(SOGLIA);
        router.refresh();
        // router.refresh() non espone il completamento: un tempo breve
        // evita che l'indicatore resti acceso a dati già aggiornati.
        setTimeout(() => {
          setInCorso(false);
          setDistanza(0);
        }, 900);
      } else {
        setDistanza(0);
      }
    };

    // passive: il gesto non annulla mai lo scroll nativo, così su iOS non
    // si perde la fluidità della pagina.
    document.addEventListener("touchstart", inizio, { passive: true });
    document.addEventListener("touchmove", muovi, { passive: true });
    document.addEventListener("touchend", fine);
    document.addEventListener("touchcancel", fine);

    return () => {
      document.removeEventListener("touchstart", inizio);
      document.removeEventListener("touchmove", muovi);
      document.removeEventListener("touchend", fine);
      document.removeEventListener("touchcancel", fine);
    };
  }, [inCorso, ridotto, router]);

  const pronto = distanza >= SOGLIA;

  return (
    <>
      <motion.div
        aria-hidden={distanza === 0}
        animate={{ height: distanza, opacity: distanza > 0 ? 1 : 0 }}
        transition={{ duration: distanza === 0 ? 0.24 : 0 }}
        className="flex items-end justify-center overflow-hidden sm:hidden"
      >
        <div className="flex items-center gap-2 pb-2">
          <motion.span
            animate={
              inCorso
                ? { rotate: 360 }
                : { rotate: pronto ? 180 : 0, scale: pronto ? 1.1 : 1 }
            }
            transition={
              inCorso
                ? { duration: 0.8, repeat: Infinity, ease: "linear" }
                : { duration: 0.2 }
            }
            className={`mono text-[13px] ${
              pronto ? "text-[var(--accento)]" : "text-[var(--testo-debole)]"
            }`}
          >
            {inCorso ? "◠" : "↓"}
          </motion.span>
          <span
            className={`mono text-[10px] uppercase tracking-[0.12em] ${
              pronto ? "text-[var(--accento)]" : "text-[var(--testo-debole)]"
            }`}
          >
            {inCorso
              ? "Aggiorno…"
              : pronto
                ? "Rilascia per aggiornare"
                : "Tira per aggiornare"}
          </span>
        </div>
      </motion.div>

      {children}
    </>
  );
}
