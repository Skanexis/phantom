"use client";

import { useState } from "react";
import type { CausaEsclusione } from "@/lib/bandi";

/**
 * «È uno sbaglio»: il canale di ritorno di chi è stato bloccato.
 *
 * Esiste perché il bando di rete produce falsi positivi per costruzione —
 * colpisce un intervallo di indirizzi, e dietro quegli indirizzi ci sono
 * anche persone che non c'entrano. Senza questo modulo, l'unico modo che un
 * estraneo aveva per farsi sentire era scrivere al bot da un altro canale,
 * cioè accorgersi da solo che esisteva un altro canale.
 *
 * Il modulo chiede una cosa sola: cosa stavi facendo. Indirizzo, rete,
 * marcatore del dispositivo e agente li conosce già il server e li registra
 * da sé — chiederli produrrebbe solo errori di trascrizione, e chiederli a
 * qualcuno che sta già subendo un disservizio è chiedergli di fare il
 * lavoro nostro.
 *
 * Non usa una server action: le azioni passano dal percorso normale di
 * Next, e questa pagina è servita a chi il perimetro sta respingendo. La
 * rotta dedicata è l'unica esentata dal blocco (vedi ROTTA_RICORSO nel
 * middleware), e la esenzione vale per un indirizzo solo — quello.
 */

const MASSIMO = 600;

export function ModuloRicorso({
  causa,
  valore,
  sottorete,
}: {
  causa: CausaEsclusione;
  valore: string;
  sottorete: string | null;
}) {
  const [aperto, setAperto] = useState(false);
  const [messaggio, setMessaggio] = useState("");
  const [contatto, setContatto] = useState("");
  const [stato, setStato] = useState<"pronto" | "invio" | "fatto" | "errore">(
    "pronto",
  );
  const [errore, setErrore] = useState<string | null>(null);

  async function invia(evento: React.FormEvent) {
    evento.preventDefault();
    if (stato === "invio" || stato === "fatto") return;
    if (messaggio.trim().length < 10) {
      setErrore("Scrivi almeno una frase: serve a capire il caso.");
      return;
    }

    setStato("invio");
    setErrore(null);

    try {
      const risposta = await fetch("/api/ricorso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causa,
          valore,
          sottorete,
          messaggio: messaggio.trim().slice(0, MASSIMO),
          contatto: contatto.trim().slice(0, 120) || null,
        }),
      });

      const corpo = await risposta.json().catch(() => null);

      if (!risposta.ok) {
        setStato("errore");
        setErrore(corpo?.errore ?? "Invio non riuscito. Riprova più tardi.");
        return;
      }

      setStato("fatto");
    } catch {
      setStato("errore");
      setErrore("Connessione non riuscita. Riprova più tardi.");
    }
  }

  if (stato === "fatto") {
    return (
      <div className="mt-7 border-t border-[var(--bordo)] pt-6">
        <p className="mono border border-[var(--ok)] p-4 text-[12.5px] leading-[1.8] text-[var(--ok)]">
          Segnalazione ricevuta. Uno sviluppatore la leggerà e, se il blocco
          ti ha preso per sbaglio, il tuo indirizzo verrà escluso dal
          provvedimento. Non serve rinviarla.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-7 border-t border-[var(--bordo)] pt-6">
      {!aperto ? (
        <>
          <button
            type="button"
            onClick={() => setAperto(true)}
            className="mono spinta min-h-12 w-full border border-[var(--bordo-pieno)] px-5 text-[12px] font-semibold tracking-[0.14em] uppercase"
          >
            È uno sbaglio
          </button>
          <p className="mono mt-3 text-[11px] leading-[1.7] text-[var(--testo-debole)]">
            Premi qui se non hai fatto nulla di quanto descritto sopra: la
            segnalazione arriva a uno sviluppatore, non a un risponditore
            automatico.
          </p>
        </>
      ) : (
        <form onSubmit={invia} className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="mono text-[10.5px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
              Cosa stavi facendo sul sito
            </span>
            <textarea
              value={messaggio}
              onChange={(evento) => setMessaggio(evento.target.value)}
              maxLength={MASSIMO}
              rows={4}
              required
              autoFocus
              placeholder="Stavo aprendo la pagina dei piani dal telefono, connessione di casa…"
              className="mono w-full resize-y border border-[var(--bordo)] bg-[var(--sfondo)] p-3 text-[12.5px] leading-[1.7] outline-none focus:border-[var(--accento)]"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="mono text-[10.5px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
              Come ricontattarti (facoltativo)
            </span>
            <input
              value={contatto}
              onChange={(evento) => setContatto(evento.target.value)}
              maxLength={120}
              placeholder="@telegram, email…"
              className="mono min-h-11 w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-3 text-[12.5px] outline-none focus:border-[var(--accento)]"
            />
          </label>

          {errore && (
            <p className="mono border border-[var(--allarme)] p-3 text-[11.5px] leading-[1.6] text-[var(--allarme)]">
              {errore}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={stato === "invio"}
              className="mono spinta min-h-12 flex-1 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 text-[12px] font-semibold tracking-[0.14em] text-[var(--testo-inverso)] uppercase disabled:opacity-60"
            >
              {stato === "invio" ? "Invio…" : "Invia la segnalazione"}
            </button>
            <button
              type="button"
              onClick={() => setAperto(false)}
              className="mono spinta min-h-12 border border-[var(--bordo)] px-4 text-[12px] tracking-[0.14em] uppercase"
            >
              Annulla
            </button>
          </div>

          <p className="mono text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
            Insieme al testo vengono registrati indirizzo, rete e browser: il
            server li conosce già, e servono a capire se il blocco ti ha preso
            per sbaglio. Una segnalazione per volta.
          </p>
        </form>
      )}
    </div>
  );
}
