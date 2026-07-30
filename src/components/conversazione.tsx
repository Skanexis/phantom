"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";

export type MessaggioVista = {
  id: string;
  testo: string;
  daAdmin: boolean;
  creatoIl: string;
};

const LUNGHEZZA_MASSIMA = 2000;

function orario(valore: string) {
  return new Date(valore).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Conversazione fra cliente e amministrazione su una richiesta.
 *
 * Lo stesso componente serve i due lati: cambia solo chi è "io", così il
 * comportamento (invio ottimista, arrivo in tempo reale) resta identico.
 */
export function Conversazione({
  richiestaId,
  messaggiIniziali,
  comeAdmin = false,
  invia,
}: {
  richiestaId: string;
  messaggiIniziali: MessaggioVista[];
  /** Vero nel pannello admin: i messaggi dell'admin appaiono come propri. */
  comeAdmin?: boolean;
  /** Invio specifico del lato: API dal sito, azione server dall'admin. */
  invia: (testo: string) => Promise<MessaggioVista | null>;
}) {
  const [messaggi, setMessaggi] = useState(messaggiIniziali);
  const [bozza, setBozza] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const { ascolta } = useFlusso();

  // Un messaggio dell'altra parte compare senza ricaricare: è il senso
  // stesso di una conversazione.
  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.tipo !== "messaggio") return;
        if (evento.richiestaId !== richiestaId) return;
        const arrivato = evento.messaggio;
        if (!arrivato) return;

        setMessaggi((precedenti) =>
          // L'eco del proprio invio arriva anche a chi l'ha scritto: senza
          // il controllo sull'id comparirebbe due volte.
          precedenti.some((m) => m.id === arrivato.id)
            ? precedenti
            : [...precedenti, arrivato],
        );
      }),
    [ascolta, richiestaId],
  );

  // Scorro in fondo a ogni messaggio nuovo, dove sta la conversazione viva.
  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messaggi.length]);

  async function inviaMessaggio(evento: React.FormEvent) {
    evento.preventDefault();
    const testo = bozza.trim();
    if (!testo || inCorso) return;

    setInCorso(true);
    setErrore(null);

    try {
      const messaggio = await invia(testo);
      if (!messaggio) {
        setErrore("Invio non riuscito. Riprova.");
        vibra("errore");
        return;
      }

      setMessaggi((precedenti) =>
        precedenti.some((m) => m.id === messaggio.id)
          ? precedenti
          : [...precedenti, messaggio],
      );
      setBozza("");
      vibra("successo");
    } catch {
      setErrore("Connessione non riuscita. Riprova.");
      vibra("errore");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div
        role="log"
        aria-label="Conversazione"
        className="nascondi-barra flex max-h-[380px] flex-col gap-2.5 overflow-y-auto border border-[var(--bordo)] p-3 sm:p-4"
      >
        {messaggi.length === 0 ? (
          <p className="mono py-6 text-center text-[12px] text-[var(--testo-tenue)]">
            Nessun messaggio. Scrivi il primo.
          </p>
        ) : (
          messaggi.map((messaggio) => {
            const mio = messaggio.daAdmin === comeAdmin;
            return (
              <motion.div
                key={messaggio.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex max-w-[85%] flex-col gap-1 ${
                  mio ? "self-end items-end" : "self-start items-start"
                }`}
              >
                <div
                  className={`border px-3 py-2 ${
                    mio
                      ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                      : "border-[var(--bordo)] bg-[var(--sfondo-alt)]"
                  }`}
                >
                  <p className="mono whitespace-pre-line text-[13px] leading-[1.6] break-words sm:text-[12.5px]">
                    {messaggio.testo}
                  </p>
                </div>
                <span className="mono text-[10px] text-[var(--testo-debole)]">
                  {messaggio.daAdmin ? "Phantom Lab" : "Cliente"} ·{" "}
                  {orario(messaggio.creatoIl)}
                </span>
              </motion.div>
            );
          })
        )}
        <div ref={fondo} />
      </div>

      <form onSubmit={inviaMessaggio} className="mt-3 flex flex-col gap-2">
        <textarea
          value={bozza}
          onChange={(evento) => setBozza(evento.target.value)}
          onKeyDown={(evento) => {
            // Invio manda, Maiusc+Invio va a capo: su desktop è l'attesa
            // di chiunque abbia usato una chat.
            if (evento.key === "Enter" && !evento.shiftKey) {
              evento.preventDefault();
              void inviaMessaggio(evento);
            }
          }}
          rows={2}
          maxLength={LUNGHEZZA_MASSIMA}
          placeholder="Scrivi un messaggio…"
          aria-label="Scrivi un messaggio"
          /* text-base sotto sm: iOS ingrandisce la pagina sotto i 16px. */
          className="mono w-full resize-none border border-[var(--bordo)] bg-[var(--sfondo)] px-3.5 py-2.5 text-base leading-[1.6] outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)] sm:text-[12.5px]"
        />

        <div className="flex items-center justify-between gap-3">
          <span className="mono text-[10px] text-[var(--testo-debole)]">
            {bozza.length > LUNGHEZZA_MASSIMA - 200 &&
              `${LUNGHEZZA_MASSIMA - bozza.length} caratteri rimasti`}
          </span>
          <button
            type="submit"
            disabled={inCorso || bozza.trim().length === 0}
            className="mono spinta min-h-11 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)] disabled:opacity-50 sm:text-[11px]"
          >
            {inCorso ? "Invio…" : "Invia"}
          </button>
        </div>
      </form>

      <AnimatePresence>
        {errore && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="mono overflow-hidden border border-[var(--allarme)] px-3.5 py-2.5 text-[11.5px] text-[var(--allarme)]"
          >
            {errore}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
