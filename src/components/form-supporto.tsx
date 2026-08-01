"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icona } from "@/components/icone";
import { vibra } from "@/components/telegram-provider";
import { Etichetta } from "@/components/ui";
import { TIPI_SUPPORTO, type TipoSupportoValore } from "@/lib/supporto";

export function FormSupporto() {
  const [tipo, setTipo] = useState<TipoSupportoValore>("PROBLEMA");
  const [messaggio, setMessaggio] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviata, setInviata] = useState(false);
  const [codice, setCodice] = useState<string | null>(null);

  const vocePrescelta = TIPI_SUPPORTO.find((v) => v.valore === tipo)!;

  async function gestisciInvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrore(null);
    setInvio(true);

    try {
      const risposta = await fetch("/api/richieste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ambito: "SUPPORTO",
          tipoSupporto: tipo,
          messaggio,
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
          Messaggio
          <br />
          inviato
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
          Il team lo legge a breve e ti risponde dal bot Telegram.
          {codice ? ` Lo trovi anche nell'area personale con il codice ${codice}.` : ""}
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
        <legend className="etichetta">Tipo · Seleziona</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TIPI_SUPPORTO.map((voce) => {
            const attivo = tipo === voce.valore;
            return (
              <button
                key={voce.valore}
                type="button"
                onClick={() => {
                  vibra();
                  setTipo(voce.valore);
                }}
                aria-pressed={attivo}
                className="spinta flex flex-col gap-4 border p-5 text-left transition-colors"
                style={{
                  borderColor: voce.colore,
                  backgroundColor: attivo ? voce.colore : "transparent",
                }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center border"
                  style={{
                    borderColor: attivo ? "transparent" : voce.colore,
                    color: attivo ? "var(--testo-inverso)" : voce.colore,
                  }}
                >
                  <Icona nome={voce.icona} className="h-5 w-5" />
                </span>
                <span>
                  <span
                    className="block text-[17px] font-semibold tracking-[-0.01em]"
                    style={{ color: attivo ? "var(--testo-inverso)" : "var(--testo)" }}
                  >
                    {voce.etichetta}
                  </span>
                  <span
                    className="mono mt-1 block text-[11px] leading-[1.6]"
                    style={{
                      color: attivo ? "var(--testo-inverso)" : "var(--testo-tenue)",
                      opacity: attivo ? 0.8 : 1,
                    }}
                  >
                    {voce.descrizione}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-10 flex flex-col gap-6">
        <label className="flex flex-col gap-2.5">
          <Etichetta>
            {vocePrescelta.valore === "PROBLEMA"
              ? "Cosa sta succedendo"
              : vocePrescelta.valore === "DOMANDA"
                ? "Qual è la domanda"
                : "Cosa miglioreresti"}
          </Etichetta>
          <textarea
            name="messaggio"
            required
            minLength={10}
            maxLength={2000}
            rows={7}
            value={messaggio}
            onChange={(evento) => setMessaggio(evento.target.value)}
            placeholder={
              vocePrescelta.valore === "PROBLEMA"
                ? "Cosa hai fatto, cosa ti aspettavi e cosa succede invece."
                : vocePrescelta.valore === "DOMANDA"
                  ? "Racconta il contesto: rispondiamo più in fretta se sappiamo cosa stai cercando di fare."
                  : "Descrivi l'idea e perché renderebbe le cose migliori."
            }
            className="mono w-full resize-none border border-[var(--bordo)] bg-[var(--sfondo)] px-4 py-3.5 text-[13px] text-[var(--testo)] outline-none transition-colors placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)]"
          />
        </label>

        <p className="mono border border-dashed border-[var(--bordo)] px-4 py-3 text-[11.5px] leading-[1.6] text-[var(--testo-tenue)]">
          Scriviamo dal tuo account Telegram collegato e dal tuo piano
          attivo: non serve nessun altro recapito.
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
        className="mono spinta mt-8 border px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: vocePrescelta.colore,
          backgroundColor: vocePrescelta.colore,
          color: "var(--testo-inverso)",
        }}
      >
        {invio ? "Invio in corso…" : `Invia · ${vocePrescelta.etichetta} →`}
      </button>

      <p className="mono mt-4 text-center text-[11px] uppercase tracking-[0.1em] text-[var(--testo-debole)]">
        Riservato a chi ha un abbonamento attivo
      </p>
    </form>
  );
}
