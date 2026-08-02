"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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

/** Passo della barra di avanzamento, in px. Coincide con `w-11` (2.75rem):
 *  l'indicatore scorre esattamente sopra il bersaglio tattile di ogni
 *  piano, quindi la misura va tenuta in un posto solo. */
const PASSO = 44;

export function CaroselloAbbonamenti({ piani }: { piani: PianoCarosello[] }) {
  const pista = useRef<HTMLDivElement>(null);
  const carte = useRef<(HTMLElement | null)[]>([]);
  const [indiceAttivo, setIndiceAttivo] = useState(0);
  const [piuASinistra, setPiuASinistra] = useState(false);
  const [piuADestra, setPiuADestra] = useState(false);
  const ridotto = useReducedMotion();
  // Distingue il primo calcolo (al montaggio) dai successivi: la vibrazione
  // deve segnare un cambio di carta fatto dall'utente, non l'avvio.
  const primoControllo = useRef(true);
  const inAttesaDiFotogramma = useRef(false);

  /**
   * Un solo passaggio per fotogramma che scrive la vicinanza al centro su
   * ogni carta e aggiorna gli indicatori.
   *
   * Le trasformazioni vanno direttamente sul nodo, non nello stato di
   * React: durante un trascinamento questo gira a ogni fotogramma, e farne
   * passare ognuno da un render dell'intero carosello significherebbe
   * ricostruire tutte le carte — con le liste di funzionalità dentro —
   * mentre il dito è ancora sullo schermo.
   */
  const disegna = useCallback(() => {
    const elemento = pista.current;
    if (!elemento) return;

    const centro = elemento.scrollLeft + elemento.clientWidth / 2;
    const massimo = elemento.scrollWidth - elemento.clientWidth;
    setPiuASinistra(elemento.scrollLeft > 8);
    setPiuADestra(massimo - elemento.scrollLeft > 8);

    let vicino = 0;
    let distanzaMinima = Infinity;

    carte.current.forEach((carta, indice) => {
      if (!carta) return;
      const centroCarta = carta.offsetLeft + carta.offsetWidth / 2;
      const distanza = Math.abs(centroCarta - centro);
      // Normalizzata sulla larghezza della carta: 1 al centro esatto, 0 a
      // una carta piena di distanza. Oltre non serve andare, le carte più
      // lontane sono comunque fuori dalla fascia visibile.
      const vicinanza = Math.max(0, 1 - distanza / carta.offsetWidth);
      carta.style.setProperty("--vicinanza", vicinanza.toFixed(3));

      if (distanza < distanzaMinima) {
        distanzaMinima = distanza;
        vicino = indice;
      }
    });

    setIndiceAttivo((precedente) => {
      // Un piccolo riscontro tattile quando lo scorrimento si aggancia a
      // una nuova carta: sul telefono si sente come uno scatto preciso
      // invece di un semplice trascinamento.
      if (!primoControllo.current && vicino !== precedente) vibra();
      return vicino;
    });
    primoControllo.current = false;
  }, []);

  // Prima del paint: al montaggio le carte hanno --vicinanza al valore di
  // ripiego (1, tutte a fuoco). Calcolarlo dopo il primo disegno farebbe
  // vedere per un fotogramma una fila piatta che poi sprofonda ai lati.
  useLayoutEffect(() => {
    const elemento = pista.current;
    if (!elemento) return;

    const suScorrimento = () => {
      // Lo scorrimento nativo emette molti più eventi dei fotogrammi
      // disponibili: senza questo filtro si ricalcola la stessa posizione
      // due o tre volte per ogni frame utile.
      if (inAttesaDiFotogramma.current) return;
      inAttesaDiFotogramma.current = true;
      requestAnimationFrame(() => {
        inAttesaDiFotogramma.current = false;
        disegna();
      });
    };

    disegna();
    elemento.addEventListener("scroll", suScorrimento, { passive: true });
    const osservatore = new ResizeObserver(disegna);
    osservatore.observe(elemento);

    return () => {
      elemento.removeEventListener("scroll", suScorrimento);
      osservatore.disconnect();
    };
  }, [disegna, piani.length]);

  // Piccolo invito a scorrere: senza, su schermi stretti dove si vede
  // chiaramente solo la prima carta, niente suggerisce che ce ne sono
  // altre finché qualcuno non ci prova per caso.
  useEffect(() => {
    const elemento = pista.current;
    if (!elemento || ridotto || piani.length < 2) return;
    if (elemento.scrollWidth <= elemento.clientWidth) return;

    const id = setTimeout(() => {
      if (elemento.scrollLeft > 4) return; // l'utente ha già scorso da solo
      elemento.scrollBy({ left: 34, behavior: "smooth" });
      setTimeout(() => {
        elemento.scrollBy({ left: -34, behavior: "smooth" });
      }, 380);
    }, 900);

    return () => clearTimeout(id);
  }, [piani.length, ridotto]);

  /** Porta al centro la carta indicata. Unico modo di muovere il carosello
   *  da tastiera, frecce e barra: così ogni comando finisce esattamente su
   *  un piano, mai in una posizione intermedia. */
  const vaiA = useCallback(
    (indice: number) => {
      const bersaglio = Math.max(0, Math.min(indice, piani.length - 1));
      const carta = carte.current[bersaglio];
      const elemento = pista.current;
      if (!carta || !elemento) return;
      vibra();

      // scrollTo sul contenitore invece di scrollIntoView: quest'ultimo
      // trascina anche la pagina in verticale se la carta sporge appena
      // dalla finestra, e il salto si vede.
      const sinistra =
        carta.offsetLeft - (elemento.clientWidth - carta.offsetWidth) / 2;
      elemento.scrollTo({
        left: sinistra,
        behavior: ridotto ? "auto" : "smooth",
      });
    },
    [piani.length, ridotto],
  );

  if (piani.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: ridotto ? 0 : 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: ridotto ? 0.01 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mt-12"
    >
      {/* overflow-hidden qui, non su .carosello: il margine negativo che fa
          sanguinare la fascia fino al bordo dello schermo altrimenti sborda
          anche dal genitore, e senza un antenato che lo tagli quei pixel
          finivano nella larghezza scorribile dell'intera pagina. */}
      <div className="relative -mx-4 overflow-hidden sm:-mx-8">
        <div
          ref={pista}
          role="list"
          tabIndex={0}
          aria-label="Piani in abbonamento"
          onKeyDown={(evento) => {
            if (evento.key === "ArrowRight") {
              evento.preventDefault();
              vaiA(indiceAttivo + 1);
            } else if (evento.key === "ArrowLeft") {
              evento.preventDefault();
              vaiA(indiceAttivo - 1);
            }
          }}
          // Nessun focus-visible:outline-none qui: la fascia è scorrevole
          // ed è raggiungibile da tastiera, quindi deve anche vedersi
          // quando riceve il fuoco.
          className="carosello nascondi-barra py-4"
        >
          {piani.map((piano, indice) => (
            <CartaAbbonamento
              key={piano.id}
              piano={piano}
              indice={indice}
              riferimento={(nodo) => {
                carte.current[indice] = nodo;
              }}
            />
          ))}
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

      {/* Comandi al centro, sotto la carta a fuoco: freccia, barra dei
          piani, freccia. Prima i pallini stavano a sinistra e le frecce a
          destra, e su schermo largo i due comandi finivano a mezzo metro
          l'uno dall'altro. */}
      {/* flex-wrap: con molti piani la barra più le due frecce supera la
          larghezza di un telefono stretto, e senza andrebbe a finire sotto
          il taglio orizzontale del body invece di scendere di una riga. */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => vaiA(indiceAttivo - 1)}
          disabled={!piuASinistra}
          aria-label="Piano precedente"
          className="spinta flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--bordo)] transition-colors hover:bg-[var(--sfondo-alt)] disabled:pointer-events-none disabled:opacity-25"
        >
          <Freccia className="h-4 w-4 rotate-180" />
        </button>

        {/* Barra segmentata invece dei pallini: l'indicatore scivola da un
            segmento all'altro seguendo la carta, così il movimento del
            dito e quello dell'indicatore sono la stessa cosa. */}
        <div
          className="relative flex shrink-0"
          style={{ width: piani.length * PASSO }}
        >
          <motion.span
            aria-hidden="true"
            className="absolute top-1/2 h-[3px] bg-[var(--accento)]"
            style={{ width: PASSO }}
            animate={{ x: indiceAttivo * PASSO, y: -1.5 }}
            transition={
              ridotto
                ? { duration: 0.01 }
                : { type: "spring", stiffness: 340, damping: 34, mass: 0.7 }
            }
          />
          {piani.map((piano, indice) => (
            <button
              key={piano.id}
              type="button"
              onClick={() => vaiA(indice)}
              aria-label={`Vai al piano ${piano.nome}`}
              aria-current={indice === indiceAttivo}
              className="flex h-11 w-11 items-center justify-center"
            >
              <span className="block h-[3px] w-full bg-[var(--bordo-forte)]" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => vaiA(indiceAttivo + 1)}
          disabled={!piuADestra}
          aria-label="Piano successivo"
          className="spinta flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--bordo)] transition-colors hover:bg-[var(--sfondo-alt)] disabled:pointer-events-none disabled:opacity-25"
        >
          <Freccia className="h-4 w-4" />
        </button>
      </div>

      <p
        aria-live="polite"
        className="mono mt-3 text-center text-[11px] uppercase tracking-[0.14em] text-[var(--testo-debole)]"
      >
        {piani[indiceAttivo]?.nome} · {indiceAttivo + 1}/{piani.length}
      </p>
    </motion.div>
  );
}

function CartaAbbonamento({
  piano,
  indice,
  riferimento,
}: {
  piano: PianoCarosello;
  indice: number;
  riferimento: (nodo: HTMLElement | null) => void;
}) {
  const icona = ICONE_ROTAZIONE[indice % ICONE_ROTAZIONE.length];

  return (
    // Niente animazione per-carta con framer-motion: la fila intera entra
    // già come blocco (vedi sopra), e qui girerebbe di continuo durante il
    // trascinamento touch, rubando fotogrammi proprio mentre lo
    // scorrimento deve essere fluido. La profondità arriva da --vicinanza,
    // scritta a mano sul nodo.
    <article ref={riferimento} role="listitem" className="carosello-voce">
      <div
        className={`carta-piano superficie relative flex h-full flex-col items-center p-6 text-center sm:p-7 ${
          piano.inEvidenza ? "superficie--evidenza pt-11 sm:pt-12" : ""
        }`}
      >
        {piano.inEvidenza && (
          <span className="mono absolute inset-x-0 top-0 bg-[var(--accento)] py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accento-testo)]">
            Consigliato
          </span>
        )}

        <span className="flex h-11 w-11 items-center justify-center border border-[var(--bordo-forte)] text-[var(--accento)]">
          <Icona nome={icona} className="h-5 w-5" />
        </span>

        <Etichetta className="mt-4">
          Piano {String(indice + 1).padStart(2, "0")}
        </Etichetta>

        <h3 className="display mt-3 text-[26px] sm:text-[30px]">{piano.nome}</h3>
        {piano.sottotitolo && (
          <p className="mono mt-1.5 text-[11.5px] uppercase tracking-[0.08em] text-[var(--testo-debole)]">
            {piano.sottotitolo}
          </p>
        )}

        <div className="mt-6 flex w-full items-baseline justify-center gap-2 border-y border-[var(--bordo)] py-4">
          <span className="display text-[36px] sm:text-[42px]">
            {piano.prezzo}
          </span>
          <span className="mono text-[12px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
            /{piano.periodo}
          </span>
        </div>

        <p className="mono mt-4 text-[12.5px] leading-[1.7] text-balance text-[var(--testo-tenue)]">
          {piano.descrizione}
        </p>

        <ul className="mt-5 flex w-full flex-1 flex-col">
          {piano.funzionalita.map((funzione) => (
            <li
              key={funzione.id}
              className="mono flex items-center justify-center gap-3 border-t border-dashed border-[var(--bordo)] py-2.5 text-[12.5px]"
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

        {/* w-full esplicito: la colonna è centrata con items-center, quindi
            senza questo il pulsante si stringe sulla sua etichetta e ogni
            carta ne avrebbe uno di larghezza diversa. */}
        <div className="w-full">
          <PulsanteAttiva
            slug={piano.slug}
            nome={piano.nome}
            inEvidenza={piano.inEvidenza}
          />
        </div>
      </div>
    </article>
  );
}
