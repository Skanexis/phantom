"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { Conversazione, type MessaggioVista } from "@/components/conversazione";
import { Foglio } from "@/components/foglio";

/**
 * Conversazione della richiesta nel pannello admin.
 *
 * Su mobile si apre a tutto schermo: dentro la scheda finiva in fondo a
 * cinque schermate di modulo, con uno scorrimento proprio annidato in
 * quello della pagina — impossibile da usare col pollice. Da sm in su
 * resta in linea, dove lo spazio non manca.
 */
export function ConversazioneAdmin({
  richiestaId,
  codice,
  cliente,
  messaggiIniziali,
  invia,
}: {
  richiestaId: string;
  codice: string | null;
  /** Mostrato nell'intestazione del foglio: con chi si sta parlando. */
  cliente: string;
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
    messaggiIniziali.filter((m) => !m.daAdmin && !m.letto).length,
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

  const chiudi = useCallback(() => setAperta(false), []);

  const ultimo = messaggiIniziali[messaggiIniziali.length - 1];

  const spunta = (
    <label className="mono flex min-h-11 cursor-pointer items-center gap-2.5 text-[11px] text-[var(--testo-tenue)] select-none">
      <input
        type="checkbox"
        checked={soloSulSito}
        onChange={(evento) => setSoloSulSito(evento.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accento)]"
      />
      Solo sul sito, senza avviso Telegram
    </label>
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
        className="flex w-full items-center gap-3 py-1 text-left"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: aperta ? 90 : 0 }}
          transition={{ duration: 0.18 }}
          className="mono shrink-0 text-[12px] text-[var(--accento)] max-sm:hidden"
        >
          ▸
        </motion.span>

        <span className="min-w-0 flex-1">
          <span className="mono flex items-center gap-2 text-[11px] tracking-[0.12em] text-[var(--testo-tenue)] uppercase">
            Conversazione
            <span className="text-[var(--testo-debole)]">
              ({messaggiIniziali.length})
            </span>
            {daLeggere > 0 && (
              <motion.span
                key={daLeggere}
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                className="flex h-4 min-w-4 items-center justify-center bg-[var(--allarme)] px-1 text-[9px] font-bold text-white"
              >
                {daLeggere}
              </motion.span>
            )}
          </span>

          {/* Anteprima dell'ultimo messaggio: dice se c'è qualcosa da
              leggere senza dover aprire nulla. */}
          {ultimo && (
            <span className="mono mt-1 block truncate text-[12px] text-[var(--testo-tenue)]">
              {ultimo.daAdmin ? "Tu: " : ""}
              {ultimo.testo}
            </span>
          )}
        </span>

        <span
          aria-hidden="true"
          className="mono shrink-0 text-[16px] text-[var(--testo-debole)] sm:hidden"
        >
          →
        </span>
      </button>

      {/* Mobile: foglio a tutto schermo. */}
      <Foglio
        aperto={aperta}
        onChiudi={chiudi}
        titolo={codice ?? "Conversazione"}
        sottotitolo={cliente}
      >
        <Conversazione
          richiestaId={richiestaId}
          messaggiIniziali={messaggiIniziali}
          comeAdmin
          aTuttoSchermo
          invia={inviaTesto}
        />
        <div className="shrink-0 border-t border-[var(--bordo)] px-3 pb-1">
          {spunta}
        </div>
      </Foglio>

      {/* Da sm in su: in linea, come prima. */}
      <AnimatePresence initial={false}>
        {aperta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden max-sm:hidden"
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
              <div className="mt-2.5">{spunta}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
