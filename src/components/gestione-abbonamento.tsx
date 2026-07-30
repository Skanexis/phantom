"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

type Piano = {
  slug: string;
  nome: string;
  prezzo: string;
  periodo: string;
};

/**
 * Cambio di piano dall'area personale.
 *
 * Il pannello resta chiuso finché non serve: nella scheda dell'abbonamento
 * l'informazione principale è lo stato, non l'elenco delle alternative.
 */
export function GestioneAbbonamento({
  sottoscrizioneId,
  pianiAlternativi,
}: {
  sottoscrizioneId: string;
  pianiAlternativi: Piano[];
}) {
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [esito, setEsito] = useState<{
    tipo: "ok" | "errore";
    testo: string;
  } | null>(null);
  const router = useRouter();

  if (pianiAlternativi.length === 0) return null;

  async function cambia(piano: Piano) {
    if (inCorso) return;

    setInCorso(piano.slug);
    setEsito(null);

    try {
      const risposta = await fetch("/api/abbonamenti/cambia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sottoscrizioneId, slug: piano.slug }),
      });
      const corpo = await risposta.json().catch(() => null);

      if (!risposta.ok) {
        setEsito({
          tipo: "errore",
          testo: corpo?.errore ?? "Cambio non riuscito.",
        });
        vibra("errore");
        return;
      }

      setEsito({
        tipo: "ok",
        testo: `Richiesta inviata: passaggio a ${piano.nome}. Il piano attuale resta attivo fino alla conferma.`,
      });
      vibra("successo");
      setAperto(false);
      router.refresh();
    } catch {
      setEsito({ tipo: "errore", testo: "Connessione non riuscita. Riprova." });
      vibra("errore");
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          vibra();
          setAperto((valore) => !valore);
          setEsito(null);
        }}
        aria-expanded={aperto}
        className="mono flex min-h-11 items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: aperto ? 90 : 0 }}
          transition={{ duration: 0.18 }}
        >
          ▸
        </motion.span>
        {aperto ? "Chiudi" : "Cambia piano"}
      </button>

      <AnimatePresence initial={false}>
        {aperto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-2 border-l-2 border-[var(--bordo)] pl-4">
              {pianiAlternativi.map((piano) => (
                <button
                  key={piano.slug}
                  type="button"
                  onClick={() => cambia(piano)}
                  disabled={inCorso !== null}
                  className="mono spinta flex min-h-12 items-center justify-between gap-3 border border-[var(--bordo)] px-4 py-2.5 text-left text-[12px] disabled:opacity-60"
                >
                  <span className="font-semibold">{piano.nome}</span>
                  <span className="shrink-0 text-[11px] text-[var(--testo-tenue)]">
                    {inCorso === piano.slug
                      ? "Invio…"
                      : `${piano.prezzo}/${piano.periodo} →`}
                  </span>
                </button>
              ))}
              <p className="mono text-[11px] leading-[1.6] text-[var(--testo-debole)]">
                Il passaggio richiede la nostra conferma. Fino ad allora il
                piano attuale resta attivo.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {esito && (
          <motion.p
            role="status"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className={`mono overflow-hidden border px-3.5 py-2.5 text-[11.5px] leading-[1.6] ${
              esito.tipo === "ok"
                ? "border-[var(--ok)] text-[var(--ok)]"
                : "border-[var(--allarme)] text-[var(--allarme)]"
            }`}
          >
            {esito.testo}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
