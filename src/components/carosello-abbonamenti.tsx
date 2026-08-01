"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { PulsanteAttiva } from "@/components/pulsante-attiva";
import { Icona } from "@/components/icone";
import { Etichetta, Freccia } from "@/components/ui";

export type PianoCarosello = {
  id: string;
  slug: string;
  nome: string;
  sottotitolo: string | null;
  descrizione: string;
  prezzo: string;
  periodo: string;
  inEvidenza: boolean;
  funzionalita: { id: string; testo: string; inclusa: boolean }[];
};

/* Icona diversa per carta, solo per varietà visiva: i piani non hanno
   ancora un campo icona proprio nello schema. */
const ICONE_ROTAZIONE = ["bolt", "sliders", "shield", "rocket"] as const;

export function CaroselloAbbonamenti({ piani }: { piani: PianoCarosello[] }) {
  const scorriRef = useRef<HTMLDivElement>(null);
  const [piuASinistra, setPiuASinistra] = useState(false);
  const [piuADestra, setPiuADestra] = useState(false);
  const [indiceAttivo, setIndiceAttivo] = useState(0);

  useEffect(() => {
    const elemento = scorriRef.current;
    if (!elemento) return;

    const controlla = () => {
      setPiuASinistra(elemento.scrollLeft > 8);
      setPiuADestra(
        elemento.scrollWidth - elemento.scrollLeft - elemento.clientWidth > 8,
      );

      // Carta più vicina al centro della fascia visibile: è quella che
      // "conta" come attiva per i pallini sotto il carosello.
      const centro = elemento.scrollLeft + elemento.clientWidth / 2;
      let vicino = 0;
      let distanzaMinima = Infinity;
      Array.from(elemento.children).forEach((figlio, indice) => {
        const elementoFiglio = figlio as HTMLElement;
        const centroFiglio =
          elementoFiglio.offsetLeft + elementoFiglio.offsetWidth / 2;
        const distanza = Math.abs(centroFiglio - centro);
        if (distanza < distanzaMinima) {
          distanzaMinima = distanza;
          vicino = indice;
        }
      });
      setIndiceAttivo(vicino);
    };

    controlla();
    elemento.addEventListener("scroll", controlla, { passive: true });
    const osservatore = new ResizeObserver(controlla);
    osservatore.observe(elemento);

    return () => {
      elemento.removeEventListener("scroll", controlla);
      osservatore.disconnect();
    };
  }, [piani.length]);

  function scorri(direzione: number) {
    vibra();
    const elemento = scorriRef.current;
    if (!elemento) return;
    const primaCarta = elemento.querySelector<HTMLElement>(".carosello-voce");
    const passo = primaCarta
      ? primaCarta.getBoundingClientRect().width + 24
      : elemento.clientWidth * 0.85;
    elemento.scrollBy({ left: direzione * passo, behavior: "smooth" });
  }

  function vaiA(indice: number) {
    vibra();
    const elemento = scorriRef.current;
    const figlio = elemento?.children[indice] as HTMLElement | undefined;
    figlio?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  }

  if (piani.length === 0) return null;

  return (
    <div className="relative mt-12">
      <div className="relative">
        <div
          ref={scorriRef}
          role="list"
          aria-label="Piani in abbonamento"
          className="carosello nascondi-barra -mx-4 gap-5 px-4 pb-4 sm:-mx-8 sm:gap-6 sm:px-8"
        >
          {piani.map((piano, indice) => (
            <CartaAbbonamento
              key={piano.id}
              piano={piano}
              indice={indice}
              className="carosello-voce w-[min(85vw,360px)] shrink-0 sm:w-[380px]"
            />
          ))}
          {/* Spaziatore finale: senza, l'ultima carta finisce a filo del
              bordo e sembra tagliata invece che l'ultima della fila. */}
          <div aria-hidden="true" className="w-px shrink-0 sm:w-1" />
        </div>

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--sfondo)] to-transparent transition-opacity duration-200 sm:w-16 ${
            piuASinistra ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--sfondo)] to-transparent transition-opacity duration-200 sm:w-16 ${
            piuADestra ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-1.5">
          {piani.map((piano, indice) => (
            <button
              key={piano.id}
              type="button"
              onClick={() => vaiA(indice)}
              aria-label={`Vai al piano ${piano.nome}`}
              aria-current={indice === indiceAttivo}
              className="p-1.5"
            >
              <span
                className={`block h-1.5 transition-all duration-200 ${
                  indice === indiceAttivo
                    ? "w-6 bg-[var(--accento)]"
                    : "w-1.5 bg-[var(--bordo-forte)]"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="hidden items-stretch border border-[var(--bordo)] sm:flex">
          <button
            type="button"
            onClick={() => scorri(-1)}
            disabled={!piuASinistra}
            aria-label="Piano precedente"
            className="spinta flex h-11 w-11 items-center justify-center border-r border-[var(--bordo)] transition-colors hover:bg-[var(--sfondo-alt)] disabled:pointer-events-none disabled:opacity-30"
          >
            <Freccia className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => scorri(1)}
            disabled={!piuADestra}
            aria-label="Piano successivo"
            className="spinta flex h-11 w-11 items-center justify-center transition-colors hover:bg-[var(--sfondo-alt)] disabled:pointer-events-none disabled:opacity-30"
          >
            <Freccia className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CartaAbbonamento({
  piano,
  indice,
  className = "",
}: {
  piano: PianoCarosello;
  indice: number;
  className?: string;
}) {
  const icona = ICONE_ROTAZIONE[indice % ICONE_ROTAZIONE.length];

  return (
    <motion.article
      role="listitem"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`superficie relative flex h-full flex-col p-6 sm:p-7 ${
        piano.inEvidenza ? "superficie--evidenza" : ""
      } ${className}`}
    >
      {piano.inEvidenza && (
        <span className="mono absolute right-0 top-0 bg-[var(--accento)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accento-testo)]">
          Consigliato
        </span>
      )}

      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center border border-[var(--bordo-forte)] text-[var(--accento)]">
          <Icona nome={icona} className="h-5 w-5" />
        </span>
        <Etichetta>Piano {String(indice + 1).padStart(2, "0")}</Etichetta>
      </div>

      <h3 className="display mt-6 text-[26px] sm:text-[30px]">
        {piano.nome}
      </h3>
      {piano.sottotitolo && (
        <p className="mono mt-1.5 text-[11.5px] uppercase tracking-[0.08em] text-[var(--testo-debole)]">
          {piano.sottotitolo}
        </p>
      )}

      <div className="mt-6 flex items-baseline gap-2 border-y border-[var(--bordo)] py-4">
        <span className="display text-[36px] sm:text-[42px]">
          {piano.prezzo}
        </span>
        <span className="mono text-[12px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
          /{piano.periodo}
        </span>
      </div>

      <p className="mono mt-4 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
        {piano.descrizione}
      </p>

      <ul className="mt-5 flex flex-1 flex-col">
        {piano.funzionalita.map((funzione) => (
          <li
            key={funzione.id}
            className="mono flex items-center gap-3 border-t border-dashed border-[var(--bordo)] py-2.5 text-[12.5px]"
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                funzione.inclusa
                  ? "bg-[var(--accento)] text-[var(--accento-testo)]"
                  : "border border-[var(--bordo)] text-[var(--testo-debole)]"
              }`}
            >
              {funzione.inclusa ? (
                <Icona nome="check" className="h-2.5 w-2.5" />
              ) : (
                <span className="block h-px w-2 bg-current" />
              )}
            </span>
            <span
              className={
                funzione.inclusa
                  ? ""
                  : "text-[var(--testo-debole)] line-through"
              }
            >
              {funzione.testo}
            </span>
          </li>
        ))}
      </ul>

      <PulsanteAttiva
        slug={piano.slug}
        nome={piano.nome}
        inEvidenza={piano.inEvidenza}
      />
    </motion.article>
  );
}
