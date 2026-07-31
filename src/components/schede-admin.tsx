"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

type Scheda = { id: string; etichetta: string; contatore?: number };

export function SchedeAdmin({
  schede,
  children,
}: {
  schede: Scheda[];
  children: Record<string, React.ReactNode>;
}) {
  const [attiva, setAttiva] = useState(schede[0]?.id ?? "");
  const [altroADestra, setAltroADestra] = useState(false);
  const barra = useRef<HTMLDivElement>(null);

  /**
   * Con otto schede su uno schermo stretto metà sono fuori vista, e una
   * barra che scorre senza indizi visivi sembra semplicemente troncata.
   * La sfumatura a destra segnala che c'è dell'altro.
   */
  useEffect(() => {
    const elemento = barra.current;
    if (!elemento) return;

    const controlla = () => {
      const residuo =
        elemento.scrollWidth - elemento.scrollLeft - elemento.clientWidth;
      setAltroADestra(residuo > 8);
    };

    controlla();
    elemento.addEventListener("scroll", controlla, { passive: true });

    const osservatore = new ResizeObserver(controlla);
    osservatore.observe(elemento);

    return () => {
      elemento.removeEventListener("scroll", controlla);
      osservatore.disconnect();
    };
  }, [schede.length]);

  // Porta in vista la scheda scelta: toccandone una parzialmente coperta,
  // altrimenti resta a metà fuori dallo schermo.
  const seleziona = (id: string, elemento: HTMLButtonElement) => {
    vibra();
    setAttiva(id);
    elemento.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  };

  return (
    <div className="mt-5 sm:mt-10">
      {/* Le schede restano agganciate sotto la navigazione: scendendo nel
          contenuto si cambia sezione senza tornare in cima. top-14 è
          l'altezza dell'intestazione del sito. */}
      <div className="relative sticky top-14 z-40 bg-[var(--sfondo)]">
        <div
          ref={barra}
          role="tablist"
          aria-label="Sezioni del pannello"
          className="nascondi-barra -mx-4 flex overflow-x-auto border-y border-[var(--bordo)] sm:mx-0"
        >
          {schede.map((scheda, indice) => {
            const selezionata = attiva === scheda.id;
            return (
              <button
                key={scheda.id}
                type="button"
                role="tab"
                aria-selected={selezionata}
                aria-controls={`pannello-${scheda.id}`}
                onClick={(evento) => seleziona(scheda.id, evento.currentTarget)}
                className={`mono relative min-h-12 shrink-0 border-r border-[var(--bordo)] px-4 py-3 text-[12px] uppercase tracking-[0.12em] transition-colors sm:text-[11px] ${
                  selezionata
                    ? "bg-[var(--accento)] font-semibold text-[var(--accento-testo)]"
                    : "text-[var(--testo-tenue)] hover:bg-[var(--sfondo-alt)]"
                } ${indice === 0 ? "border-l sm:border-l-0" : ""}`}
              >
                <span className="flex items-center gap-2">
                  {scheda.etichetta}
                  {scheda.contatore !== undefined && scheda.contatore > 0 && (
                    <span
                      className={`min-w-[18px] px-1 text-[10px] font-bold ${
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

        {/* Sfumatura: compare solo se resta qualcosa da scorrere. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--sfondo)] to-transparent transition-opacity duration-200 sm:hidden ${
            altroADestra ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <motion.div
        key={attiva}
        id={`pannello-${attiva}`}
        role="tabpanel"
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
