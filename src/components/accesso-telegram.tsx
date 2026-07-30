"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useTelegram, vibra } from "@/components/telegram-provider";
import { Etichetta } from "@/components/ui";

type Fase = "pronto" | "generazione" | "attesa" | "collegato" | "errore";

const INTERVALLO_MS = 2000;
const SCADENZA_MS = 10 * 60 * 1000;

/**
 * Transizione dei blocchi di fase: entrata a scatto, coerente con le
 * transizioni steps() del resto del sistema.
 */
const blocco = {
  entra: { opacity: 0, y: 10 },
  visibile: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
  },
  esce: { opacity: 0, y: -6, transition: { duration: 0.14 } },
};

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
  // Popolata da avvia(): permette di forzare una verifica fuori dal ciclo.
  const verificaOra = useRef<(() => void) | null>(null);
  const router = useRouter();
  const { aggiorna } = useTelegram();

  const fermaAttesa = useCallback(() => {
    if (intervallo.current) clearInterval(intervallo.current);
    if (scadenza.current) clearTimeout(scadenza.current);
    intervallo.current = null;
    scadenza.current = null;
  }, []);

  useEffect(() => fermaAttesa, [fermaAttesa]);

  // I browser rallentano setInterval nelle schede in secondo piano fino a
  // una volta al minuto: tornando dal bot l'utente aspetterebbe a vuoto,
  // convinto che l'accesso non sia riuscito. Al rientro verifico subito.
  useEffect(() => {
    if (fase !== "attesa") return;

    const alRientro = () => {
      if (document.visibilityState === "visible") verificaOra.current?.();
    };

    document.addEventListener("visibilitychange", alRientro);
    window.addEventListener("focus", alRientro);
    return () => {
      document.removeEventListener("visibilitychange", alRientro);
      window.removeEventListener("focus", alRientro);
    };
  }, [fase]);

  const avvia = useCallback(async () => {
    vibra();
    setFase("generazione");
    setErrore(null);

    // La scheda va aperta ORA, nel gesto di clic: dopo il primo await il
    // browser non collega più window.open al clic e blocca il popup. Resta
    // vuota per una frazione di secondo, poi le assegno l'URL definitivo.
    //
    // Niente "noopener" fra le opzioni: con quel flag il browser restituisce
    // null e perderei il riferimento alla scheda, che resterebbe bianca per
    // sempre. Taglio il legame dopo, azzerando opener sulla nuova finestra.
    const webApp = window.Telegram?.WebApp;
    const dentroTelegram = Boolean(webApp?.openTelegramLink);
    const scheda = dentroTelegram ? null : window.open("", "_blank");
    if (scheda) {
      try {
        scheda.opener = null;
      } catch {
        // Alcuni browser rendono opener di sola lettura: non è bloccante.
      }
    }

    try {
      const risposta = await fetch("/api/auth/collega", { method: "POST" });
      const dati = await risposta.json().catch(() => null);

      if (!risposta.ok || !dati?.url) {
        scheda?.close();
        setFase("errore");
        setErrore(dati?.errore ?? "Impossibile avviare il collegamento.");
        return;
      }

      setUrlBot(dati.url);
      setFase("attesa");

      // Dentro Telegram uso l'API nativa, altrimenti la scheda già aperta.
      if (dentroTelegram) {
        webApp!.openTelegramLink!(dati.url);
      } else if (scheda && !scheda.closed) {
        scheda.location.href = dati.url;
      } else {
        // Popup bloccato: un secondo tentativo fuori dal gesto riesce su
        // parecchi browser. Se fallisce anche questo resta il pulsante
        // "Riapri il bot": è un <a> in un clic diretto, mai bloccato.
        window.open(dati.url, "_blank", "noopener,noreferrer");
      }

      let inCorso = false;

      const verifica = async () => {
        // Evita richieste sovrapposte quando il rientro sulla scheda
        // coincide con un giro del ciclo.
        if (inCorso) return;
        inCorso = true;

        try {
          const risposta = await fetch("/api/auth/collega", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: dati.token }),
          });
          const esito = await risposta.json().catch(() => null);

          if (esito?.stato === "collegato") {
            fermaAttesa();
            verificaOra.current = null;
            setFase("collegato");
            vibra("successo");
            await aggiorna();
            router.refresh();
          }
        } catch {
          // Errore di rete temporaneo: il ciclo riprova al giro successivo.
        } finally {
          inCorso = false;
        }
      };

      verificaOra.current = verifica;
      intervallo.current = setInterval(verifica, INTERVALLO_MS);

      scadenza.current = setTimeout(() => {
        fermaAttesa();
        setFase("errore");
        setErrore("Tempo scaduto. Genera un nuovo link di accesso.");
      }, SCADENZA_MS);
    } catch {
      scheda?.close();
      setFase("errore");
      setErrore("Connessione non riuscita. Riprova.");
    }
  }, [aggiorna, fermaAttesa, router]);

  return (
    // "user": chi ha chiesto meno movimento nel sistema operativo riceve solo
    // le dissolvenze, senza i cicli continui di scansione e pulsazione.
    <MotionConfig reducedMotion="user">
      <div className="crocini relative overflow-hidden border border-[var(--bordo)] p-6 sm:p-10">
        {/* Bagliore d'accento appena percepibile dietro l'angolo alto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[var(--accento)] opacity-[0.07] blur-3xl"
        />

        <div className="relative">
          <Etichetta className="text-[var(--accento)]">
            Accesso · Telegram
          </Etichetta>
          <h2 className="display mt-5 text-[28px] leading-[1.05] sm:text-[40px]">
            {titolo}
          </h2>
          <p className="mono mt-4 max-w-md text-[12.5px] leading-[1.75] text-[var(--testo-tenue)]">
            {descrizione}
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {fase === "collegato" ? (
            <motion.div
              key="collegato"
              variants={blocco}
              initial="entra"
              animate="visibile"
              exit="esce"
              className="relative mt-8"
            >
              <div className="flex items-center gap-3 border border-[var(--ok)] px-4 py-3.5">
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="mono shrink-0 text-[14px] leading-none text-[var(--ok)]"
                >
                  ✓
                </motion.span>
                <p className="mono text-[12px] leading-[1.6] text-[var(--ok)]">
                  Account collegato. Stiamo aggiornando la pagina…
                </p>
              </div>

              {/* Barra di avanzamento: dà un termine visibile all'attesa. */}
              <div className="mt-2 h-[2px] w-full overflow-hidden bg-[var(--bordo)]">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.4, ease: "easeOut" }}
                  className="h-full origin-left bg-[var(--ok)]"
                />
              </div>
            </motion.div>
          ) : fase === "attesa" ? (
            <motion.div
              key="attesa"
              variants={blocco}
              initial="entra"
              animate="visibile"
              exit="esce"
              role="status"
              className="relative mt-8"
            >
              <div className="relative overflow-hidden border border-[var(--bordo)] px-4 py-3.5">
                {/* Scansione orizzontale: segnala lavoro in corso senza rumore. */}
                <motion.div
                  aria-hidden
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[var(--accento)] to-transparent opacity-[0.08]"
                />
                <div className="relative flex items-center gap-3">
                  <motion.span
                    animate={{ opacity: [1, 0.15, 1] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="h-2 w-2 shrink-0 bg-[var(--accento)]"
                  />
                  <p className="mono text-[12px] leading-[1.6] text-[var(--testo-tenue)]">
                    In attesa della conferma da Telegram. Premi{" "}
                    <span className="text-[var(--testo)]">Avvia</span> nel bot.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                {urlBot && (
                  <a
                    href={urlBot}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => vibra()}
                    className="mono spinta flex min-h-[44px] items-center justify-center border border-[var(--bordo)] px-4 text-[11px] uppercase tracking-[0.12em] sm:justify-start"
                  >
                    Riapri il bot ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    vibra();
                    fermaAttesa();
                    setFase("pronto");
                    setUrlBot(null);
                  }}
                  className="mono flex min-h-[44px] items-center justify-center px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-debole)] transition-colors hover:text-[var(--testo)] sm:justify-start"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pronto"
              variants={blocco}
              initial="entra"
              animate="visibile"
              exit="esce"
              className="relative mt-8"
            >
              <motion.button
                type="button"
                onClick={avvia}
                disabled={fase === "generazione"}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 600, damping: 30 }}
                className="mono spinta flex min-h-[52px] w-full items-center justify-center gap-2 border border-[var(--accento)] bg-[var(--accento)] px-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--accento-testo)] disabled:opacity-60 sm:w-auto"
              >
                {fase === "generazione" ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="h-3 w-3 border border-current border-t-transparent"
                    />
                    Generazione…
                  </>
                ) : (
                  <>
                    Apri in Telegram
                    <motion.span
                      aria-hidden
                      animate={{ x: [0, 3, 0] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      →
                    </motion.span>
                  </>
                )}
              </motion.button>

              <p className="mono mt-3 text-[11px] leading-[1.6] text-[var(--testo-debole)]">
                Si apre in una nuova scheda ↗
              </p>

              <AnimatePresence>
                {errore && (
                  <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    role="alert"
                    className="mono overflow-hidden border border-[var(--allarme)] px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--allarme)]"
                  >
                    {errore}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mono relative mt-6 border-t border-dashed border-[var(--bordo)] pt-4 text-[11px] leading-[1.6] text-[var(--testo-debole)]">
          Nessuna password. L&apos;account è lo stesso che usi nella Mini App:
          se hai già scritto al bot, ritrovi le tue richieste.
        </p>
      </div>
    </MotionConfig>
  );
}
