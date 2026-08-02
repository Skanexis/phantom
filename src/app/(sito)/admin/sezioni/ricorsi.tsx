"use client";

import { Etichetta } from "@/components/ui";
import { Icone } from "@/components/icone";
import { ModuloAzione } from "@/components/modulo-azione";
import { creaEccezione, decidiRicorso } from "../azioni";

/**
 * Ricorsi: chi dice di essere stato bloccato per sbaglio.
 *
 * Esiste per una conseguenza precisa del bando di rete. Bandire una /24
 * ferma un attacco che arriva da indirizzi vicini, e insieme chiude fuori
 * chiunque altro stia dietro quegli indirizzi: un condominio, un operatore
 * mobile, un ufficio. Non è un difetto dello strumento, è come funziona —
 * ma senza un canale di ritorno l'unico modo di accorgersene sarebbe che
 * qualcuno riesca a scrivere da un'altra rete, cioè quasi mai.
 *
 * La decisione ha due esiti e uno solo dei due è interessante. Respingere
 * chiude la riga. Accogliere fa due cose insieme — segna il ricorso e
 * sblocca l'indirizzo — e le fa in un gesto solo di proposito: separarle
 * avrebbe significato che ogni tanto qualcuno esegue la prima e dimentica
 * la seconda, e la persona resta bloccata dopo che le è stato dato ragione.
 *
 * Per un bando di rete «sbloccare» significa creare un'eccezione per quel
 * singolo indirizzo: il provvedimento resta in piedi, l'attacco resta
 * fermato, e chi non c'entrava passa. Per un bando sul singolo indirizzo o
 * sul dispositivo l'eccezione non ha senso — lì il provvedimento era stato
 * preso proprio su quel valore, e accogliere vuol dire toglierlo.
 */

export type RicorsoAdmin = {
  id: string;
  causa: string;
  valore: string;
  ip: string;
  sottorete: string | null;
  dispositivo: string | null;
  messaggio: string;
  contatto: string | null;
  agente: string;
  stato: string;
  creatoIl: string;
  decisoIl: string | null;
  nota: string | null;
};

const ETICHETTA_CAUSA: Record<string, string> = {
  ip: "indirizzo",
  sottorete: "rete",
  dispositivo: "dispositivo",
  account: "account",
};

