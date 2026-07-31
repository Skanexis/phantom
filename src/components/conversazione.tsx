"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { etichettaGiorno } from "@/lib/tempo";

export type MessaggioVista = {
  id: string;
  testo: string;
  daAdmin: boolean;
  creatoIl: string;
  /** Presente sui messaggi già visti dalla controparte. */
  letto?: boolean;
  /** Vero mentre l'invio è ancora in volo: alimenta lo stato "in corso". */
  inVolo?: boolean;
};

const LUNGHEZZA_MASSIMA = 2000;

function orario(valore: string) {
  return new Date(valore).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Inserisce i separatori di giornata fra i messaggi.
 *
 * Una lista continua di orari non dice dove finisce un giorno e comincia
 * il successivo: leggendo "09:14" non si sa se sia di stamattina o di tre
 * settimane fa.
 */
function conSeparatori(messaggi: MessaggioVista[]) {
  const risultato: (
    | { tipo: "giorno"; chiave: string; etichetta: string }
    | { tipo: "messaggio"; chiave: string; messaggio: MessaggioVista }
  )[] = [];

  let giornoPrecedente = "";

  for (const messaggio of messaggi) {
    const giorno = new Date(messaggio.creatoIl).toDateString();
    if (giorno !== giornoPrecedente) {
      giornoPrecedente = giorno;
      risultato.push({
        tipo: "giorno",
        chiave: `giorno-${giorno}`,
        etichetta: etichettaGiorno(messaggio.creatoIl),
      });
    }
    risultato.push({
      tipo: "messaggio",
      chiave: messaggio.id,
      messaggio,
    });
  }

  return risultato;
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
  const [scriveAltro, setScriveAltro] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);
  const spegniScrive = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoSegnale = useRef(0);
  const { ascolta } = useFlusso();

  // Un messaggio dell'altra parte compare senza ricaricare: è il senso
  // stesso di una conversazione.
  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.richiestaId !== richiestaId) return;

        if (evento.tipo === "scrittura") {
          // Il segnale non ha un "ha smesso": lo spengo da solo poco dopo
          // l'ultimo battito ricevuto.
          if (evento.daAdmin === comeAdmin) return;
          setScriveAltro(true);
          if (spegniScrive.current) clearTimeout(spegniScrive.current);
          spegniScrive.current = setTimeout(() => setScriveAltro(false), 4000);
          return;
        }

        if (evento.tipo === "letto") {
          // La controparte ha aperto la conversazione: le spunte dei miei
          // messaggi diventano verdi.
          if (evento.daAdmin === comeAdmin) return;
          setMessaggi((precedenti) =>
            precedenti.map((m) =>
              m.daAdmin === comeAdmin && !m.letto ? { ...m, letto: true } : m,
            ),
          );
          return;
        }

        if (evento.tipo !== "messaggio") return;
        const arrivato = evento.messaggio;
        if (!arrivato) return;

        // Un messaggio in arrivo chiude comunque l'indicatore di scrittura.
        if (arrivato.daAdmin !== comeAdmin) setScriveAltro(false);

        setMessaggi((precedenti) =>
          // L'eco del proprio invio arriva anche a chi l'ha scritto: senza
          // il controllo sull'id comparirebbe due volte.
          precedenti.some((m) => m.id === arrivato.id)
            ? precedenti
            : [...precedenti, arrivato],
        );
      }),
    [ascolta, comeAdmin, richiestaId],
  );

  useEffect(
    () => () => {
      if (spegniScrive.current) clearTimeout(spegniScrive.current);
    },
    [],
  );

  /**
   * Segnala che si sta scrivendo, al massimo una volta ogni tre secondi:
   * un evento per tasto premuto inonderebbe il flusso senza aggiungere
   * nulla a quello che l'altra parte già vede.
   */
  function segnalaScrittura() {
    const adesso = Date.now();
    if (adesso - ultimoSegnale.current < 3000) return;
    ultimoSegnale.current = adesso;

    fetch("/api/messaggi/scrittura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ richiestaId }),
    }).catch(() => undefined);
  }

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

    // Il messaggio compare subito, in grigio: su rete lenta l'attesa a
    // campo vuoto fa credere che il tocco non sia stato registrato.
    const provvisorio = `bozza-${Date.now()}`;
    setMessaggi((precedenti) => [
      ...precedenti,
      {
        id: provvisorio,
        testo,
        daAdmin: comeAdmin,
        creatoIl: new Date().toISOString(),
        inVolo: true,
      },
    ]);
    setBozza("");

    try {
      const messaggio = await invia(testo);

      if (!messaggio) {
        // Tolgo il provvisorio e restituisco il testo: così non va perso
        // e si può riprovare senza riscriverlo.
        setMessaggi((precedenti) =>
          precedenti.filter((m) => m.id !== provvisorio),
        );
        setBozza(testo);
        setErrore("Invio non riuscito. Riprova.");
        vibra("errore");
        return;
      }

      setMessaggi((precedenti) => [
        ...precedenti.filter(
          (m) => m.id !== provvisorio && m.id !== messaggio.id,
        ),
        messaggio,
      ]);
      vibra("successo");
    } catch {
      setMessaggi((precedenti) =>
        precedenti.filter((m) => m.id !== provvisorio),
      );
      setBozza(testo);
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
          conSeparatori(messaggi).map((voce) => {
            if (voce.tipo === "giorno") {
              return (
                <div key={voce.chiave} className="my-1 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[var(--bordo)]" />
                  <span className="mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--testo-debole)]">
                    {voce.etichetta}
                  </span>
                  <span className="h-px flex-1 bg-[var(--bordo)]" />
                </div>
              );
            }

            const messaggio = voce.messaggio;
            const mio = messaggio.daAdmin === comeAdmin;

            return (
              <motion.div
                key={voce.chiave}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: messaggio.inVolo ? 0.6 : 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex max-w-[85%] flex-col gap-1 ${
                  mio ? "items-end self-end" : "items-start self-start"
                }`}
              >
                <div
                  className={`border px-3 py-2 ${
                    mio
                      ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                      : "border-[var(--bordo)] bg-[var(--sfondo-alt)]"
                  }`}
                >
                  <p className="mono text-[13px] leading-[1.6] break-words whitespace-pre-line sm:text-[12.5px]">
                    {messaggio.testo}
                  </p>
                </div>
                <span className="mono flex items-center gap-1.5 text-[10px] text-[var(--testo-debole)]">
                  {orario(messaggio.creatoIl)}
                  {/* Solo sui propri messaggi: sapere se l'altro ha letto
                      riguarda chi ha scritto, non chi riceve. */}
                  {mio && (
                    <span
                      title={
                        messaggio.inVolo
                          ? "Invio in corso"
                          : messaggio.letto
                            ? "Letto"
                            : "Inviato"
                      }
                      className={
                        messaggio.letto ? "text-[var(--ok)]" : undefined
                      }
                    >
                      {messaggio.inVolo ? "◌" : messaggio.letto ? "✓✓" : "✓"}
                    </span>
                  )}
                </span>
              </motion.div>
            );
          })
        )}

        {/* Chi sta scrivendo dall'altra parte: l'attesa senza segnale fa
            sembrare la conversazione morta. */}
        <AnimatePresence>
          {scriveAltro && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-1.5 self-start border border-[var(--bordo)] px-3 py-2"
            >
              {[0, 1, 2].map((indice) => (
                <motion.span
                  key={indice}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    delay: indice * 0.18,
                  }}
                  className="h-1.5 w-1.5 bg-[var(--testo-tenue)]"
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={fondo} />
      </div>

      <form onSubmit={inviaMessaggio} className="mt-3 flex flex-col gap-2">
        <textarea
          value={bozza}
          onChange={(evento) => {
            setBozza(evento.target.value);
            if (evento.target.value.trim()) segnalaScrittura();
          }}
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
