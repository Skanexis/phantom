"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { Conversazione, type MessaggioVista } from "@/components/conversazione";

/**
 * Conversazione dentro la scheda della richiesta, nel pannello admin.
 *
 * I messaggi arrivano già dal server: nel pannello l'admin li vuole vedere
 * subito, senza un secondo passaggio di caricamento.
 */
export function ConversazioneAdmin({
  richiestaId,
  messaggiIniziali,
  invia,
}: {
  richiestaId: string;
  messaggiIniziali: MessaggioVista[];
  /** Azione server passata dalla pagina, che è un componente server. */
  invia: (
    richiestaId: string,
    testo: string,
    soloSulSito?: boolean,
  ) => Promise<MessaggioVista | null>;
}) {
  const [aperta, setAperta] = useState(false);
  const [soloSulSito, setSoloSulSito] = useState(false);
  const [daLeggere, setDaLeggere] = useState(
    messaggiIniziali.filter((m) => !m.daAdmin).length,
  );
  const { ascolta } = useFlusso();

  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.tipo !== "messaggio") return;
        if (evento.richiestaId !== richiestaId) return;
        if (!evento.messaggio?.daAdmin && !aperta) {
          setDaLeggere((valore) => valore + 1);
        }
      }),
    [ascolta, richiestaId, aperta],
  );

  const inviaTesto = useCallback(
    (testo: string) => invia(richiestaId, testo, soloSulSito),
    [invia, richiestaId, soloSulSito],
  );

  return (
    <div className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4">
      <button
        type="button"
        onClick={() => {
          vibra();
          setAperta((valore) => !valore);
          setDaLeggere(0);
        }}
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
        Conversazione
        <span className="text-[var(--testo-debole)]">
          ({messaggiIniziali.length})
        </span>
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
              <Conversazione
                richiestaId={richiestaId}
                messaggiIniziali={messaggiIniziali}
                comeAdmin
                invia={inviaTesto}
              />

              {/* Per default il cliente riceve l'avviso dal bot: è il senso
                  della comunicazione. La spunta serve ai casi in cui basta
                  lasciare traccia sul sito. */}
              <label className="mono mt-2.5 flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-[11px] text-[var(--testo-tenue)]">
                <input
                  type="checkbox"
                  checked={soloSulSito}
                  onChange={(evento) => setSoloSulSito(evento.target.checked)}
                  className="h-4 w-4 shrink-0 accent-[var(--accento)]"
                />
                Solo sul sito, senza avviso Telegram
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
