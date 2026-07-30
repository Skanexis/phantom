"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTelegram, vibra } from "@/components/telegram-provider";
import { Etichetta } from "@/components/ui";

type Fase = "pronto" | "generazione" | "attesa" | "collegato" | "errore";

const INTERVALLO_MS = 2000;
const SCADENZA_MS = 10 * 60 * 1000;

/**
 * Accesso per chi apre il sito da browser: genera un token, apre il bot
 * con /start <token> e attende che il webhook confermi il collegamento.
 */
export function AccessoTelegram({
  titolo = "Accedi con Telegram",
  descrizione = "Per inviare richieste e gestire gli abbonamenti serve un account. Bastano due tocchi: apri il bot e premi Avvia.",
}: {
  titolo?: string;
  descrizione?: string;
}) {
  const [fase, setFase] = useState<Fase>("pronto");
  const [urlBot, setUrlBot] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const intervallo = useRef<ReturnType<typeof setInterval> | null>(null);
  const scadenza = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const { aggiorna } = useTelegram();

  const fermaAttesa = useCallback(() => {
    if (intervallo.current) clearInterval(intervallo.current);
    if (scadenza.current) clearTimeout(scadenza.current);
    intervallo.current = null;
    scadenza.current = null;
  }, []);

  useEffect(() => fermaAttesa, [fermaAttesa]);

  const avvia = useCallback(async () => {
    vibra();
    setFase("generazione");
    setErrore(null);

    try {
      const risposta = await fetch("/api/auth/collega", { method: "POST" });
      const dati = await risposta.json().catch(() => null);

      if (!risposta.ok || !dati?.url) {
        setFase("errore");
        setErrore(dati?.errore ?? "Impossibile avviare il collegamento.");
        return;
      }

      setUrlBot(dati.url);
      setFase("attesa");

      // Dentro Telegram uso l'API nativa, altrimenti una scheda del browser.
      const webApp = window.Telegram?.WebApp;
      if (webApp?.openTelegramLink) webApp.openTelegramLink(dati.url);
      else window.open(dati.url, "_blank", "noopener");

      intervallo.current = setInterval(async () => {
        try {
          const verifica = await fetch("/api/auth/collega", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: dati.token }),
          });
          const esito = await verifica.json().catch(() => null);

          if (esito?.stato === "collegato") {
            fermaAttesa();
            setFase("collegato");
            vibra("successo");
            await aggiorna();
            router.refresh();
          }
        } catch {
          // Errore di rete temporaneo: il ciclo riprova al giro successivo.
        }
      }, INTERVALLO_MS);

      scadenza.current = setTimeout(() => {
        fermaAttesa();
        setFase("errore");
        setErrore("Tempo scaduto. Genera un nuovo link di accesso.");
      }, SCADENZA_MS);
    } catch {
      setFase("errore");
      setErrore("Connessione non riuscita. Riprova.");
    }
  }, [aggiorna, fermaAttesa, router]);

  return (
    <div className="crocini relative border border-[var(--bordo)] p-7 sm:p-10">
      <Etichetta className="text-[var(--accento)]">
        Accesso · Telegram
      </Etichetta>
      <h2 className="display mt-5 text-[30px] sm:text-[40px]">{titolo}</h2>
      <p className="mono mt-4 max-w-md text-[12.5px] leading-[1.75] text-[var(--testo-tenue)]">
        {descrizione}
      </p>

      <AnimatePresence mode="wait">
        {fase === "collegato" ? (
          <motion.div
            key="collegato"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <p className="mono border border-[var(--ok)] px-4 py-3 text-[12px] text-[var(--ok)]">
              ✓ Account collegato. Stiamo aggiornando la pagina…
            </p>
          </motion.div>
        ) : fase === "attesa" ? (
          <motion.div
            key="attesa"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <div className="flex items-center gap-3 border border-[var(--bordo)] px-4 py-3.5">
              <motion.span
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="h-2 w-2 shrink-0 bg-[var(--accento)]"
              />
              <p className="mono text-[12px] leading-[1.6] text-[var(--testo-tenue)]">
                In attesa della conferma da Telegram. Premi{" "}
                <span className="text-[var(--testo)]">Avvia</span> nel bot.
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              {urlBot && (
                <a
                  href={urlBot}
                  target="_blank"
                  rel="noreferrer"
                  className="mono spinta border border-[var(--bordo)] px-4 py-2.5 text-[11px] uppercase tracking-[0.12em]"
                >
                  Riapri il bot
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  fermaAttesa();
                  setFase("pronto");
                  setUrlBot(null);
                }}
                className="mono px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-debole)] transition-colors hover:text-[var(--testo)]"
              >
                Annulla
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="pronto"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <button
              type="button"
              onClick={avvia}
              disabled={fase === "generazione"}
              className="mono spinta border border-[var(--accento)] bg-[var(--accento)] px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--accento-testo)] disabled:opacity-60"
            >
              {fase === "generazione" ? "Generazione…" : "Apri in Telegram →"}
            </button>

            {errore && (
              <p className="mono mt-4 border border-[var(--allarme)] px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--allarme)]">
                {errore}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mono mt-6 border-t border-dashed border-[var(--bordo)] pt-4 text-[11px] leading-[1.6] text-[var(--testo-debole)]">
        Nessuna password. L&apos;account è lo stesso che usi nella Mini App: se
        hai già scritto al bot, ritrovi le tue richieste.
      </p>
    </div>
  );
}
