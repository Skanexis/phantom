"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { Conversazione, type MessaggioVista } from "@/components/conversazione";
import { Scheletro } from "@/components/dettagli";

/**
 * Conversazione nell'area personale, richiudibile sotto ogni richiesta.
 *
 * I messaggi si caricano alla prima apertura invece che con la pagina: con
 * dieci richieste sarebbero dieci query per contenuto quasi sempre chiuso.
 */
export function ConversazioneCliente({
  richiestaId,
  codice,
  nonLetti,
}: {
  richiestaId: string;
  codice: string | null;
  /** Messaggi dell'admin non ancora letti, per il pallino di richiamo. */
  nonLetti: number;
}) {
  const [aperta, setAperta] = useState(false);
  const [messaggi, setMessaggi] = useState<MessaggioVista[] | null>(null);
  const [daLeggere, setDaLeggere] = useState(nonLetti);
  const { ascolta } = useFlusso();

  // Il pallino si aggiorna anche a conversazione chiusa: è il segnale che
  // dice all'utente dove guardare.
  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.tipo !== "messaggio") return;
        if (evento.richiestaId !== richiestaId) return;
        if (evento.messaggio?.daAdmin && !aperta) {
          setDaLeggere((valore) => valore + 1);
        }
      }),
    [ascolta, richiestaId, aperta],
  );

  const carica = useCallback(async () => {
    try {
      const risposta = await fetch(
        `/api/messaggi?richiesta=${encodeURIComponent(richiestaId)}`,
      );
      const dati = await risposta.json().catch(() => null);
      setMessaggi(Array.isArray(dati?.messaggi) ? dati.messaggi : []);
    } catch {
      setMessaggi([]);
    }
  }, [richiestaId]);

  const apri = useCallback(
    async (forzaApertura = false) => {
      vibra();
      const prossimo = forzaApertura || !aperta;
      setAperta(prossimo);
      if (!prossimo) return;

      setDaLeggere(0);
      if (!messaggi) await carica();
    },
    [aperta, carica, messaggi],
  );

  /**
   * Scorrimento verso sinistra sulla scheda per aprire la conversazione.
   *
   * Il pulsante resta il modo principale: il gesto è una scorciatoia per
   * chi lo conosce, non l'unico accesso.
   */
  const tocco = useRef<{ x: number; y: number } | null>(null);

  function inizioTocco(evento: React.TouchEvent) {
    tocco.current = {
      x: evento.touches[0].clientX,
      y: evento.touches[0].clientY,
    };
  }

  function fineTocco(evento: React.TouchEvent) {
    if (!tocco.current) return;
    const partenza = tocco.current;
    tocco.current = null;

    const dx = evento.changedTouches[0].clientX - partenza.x;
    const dy = evento.changedTouches[0].clientY - partenza.y;

    // Orizzontale e deciso: senza il confronto con dy uno scorrimento
    // verticale della pagina aprirebbe la conversazione per sbaglio.
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 2 && !aperta) {
      void apri(true);
    }
  }

  const invia = useCallback(
    async (testo: string) => {
      const risposta = await fetch("/api/messaggi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ richiestaId, testo }),
      });
      if (!risposta.ok) return null;
      const dati = await risposta.json().catch(() => null);
      return (dati?.messaggio as MessaggioVista) ?? null;
    },
    [richiestaId],
  );

  return (
    <div
      className="mt-4 sm:pl-[calc(1rem+3ch)]"
      onTouchStart={inizioTocco}
      onTouchEnd={fineTocco}
    >
      <button
        type="button"
        onClick={() => void apri()}
        aria-expanded={aperta}
        className="mono flex min-h-11 items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: aperta ? 90 : 0 }}
          transition={{ duration: 0.18 }}
        >
          ▸
        </motion.span>
        {aperta ? "Chiudi conversazione" : "Scrivici"}
        {/* Un gesto invisibile non esiste: l'indizio compare solo dove il
            gesto è disponibile, cioè sul touch. */}
        {!aperta && (
          <span className="text-[9px] text-[var(--testo-debole)] sm:hidden">
            o scorri ←
          </span>
        )}
        {daLeggere > 0 && !aperta && (
          <motion.span
            key={daLeggere}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            className="flex h-4 min-w-4 items-center justify-center bg-[var(--allarme)] px-1 text-[9px] font-bold text-white"
          >
            {daLeggere}
          </motion.span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {aperta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              {messaggi === null ? (
                <div className="border border-[var(--bordo)] p-4">
                  <Scheletro righe={4} />
                </div>
              ) : (
                <>
                  <p className="mono mb-2 text-[11px] text-[var(--testo-debole)]">
                    Conversazione su {codice ?? "questa richiesta"}. Rispondiamo
                    anche via Telegram.
                  </p>
                  <Conversazione
                    richiestaId={richiestaId}
                    messaggiIniziali={messaggi}
                    invia={invia}
                  />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
