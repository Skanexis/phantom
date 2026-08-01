"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icone } from "@/components/icone";
import { vibra } from "@/components/telegram-provider";
import { Etichetta } from "@/components/ui";

const ambiti = [
  {
    valore: "SITO_WEB",
    etichetta: "Sito web",
    descrizione: "Vetrine, landing, piattaforme",
    icona: "globe",
    codice: "01",
  },
  {
    valore: "APPLICAZIONE",
    etichetta: "Applicazione",
    descrizione: "App web e mobili su misura",
    icona: "app",
    codice: "02",
  },
] as const;

type Ambito = (typeof ambiti)[number]["valore"];

const classiCampo =
  "mono w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-4 py-3.5 text-[13px] text-[var(--testo)] outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)]";

export function FormRichiesta({
  ambitoIniziale,
  automazione,
}: {
  ambitoIniziale?: string;
  /** Arrivando da una scheda di Automazioni: il modulo si riduce a dettagli
   * e budget, senza far ridigitare nome e ambito che sono già impliciti. */
  automazione?: { slug: string; titolo: string } | null;
}) {
  const predefinito = ambiti.some((a) => a.valore === ambitoIniziale)
    ? (ambitoIniziale as Ambito)
    : "SITO_WEB";

  const [ambito, setAmbito] = useState<Ambito>(predefinito);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviata, setInviata] = useState(false);
  const [codice, setCodice] = useState<string | null>(null);

  async function gestisciInvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrore(null);
    setInvio(true);

    const dati = new FormData(evento.currentTarget);

    try {
      const risposta = await fetch("/api/richieste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ambito: automazione ? "AUTOMAZIONE" : ambito,
          automazioneSlug: automazione?.slug,
          // FormData.get() torna null per un campo assente (qui non c'è
          // "nomeContatto" nel modulo semplificato): zod .optional() accetta
          // undefined ma non null, quindi senza questo la validazione
          // fallisce sempre in modalità automazione.
          nomeContatto: dati.get("nomeContatto") || undefined,
          budget: dati.get("budget") || undefined,
          messaggio: dati.get("messaggio") || undefined,
        }),
      });

      if (!risposta.ok) {
        const corpo = await risposta.json().catch(() => null);
        setErrore(corpo?.errore ?? "Invio non riuscito. Riprova.");
        vibra("errore");
        return;
      }

      const esito = await risposta.json().catch(() => null);
      setCodice(esito?.codice ?? null);
      vibra("successo");
      setInviata(true);
    } catch {
      setErrore("Connessione non riuscita. Controlla la rete e riprova.");
      vibra("errore");
    } finally {
      setInvio(false);
    }
  }

  if (inviata) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="crocini relative border border-[var(--bordo)] p-8 sm:p-12"
      >
        <Etichetta className="text-[var(--ok)]">Stato · Confermato</Etichetta>
        <h2 className="display mt-5 text-[34px] sm:text-[46px]">
          Richiesta
          <br />
          inviata
        </h2>
        {codice && (
          <div className="mt-6 inline-flex items-center gap-3 border border-[var(--accento)] px-4 py-3">
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--testo-tenue)]">
              Codice
            </span>
            <span className="mono text-[18px] font-bold tracking-[0.08em] text-[var(--accento)]">
              {codice}
            </span>
          </div>
        )}

        <p className="mono mt-5 max-w-md text-[12.5px] leading-[1.75] text-[var(--testo-tenue)]">
          Abbiamo ricevuto la tua richiesta ed è stata presa in carico.
          {codice
            ? ` Citala con il codice ${codice}: lo trovi anche nell'area personale.`
            : ""}{" "}
          Riceverai gli aggiornamenti dal bot Telegram.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/area-personale"
            className="mono spinta border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-6 py-3.5 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)]"
          >
            Area personale
          </Link>
          <Link
            href="/"
            className="mono spinta border border-[var(--bordo)] px-6 py-3.5 text-center text-[12px] uppercase tracking-[0.14em]"
          >
            Torna alla home
          </Link>
        </div>
      </motion.div>
    );
  }

  if (automazione) {
    return (
      <form onSubmit={gestisciInvio} className="flex flex-col">
        <p className="mono border border-dashed border-[var(--bordo)] px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--testo-tenue)]">
          Ti ricontattiamo sul tuo account Telegram collegato. Non serve
          scrivere altri recapiti: bastano i dettagli qui sotto.
        </p>

        <div className="mt-6 flex flex-col gap-6">
          <Campo
            etichetta="Budget (facoltativo)"
            nome="budget"
            placeholder="Es. 1.000 – 3.000 €"
          />

          <label className="flex flex-col gap-2.5">
            <Etichetta>Dettagli</Etichetta>
            <textarea
              name="messaggio"
              required
              minLength={10}
              rows={6}
              placeholder="Cosa vuoi automatizzare, con quali strumenti lavori oggi, tempistiche."
              className={`${classiCampo} resize-none`}
            />
          </label>
        </div>

        <AnimatePresence>
          {errore && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mono mt-6 border border-[var(--allarme)] px-4 py-3 text-[12px] text-[var(--allarme)]"
            >
              {errore}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={invio}
          className="mono spinta mt-8 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {invio ? "Invio in corso…" : "Invia richiesta →"}
        </button>

        <p className="mono mt-4 text-center text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
          Nessun impegno
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={gestisciInvio} className="flex flex-col">
      <fieldset>
        <legend className="etichetta">Ambito · Seleziona</legend>
        <div className="mt-4 grid border-l border-t border-[var(--bordo)] sm:grid-cols-2">
          {ambiti.map((voce) => {
            const attivo = ambito === voce.valore;
            const IconaAmbito = Icone[voce.icona];
            return (
              <button
                key={voce.valore}
                type="button"
                onClick={() => {
                  vibra();
                  setAmbito(voce.valore);
                }}
                aria-pressed={attivo}
                className={`border-b border-r border-[var(--bordo)] p-5 text-left transition-colors ${
                  attivo
                    ? "bg-[var(--accento)] text-[var(--accento-testo)]"
                    : "hover:bg-[var(--sfondo-alt)]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <IconaAmbito className="h-5 w-5" />
                  <span className="mono text-[10px] tracking-[0.12em] opacity-60">
                    {voce.codice}
                  </span>
                </div>
                <span className="mt-6 block text-[17px] font-semibold tracking-[-0.01em]">
                  {voce.etichetta}
                </span>
                <span
                  className={`mono mt-1 block text-[11px] leading-[1.6] ${
                    attivo ? "opacity-70" : "text-[var(--testo-tenue)]"
                  }`}
                >
                  {voce.descrizione}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-10 flex flex-col gap-6">
        <Campo
          etichetta="Nome"
          nome="nomeContatto"
          placeholder="Mario Rossi"
          richiesto
          minLength={2}
        />
        <Campo
          etichetta="Budget (facoltativo)"
          nome="budget"
          placeholder="Es. 1.000 – 3.000 €"
        />

        {/* Il recapito arriva dal profilo Telegram collegato: chiederlo di
            nuovo significherebbe farsi dettare un dato già disponibile, con
            il rischio di uno username trascritto male. */}
        <p className="mono border border-dashed border-[var(--bordo)] px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--testo-tenue)]">
          Ti ricontattiamo sul tuo account Telegram collegato. Non serve
          scrivere altri recapiti.
        </p>

        <label className="flex flex-col gap-2.5">
          <Etichetta>Descrizione progetto</Etichetta>
          <textarea
            name="messaggio"
            required
            minLength={10}
            rows={6}
            placeholder="Obiettivi, funzionalità desiderate, tempistiche."
            className={`${classiCampo} resize-none`}
          />
        </label>
      </div>

      <AnimatePresence>
        {errore && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mono mt-6 border border-[var(--allarme)] px-4 py-3 text-[12px] text-[var(--allarme)]"
          >
            {errore}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={invio}
        className="mono spinta mt-8 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {invio ? "Invio in corso…" : "Invia richiesta →"}
      </button>

      <p className="mono mt-4 text-center text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
        Nessun impegno
      </p>
    </form>
  );
}

function Campo({
  etichetta,
  nome,
  placeholder,
  richiesto,
  minLength,
}: {
  etichetta: string;
  nome: string;
  placeholder?: string;
  richiesto?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <Etichetta>{etichetta}</Etichetta>
      <input
        name={nome}
        required={richiesto}
        minLength={minLength}
        placeholder={placeholder}
        className={classiCampo}
      />
    </label>
  );
}
