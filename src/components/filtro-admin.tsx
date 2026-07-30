"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

type Voce = {
  id: string;
  /** Stato usato dai filtri rapidi. */
  stato: string;
  /** Testo su cui cerca il campo di ricerca, già normalizzato a minuscole. */
  ricerca: string;
  contenuto: React.ReactNode;
};

/**
 * Ricerca e filtro per stato sulle liste lunghe del pannello.
 *
 * Con cinquanta richieste in ordine di data, trovare le due "da lavorare"
 * significa scorrere tutto: su mobile è la differenza fra usabile e no.
 * Il filtro è client-side perché i dati sono già tutti nella pagina.
 */
export function FiltroAdmin({
  voci,
  stati,
  segnaposto = "Cerca…",
  vuoto = "Nessun risultato.",
}: {
  voci: Voce[];
  stati: { valore: string; etichetta: string }[];
  segnaposto?: string;
  vuoto?: string;
}) {
  const [testo, setTesto] = useState("");
  const [stato, setStato] = useState("tutti");

  const filtrate = useMemo(() => {
    const cercato = testo.trim().toLowerCase();
    return voci.filter((voce) => {
      if (stato !== "tutti" && voce.stato !== stato) return false;
      if (cercato && !voce.ricerca.includes(cercato)) return false;
      return true;
    });
  }, [voci, testo, stato]);

  // I contatori stanno sui filtri, così si vede quanto c'è prima di toccarli.
  const conteggi = useMemo(() => {
    const mappa: Record<string, number> = {};
    for (const voce of voci) mappa[voce.stato] = (mappa[voce.stato] ?? 0) + 1;
    return mappa;
  }, [voci]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={testo}
        onChange={(evento) => setTesto(evento.target.value)}
        placeholder={segnaposto}
        aria-label={segnaposto}
        /* text-base sotto sm: iOS ingrandisce la pagina sotto i 16px. */
        className="mono min-h-11 w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-3.5 py-2.5 text-base outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)] sm:text-[12.5px]"
      />

      <div className="nascondi-barra -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {[{ valore: "tutti", etichetta: "Tutti" }, ...stati].map((voce) => {
          const selezionato = stato === voce.valore;
          const quanti =
            voce.valore === "tutti"
              ? voci.length
              : (conteggi[voce.valore] ?? 0);

          return (
            <button
              key={voce.valore}
              type="button"
              onClick={() => {
                vibra();
                setStato(voce.valore);
              }}
              aria-pressed={selezionato}
              className={`mono flex min-h-10 shrink-0 items-center gap-2 border px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                selezionato
                  ? "border-[var(--accento)] bg-[var(--accento)] font-semibold text-[var(--accento-testo)]"
                  : "border-[var(--bordo)] text-[var(--testo-tenue)] hover:border-[var(--bordo-forte)]"
              }`}
            >
              {voce.etichetta}
              <span
                className={
                  selezionato ? "opacity-70" : "text-[var(--testo-debole)]"
                }
              >
                {quanti}
              </span>
            </button>
          );
        })}
      </div>

      {filtrate.length === 0 ? (
        <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
          {vuoto}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtrate.map((voce, indice) => (
            <motion.div
              key={voce.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                // Lo scaglionamento si ferma presto: con cinquanta voci
                // l'ultima arriverebbe secondi dopo la prima.
                delay: Math.min(indice, 8) * 0.02,
              }}
            >
              {voce.contenuto}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
