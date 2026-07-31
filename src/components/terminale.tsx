"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Registro di lavorazione che si scrive da solo, dietro al marchio.
 *
 * Racconta il lavoro vero fatto sul sito invece di riempire lo spazio con
 * testo finto: chi guarda capisce che dietro c'è dello sviluppo in corso.
 * Sta sul fondo, a bassa opacità, e non deve rubare la scena al marchio.
 */

type Riga = {
  /** "$" comando, "→" avanzamento, "✓" esito riuscito. */
  segno: "$" | "→" | "✓";
  testo: string;
};

const REGISTRO: Riga[] = [
  { segno: "$", testo: "git pull origin main" },
  { segno: "→", testo: "aggiornamento area riservata" },
  { segno: "✓", testo: "conversazioni in tempo reale" },
  { segno: "→", testo: "messaggi dal sito e dal bot" },
  { segno: "✓", testo: "notifiche senza ricaricare" },
  { segno: "$", testo: "prisma migrate deploy" },
  { segno: "→", testo: "codici pratica R-4F2A · S-7B1C" },
  { segno: "✓", testo: "2 migrazioni applicate" },
  { segno: "$", testo: "npm run build" },
  { segno: "→", testo: "ottimizzazione per telefono" },
  { segno: "✓", testo: "compilazione riuscita" },
  { segno: "$", testo: "pm2 reload phantomlab" },
  { segno: "→", testo: "collaudo su rete lenta" },
  { segno: "✓", testo: "tutto in linea" },
];

/** Millisecondi per carattere e pausa fra una riga e l'altra. */
const VELOCITA = 26;
const PAUSA = 900;
/** Righe visibili insieme: oltre, il blocco invaderebbe il marchio. */
const FINESTRA = 6;

export function Terminale() {
  const [righeScritte, setRighe] = useState<Riga[]>([]);
  const [parziale, setParziale] = useState("");
  const [indice, setIndice] = useState(0);
  const [ridotto, setRidotto] = useState(false);

  // Senza movimento il registro compare già scritto: l'informazione resta,
  // l'animazione no. Derivato invece che impostato in un effetto, così non
  // c'è un render intermedio con la pila vuota.
  const righe = ridotto ? REGISTRO.slice(-FINESTRA) : righeScritte;

  // Il ciclo vive in un effetto solo: intrecciare più timer renderebbe
  // impossibile fermarli tutti allo smontaggio.
  const attivo = useRef(true);

  useEffect(() => {
    attivo.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Fuori dal render sincrono: qui la pila viene già dal valore
      // derivato, serve solo a fermare il ciclo di scrittura.
      const segnale = setTimeout(() => setRidotto(true), 0);
      return () => clearTimeout(segnale);
    }

    let timer: ReturnType<typeof setTimeout>;
    let posizione = 0;
    let corrente = indice;

    const scrivi = () => {
      if (!attivo.current) return;

      const riga = REGISTRO[corrente % REGISTRO.length];
      posizione += 1;

      setParziale(riga.testo.slice(0, posizione));

      if (posizione < riga.testo.length) {
        timer = setTimeout(scrivi, VELOCITA);
        return;
      }

      // Riga finita: entra nella pila e si passa alla successiva.
      timer = setTimeout(() => {
        if (!attivo.current) return;
        setRighe((precedenti) => [...precedenti, riga].slice(-FINESTRA));
        setParziale("");
        posizione = 0;
        corrente += 1;
        setIndice(corrente);
        timer = setTimeout(scrivi, 220);
      }, PAUSA);
    };

    timer = setTimeout(scrivi, 600);

    return () => {
      attivo.current = false;
      clearTimeout(timer);
    };
    // Volutamente una sola volta: il ciclo si autoalimenta e rilanciarlo a
    // ogni cambio di indice creerebbe timer sovrapposti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inCorso = REGISTRO[indice % REGISTRO.length];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div className="mono w-full max-w-[520px] px-4 text-[10px] leading-[1.9] opacity-[0.22] sm:text-[11px]">
        {righe.map((riga, posizione) => (
          <div
            key={`${riga.testo}-${posizione}`}
            className="flex gap-2 whitespace-nowrap"
            /* Le righe più vecchie sbiadiscono: la pila ha una profondità
               invece di essere un blocco uniforme. */
            style={{ opacity: 0.35 + (posizione / FINESTRA) * 0.65 }}
          >
            <span
              className={
                riga.segno === "✓"
                  ? "text-[var(--ok)]"
                  : riga.segno === "$"
                    ? "text-[var(--accento)]"
                    : "text-[var(--testo-debole)]"
              }
            >
              {riga.segno}
            </span>
            <span className="truncate text-[var(--testo-tenue)]">
              {riga.testo}
            </span>
          </div>
        ))}

        {parziale && (
          <div className="flex gap-2 whitespace-nowrap">
            <span
              className={
                inCorso.segno === "✓"
                  ? "text-[var(--ok)]"
                  : inCorso.segno === "$"
                    ? "text-[var(--accento)]"
                    : "text-[var(--testo-debole)]"
              }
            >
              {inCorso.segno}
            </span>
            <span className="truncate text-[var(--testo)]">
              {parziale}
              <span className="ml-0.5 inline-block w-[0.55em] bg-[var(--accento)] align-baseline">
                &nbsp;
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
