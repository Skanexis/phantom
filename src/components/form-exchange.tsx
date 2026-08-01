"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icona } from "@/components/icone";
import { vibra } from "@/components/telegram-provider";
import { Etichetta, Freccia } from "@/components/ui";
import {
  CRIPTOVALUTE,
  DIREZIONI_SCAMBIO,
  COMMISSIONE_PERCENTUALE,
  calcolaCommissione,
  formattaEuro,
  type CriptovalutaValore,
  type DirezioneScambioValore,
} from "@/lib/scambio";

const classiCampo =
  "mono w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-4 py-3.5 text-[13px] text-[var(--testo)] outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)]";

export function FormExchange() {
  const [direzione, setDirezione] =
    useState<DirezioneScambioValore>("CRIPTO_CONTANTI");
  const [cripto, setCripto] = useState<CriptovalutaValore>("BTC");
  const [importo, setImporto] = useState("");
  const [nota, setNota] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviata, setInviata] = useState(false);
  const [codice, setCodice] = useState<string | null>(null);

  const importoCentesimi = useMemo(() => {
    const numero = Number(importo.replace(",", "."));
    return Number.isFinite(numero) && numero > 0
      ? Math.round(numero * 100)
      : 0;
  }, [importo]);

  const { commissioneCentesimi, nettoCentesimi } =
    calcolaCommissione(importoCentesimi);

  async function gestisciInvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrore(null);

    if (importoCentesimi < 1000) {
      setErrore("Indica un importo di almeno 10 €.");
      vibra("errore");
      return;
    }

    setInvio(true);
    try {
      const risposta = await fetch("/api/richieste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ambito: "EXCHANGE",
          direzioneScambio: direzione,
          criptovaluta: cripto,
          importoCentesimi,
          messaggio: nota,
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
          Confermiamo il cambio concordando il tasso al momento della
          transazione e ti scriviamo dal bot Telegram per i dettagli
          operativi.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/area-personale?scheda=richieste"
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

  return (
    <form onSubmit={gestisciInvio} className="flex flex-col">
      <fieldset>
        <legend className="etichetta">Direzione · Seleziona</legend>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DIREZIONI_SCAMBIO.map((voce) => {
            const attivo = direzione === voce.valore;
            return (
              <button
                key={voce.valore}
                type="button"
                onClick={() => {
                  vibra();
                  setDirezione(voce.valore);
                }}
                aria-pressed={attivo}
                className={`spinta flex items-center gap-4 border p-4 text-left transition-colors ${
                  attivo
                    ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                    : "border-[var(--bordo)] hover:bg-[var(--sfondo-alt)]"
                }`}
              >
                <span className="flex shrink-0 items-center gap-1.5">
                  <Icona nome={voce.da} className="h-6 w-6" />
                  <Freccia className="h-3 w-3 opacity-60" />
                  <Icona nome={voce.a} className="h-6 w-6" />
                </span>
                <span className="text-[13px] font-semibold leading-[1.35] tracking-[-0.01em]">
                  {voce.etichetta}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="etichetta">Criptovaluta</legend>
        <div className="mt-4 flex gap-3">
          {CRIPTOVALUTE.map((voce) => {
            const attivo = cripto === voce.valore;
            return (
              <button
                key={voce.valore}
                type="button"
                onClick={() => {
                  vibra();
                  setCripto(voce.valore);
                }}
                aria-pressed={attivo}
                className={`spinta mono flex-1 border px-4 py-3 text-[13px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  attivo
                    ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                    : "border-[var(--bordo)] hover:bg-[var(--sfondo-alt)]"
                }`}
              >
                {voce.valore}
                <span className="mono ml-2 text-[10px] font-normal normal-case opacity-70">
                  {voce.etichetta}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-col gap-6">
        <label className="flex flex-col gap-2.5">
          <Etichetta>Importo della transazione (EUR)</Etichetta>
          <input
            inputMode="decimal"
            required
            placeholder="Es. 500"
            value={importo}
            onChange={(evento) => setImporto(evento.target.value)}
            className={classiCampo}
          />
        </label>

        {/* Calcolatore: solo aritmetica sulla commissione, nessun cambio
            cripto/fiat inventato — quello si conferma alla transazione. */}
        <div className="border border-dashed border-[var(--bordo)] p-4 sm:p-5">
          <dl className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <dt className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
                Importo
              </dt>
              <dd className="mono text-[13px]">
                {formattaEuro(importoCentesimi)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
                Commissione ({COMMISSIONE_PERCENTUALE}%)
              </dt>
              <dd className="mono text-[13px] text-[var(--allarme)]">
                −{formattaEuro(commissioneCentesimi)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-dashed border-[var(--bordo)] pt-2">
              <dt className="text-[13px] font-semibold tracking-[-0.01em]">
                Riceverai
              </dt>
              <dd className="display text-[22px]">
                {formattaEuro(nettoCentesimi)}
              </dd>
            </div>
          </dl>
          <p className="mono mt-4 text-[10.5px] leading-[1.6] text-[var(--testo-debole)]">
            Controvalore indicativo in euro. Il cambio {cripto} applicato è
            quello concordato al momento della transazione, non quello del
            modulo.
          </p>
        </div>

        <label className="flex flex-col gap-2.5">
          <Etichetta>Note (facoltative)</Etichetta>
          <textarea
            rows={4}
            maxLength={2000}
            value={nota}
            onChange={(evento) => setNota(evento.target.value)}
            placeholder="Orario preferito, metodo di consegna, altri dettagli."
            className={`${classiCampo} resize-none`}
          />
        </label>

        <p className="mono border border-dashed border-[var(--bordo)] px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--testo-tenue)]">
          Scriviamo dal tuo account Telegram collegato: non serve nessun
          altro recapito.
        </p>
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
        {invio ? "Invio in corso…" : "Richiedi il cambio →"}
      </button>

      <p className="mono mt-4 text-center text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
        Nessun impegno
      </p>
    </form>
  );
}
