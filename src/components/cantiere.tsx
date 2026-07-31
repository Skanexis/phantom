"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Registro di lavorazione che scorre da solo.
 *
 * Una pagina d'attesa statica non dice se dietro stia succedendo qualcosa.
 * Qui il lavoro si vede: le righe compaiono una alla volta, ognuna passa
 * da "in corso" a "fatto", e il ciclo riparte. È finzione dichiarata —
 * nessuno crede che sia un log reale — ma comunica movimento meglio di
 * qualsiasi frase.
 */

const LAVORI = [
  "Struttura del sito",
  "Area riservata",
  "Collegamento Telegram",
  "Sistema di messaggistica",
  "Pannello di gestione",
  "Ottimizzazione mobile",
  "Test e collaudo",
];

/** Millisecondi di "lavorazione" per ogni voce. */
const DURATA_VOCE = 1400;

export function RegistroCantiere() {
  const [avanzamento, setAvanzamento] = useState(0);
  const ridotto = useReducedMotion();

  // Derivato invece che impostato in un effetto: con meno movimento le
  // voci risultano tutte completate, senza un render intermedio.
  const completate = ridotto ? LAVORI.length : avanzamento;

  useEffect(() => {
    if (ridotto) return;

    const id = setInterval(() => {
      setAvanzamento((valore) =>
        // Superata l'ultima voce si riparte: la pagina resta viva anche
        // per chi la lascia aperta a lungo.
        valore >= LAVORI.length ? 0 : valore + 1,
      );
    }, DURATA_VOCE);

    return () => clearInterval(id);
  }, [ridotto]);

  return (
    <ul className="mt-6 flex flex-col">
      {LAVORI.map((lavoro, indice) => {
        const fatto = indice < completate;
        const inCorso = indice === completate;

        return (
          <li
            key={lavoro}
            className="flex items-center gap-3 border-b border-dashed border-[var(--bordo)] py-2.5 last:border-0"
          >
            <span
              aria-hidden="true"
              className={`mono w-4 shrink-0 text-center text-[12px] ${
                fatto
                  ? "text-[var(--ok)]"
                  : inCorso
                    ? "text-[var(--accento)]"
                    : "text-[var(--testo-debole)]"
              }`}
            >
              {fatto ? "✓" : inCorso ? <Rotella /> : "·"}
            </span>

            <span
              className={`mono flex-1 text-[12px] transition-colors duration-300 sm:text-[12.5px] ${
                fatto
                  ? "text-[var(--testo-tenue)]"
                  : inCorso
                    ? "text-[var(--testo)]"
                    : "text-[var(--testo-debole)]"
              }`}
            >
              {lavoro}
            </span>

            {/* Barra che si riempie solo sulla voce in lavorazione. */}
            <span className="relative h-px w-12 shrink-0 overflow-hidden bg-[var(--bordo)] sm:w-20">
              {(fatto || inCorso) && (
                <motion.span
                  initial={{ scaleX: fatto ? 1 : 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: fatto || ridotto ? 0 : DURATA_VOCE / 1000,
                    ease: "linear",
                  }}
                  className={`absolute inset-0 origin-left ${
                    fatto ? "bg-[var(--ok)]" : "bg-[var(--accento)]"
                  }`}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Rotella a scatti: coerente con il resto, nessuna rotazione fluida. */
function Rotella() {
  const [passo, setPasso] = useState(0);
  const ridotto = useReducedMotion();
  const fotogrammi = ["|", "/", "—", "\\"];

  useEffect(() => {
    if (ridotto) return;
    const id = setInterval(() => setPasso((v) => (v + 1) % 4), 130);
    return () => clearInterval(id);
  }, [ridotto]);

  return <span>{ridotto ? "·" : fotogrammi[passo]}</span>;
}

/**
 * Percentuale che sale e riparte, senza mai promettere il 100%.
 *
 * Dichiarare "97%" e restare fermi per settimane è peggio che non dire
 * nulla: il valore oscilla in una fascia alta e non viene presentato come
 * una scadenza.
 */
export function AvanzamentoFinto() {
  const [grezzo, setGrezzo] = useState(72);
  const ridotto = useReducedMotion();

  // Con meno movimento resta un valore fisso, senza oscillazioni.
  const valore = ridotto ? 84 : grezzo;

  useEffect(() => {
    if (ridotto) return;

    const id = setInterval(() => {
      setGrezzo((precedente) => {
        const prossimo = precedente + Math.random() * 3;
        return prossimo > 96 ? 72 : prossimo;
      });
    }, 900);

    return () => clearInterval(id);
  }, [ridotto]);

  return (
    <div className="mt-8 max-w-sm">
      <div className="mono flex items-baseline justify-between text-[11px] tracking-[0.14em] text-[var(--testo-debole)] uppercase">
        <span>Avanzamento</span>
        <span className="tabular-nums text-[var(--accento)]">
          {Math.round(valore)}%
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden bg-[var(--bordo)]">
        <motion.div
          animate={{ width: `${valore}%` }}
          transition={{ duration: ridotto ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="h-full bg-[var(--accento)]"
        />
      </div>
    </div>
  );
}

/**
 * Frasi che si alternano sotto il titolo.
 *
 * Un testo fisso si legge una volta sola; alternandolo, chi torna sulla
 * pagina trova qualcosa di diverso.
 */
const FRASI = [
  "Stiamo montando gli ultimi pezzi.",
  "Rifiniamo i dettagli, uno alla volta.",
  "Collaudiamo tutto su telefono e desktop.",
  "Ci siamo quasi: manca poco.",
];

export function FraseAlternata() {
  const [indice, setIndice] = useState(0);
  const ridotto = useReducedMotion();

  useEffect(() => {
    if (ridotto) return;
    const id = setInterval(() => setIndice((v) => (v + 1) % FRASI.length), 4200);
    return () => clearInterval(id);
  }, [ridotto]);

  // Altezza fissa: senza, il testo sotto salta a ogni cambio di frase.
  return (
    <div className="relative mt-8 h-12 max-w-md sm:h-10">
      <AnimatePresence mode="wait">
        <motion.p
          key={indice}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mono absolute inset-0 text-[13px] leading-[1.7] text-[var(--testo-tenue)]"
        >
          {FRASI[indice]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/**
 * Contatore dei giorni dall'inizio dei lavori: dà una misura concreta
 * senza promettere una data di arrivo.
 */
export function GiorniDiLavoro({ dallaData }: { dallaData: string }) {
  const [giorni, setGiorni] = useState<number | null>(null);
  const inizio = useRef(new Date(dallaData).getTime());

  useEffect(() => {
    // Calcolato dopo il montaggio: il fuso del server non è quello di chi
    // guarda, e renderizzarlo lato server darebbe un errore di idratazione.
    setGiorni(
      Math.max(
        1,
        Math.floor((Date.now() - inizio.current) / (24 * 60 * 60 * 1000)),
      ),
    );
  }, []);

  if (giorni === null) return <span className="tabular-nums">—</span>;
  return <span className="tabular-nums">{giorni}</span>;
}