function quando(valore: string) {
  return new Date(valore).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SezioneRicorsi({ ricorsi }: { ricorsi: RicorsoAdmin[] }) {
  const aperti = ricorsi.filter((voce) => voce.stato === "APERTO");
  const decisi = ricorsi.filter((voce) => voce.stato !== "APERTO");

  if (ricorsi.length === 0) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
        Nessun ricorso. Qui arrivano le segnalazioni di chi, dalla schermata
        di blocco, dichiara di essere stato escluso per sbaglio: succede
        soprattutto dopo un bando di rete, che colpisce un intervallo di
        indirizzi e prende dentro anche estranei.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {aperti.length > 0 && (
        <section className="border border-[var(--accento)]">
          <header className="flex items-center gap-2.5 border-b border-[var(--bordo)] px-3 py-3 sm:px-4">
            <Icone.allarme className="h-4 w-4 shrink-0 text-[var(--accento)]" />
            <Etichetta>Da decidere ({aperti.length})</Etichetta>
          </header>
          <div className="divide-y divide-[var(--bordo)]">
            {aperti.map((voce) => (
              <Ricorso key={voce.id} voce={voce} />
            ))}
          </div>
        </section>
      )}

      {decisi.length > 0 && (
        <section className="border border-[var(--bordo)]">
          <header className="flex items-center gap-2.5 border-b border-[var(--bordo)] px-3 py-3 sm:px-4">
            <Icone.registro className="h-4 w-4 shrink-0 text-[var(--testo-debole)]" />
            <Etichetta>Decisi ({decisi.length})</Etichetta>
          </header>
          <div className="divide-y divide-[var(--bordo)]">
            {decisi.map((voce) => (
              <div key={voce.id} className="px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="mono text-[12px] break-all">
                    <span
                      className={
                        voce.stato === "ACCOLTO"
                          ? "text-[var(--ok)]"
                          : "text-[var(--testo-debole)]"
                      }
                    >
                      {voce.stato === "ACCOLTO" ? "accolto" : "respinto"}
                    </span>{" "}
                    · {voce.ip}
                  </span>
                  <span className="mono text-[10.5px] text-[var(--testo-debole)]">
                    {voce.decisoIl ? quando(voce.decisoIl) : ""}
                  </span>
                </div>
                {voce.nota && (
                  <p className="mono mt-1 text-[11px] break-words text-[var(--testo-tenue)]">
                    {voce.nota}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Ricorso({ voce }: { voce: RicorsoAdmin }) {
  const diRete = voce.causa === "sottorete";

  return (
    <div className="flex flex-col gap-3 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="mono text-[13px] font-semibold break-all">
          {voce.ip}
        </span>
        <span className="mono text-[10.5px] text-[var(--testo-debole)]">
          {quando(voce.creatoIl)}
        </span>
      </div>

      <dl className="mono grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[var(--testo-debole)]">bloccato per</dt>
          <dd className="break-all">
            {ETICHETTA_CAUSA[voce.causa] ?? voce.causa} · {voce.valore}
          </dd>
        </div>
        {voce.sottorete && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-[var(--testo-debole)]">rete</dt>
            <dd className="break-all">{voce.sottorete}</dd>
          </div>
        )}
        {voce.dispositivo && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-[var(--testo-debole)]">dispositivo</dt>
            <dd className="break-all">⬡{voce.dispositivo.slice(0, 12)}</dd>
          </div>
        )}
        {voce.contatto && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-[var(--testo-debole)]">contatto</dt>
            <dd className="break-all">{voce.contatto}</dd>
          </div>
        )}
      </dl>

      <p className="mono border border-[var(--bordo)] p-3 text-[12px] leading-[1.7] whitespace-pre-wrap">
        {voce.messaggio}
      </p>

      {voce.agente && (
        <p className="mono truncate text-[10px] text-[var(--testo-debole)]">
          {voce.agente}
        </p>
      )}

      <ModuloAzione azione={decidiRicorso} className="flex flex-col gap-2">
        {({ inCorso }) => (
          <>
            <input type="hidden" name="id" value={voce.id} />
            <input
              name="nota"
              placeholder="Nota interna (non la vede chi ha scritto)"
              aria-label="Nota sulla decisione"
              className="mono min-h-11 w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-3 text-[12px] outline-none focus:border-[var(--accento)]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="decisione"
                value="ACCOLTO"
                disabled={inCorso}
                title={
                  diRete
                    ? "Crea un'eccezione per questo indirizzo, lasciando in piedi il bando della rete"
                    : "Revoca l'esclusione su questo valore"
                }
                className="mono spinta min-h-11 border border-[var(--ok)] px-5 text-[11px] tracking-[0.12em] text-[var(--ok)] uppercase disabled:opacity-50"
              >
                {inCorso
                  ? "…"
                  : diRete
                    ? "Accogli ed esenta l'indirizzo"
                    : "Accogli e revoca"}
              </button>
              <button
                type="submit"
                name="decisione"
                value="RESPINTO"
                disabled={inCorso}
                className="mono spinta min-h-11 border border-[var(--bordo)] px-5 text-[11px] tracking-[0.12em] uppercase disabled:opacity-50"
              >
                Respingi
              </button>
            </div>
          </>
        )}
      </ModuloAzione>

      {/* Terza via, per il caso in cui il ricorso non convince ma
          l'indirizzo è chiaramente estraneo: si esenta senza pronunciarsi
          sul merito, e la riga resta aperta. */}
      {diRete && (
        <ModuloAzione
          azione={creaEccezione}
          className="flex flex-wrap items-center gap-2 border-t border-[var(--bordo)] pt-2"
        >
          {({ inCorso }) => (
            <>
              <input type="hidden" name="ip" value={voce.ip} />
              <input type="hidden" name="ricorsoId" value={voce.id} />
              <input
                name="motivo"
                placeholder="Motivo dell'eccezione"
                aria-label="Motivo dell'eccezione"
                className="mono min-h-11 min-w-[160px] flex-1 border border-[var(--bordo)] bg-[var(--sfondo)] px-3 text-[12px] outline-none focus:border-[var(--accento)]"
              />
              <button
                type="submit"
                disabled={inCorso}
                className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase disabled:opacity-50"
              >
                {inCorso ? "…" : "Solo esenta l'indirizzo"}
              </button>
            </>
          )}
        </ModuloAzione>
      )}
    </div>
  );
}
