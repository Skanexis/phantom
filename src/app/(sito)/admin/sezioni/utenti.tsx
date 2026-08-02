"use client";

import { FiltroAdmin } from "@/components/filtro-admin";
import { VoceRichiudibile, BloccoNuovo } from "@/components/blocco-admin";
import { Campo, AreaTesto, classiSelettore } from "@/components/campi-admin";
import { BadgeRuolo } from "@/components/badge-ruolo";
import { Etichetta, RigaDato } from "@/components/ui";
import { Icone } from "@/components/icone";
import {
  cambiaBloccoUtente,
  chiudiSegnalazione,
  creaBando,
  revocaBando,
  segnalaUtente,
} from "../azioni";
import type { Ruolo } from "@/generated/prisma/client";

/**
 * Anagrafica dei clienti, con tre livelli di potere sulla stessa scheda.
 *
 * La divisione non è burocratica, risponde a chi fa cosa: SUPPORTO parla
 * con i clienti tutto il giorno ed è il primo ad accorgersi di un problema,
 * ma un blocco è una decisione commerciale e non deve poterla prendere chi
 * risponde ai messaggi. ADMIN decide sul cliente. DEVELOPER agisce sul
 * perimetro, che è l'unico strumento contro chi un account non ce l'ha —
 * ed è anche quello che può prendere dentro persone estranee, quindi sta
 * al livello più stretto.
 *
 * Ogni potere che manca non viene nascosto e basta: dove ha senso resta
 * visibile ciò che si può fare al suo posto (segnalare), altrimenti chi non
 * ha il permesso non capisce se la funzione non c'è o se non è per lui.
 */

type Abbonamento = {
  id: string;
  codice: string | null;
  nome: string;
  stato: string;
  scadeIl: string | null;
};

type Richiesta = {
  id: string;
  numero: number;
  codice: string | null;
  ambito: string;
  stato: string;
  creatoIl: string;
};

export type UtenteAdmin = {
  id: string;
  telegramId: string;
  username: string | null;
  nome: string | null;
  ruolo: Ruolo;
  creatoIl: string;
  bloccato: boolean;
  bloccatoIl: string | null;
  motivoBlocco: string | null;
  abbonamenti: Abbonamento[];
  richieste: Richiesta[];
  /** Aperte: sono quelle che contano per capire se c'è qualcosa in corso. */
  richiesteAperte: number;
  segnalazioniAperte: number;
};

export type SegnalazioneAdmin = {
  id: string;
  motivo: string;
  creatoIl: string;
  stato: string;
  utente: { id: string; username: string | null; telegramId: string };
  autore: { username: string | null; telegramId: string };
};

export type BandoAdmin = {
  id: string;
  tipo: string;
  valore: string;
  motivo: string;
  creatoIl: string;
  scadeIl: string | null;
};

const ETICHETTE_STATO_ABBONAMENTO: Record<string, string> = {
  IN_ATTESA: "In attesa",
  ATTIVO: "Attivo",
  SOSPESO: "Sospeso",
  SCADUTO: "Scaduto",
  ANNULLATO: "Annullato",
};

const ETICHETTE_STATO_RICHIESTA: Record<string, string> = {
  NUOVA: "Nuova",
  IN_LAVORAZIONE: "In lavorazione",
  IN_ATTESA_CLIENTE: "In attesa del cliente",
  COMPLETATA: "Completata",
  ANNULLATA: "Annullata",
};

const STATI_RICHIESTA_APERTI = new Set([
  "NUOVA",
  "IN_LAVORAZIONE",
  "IN_ATTESA_CLIENTE",
]);

function data(valore: string | null) {
  if (!valore) return "—";
  return new Date(valore).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function nomeVisibile(utente: {
  username: string | null;
  telegramId: string;
  nome?: string | null;
}) {
  if (utente.username) return `@${utente.username}`;
  if (utente.nome) return utente.nome;
  return utente.telegramId;
}

export function SezioneUtenti({
  utenti,
  segnalazioni,
  bandi,
  puoSegnalare,
  puoBloccare,
  puoBandire,
}: {
  utenti: UtenteAdmin[];
  segnalazioni: SegnalazioneAdmin[];
  bandi: BandoAdmin[];
  puoSegnalare: boolean;
  puoBloccare: boolean;
  puoBandire: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* --------------------- Segnalazioni in attesa --------------------- */}
      {puoBloccare && segnalazioni.length > 0 && (
        <section className="border border-[var(--allarme)]">
          <header className="flex items-center gap-2.5 border-b border-[var(--bordo)] px-4 py-3">
            <Icone.allarme className="h-4 w-4 shrink-0 text-[var(--allarme)]" />
            <Etichetta>
              Segnalazioni da esaminare ({segnalazioni.length})
            </Etichetta>
          </header>
          <div className="divide-y divide-[var(--bordo)]">
            {segnalazioni.map((voce) => (
              <div key={voce.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="mono text-[13px] font-semibold">
                    {nomeVisibile(voce.utente)}
                  </span>
                  <span className="mono text-[10.5px] text-[var(--testo-debole)]">
                    segnalato da {nomeVisibile(voce.autore)} ·{" "}
                    {data(voce.creatoIl)}
                  </span>
                </div>
                <p className="mono mt-2 text-[12px] leading-[1.7] whitespace-pre-wrap text-[var(--testo-tenue)]">
                  {voce.motivo}
                </p>
                <form action={chiudiSegnalazione} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={voce.id} />
                  <input
                    name="esito"
                    placeholder="Esito (facoltativo)"
                    aria-label="Esito della segnalazione"
                    className={`${classiSelettore} min-h-11 flex-1`}
                  />
                  <button
                    type="submit"
                    className="mono spinta min-h-11 shrink-0 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase"
                  >
                    Chiudi
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------- Bandi di rete -------------------------- */}
      {puoBandire && (
        <BloccoNuovo etichetta="Escludi un indirizzo o un dispositivo">
          <form action={creaBando} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="mono text-[11px] tracking-[0.14em] text-[var(--testo-tenue)] uppercase sm:text-[10px]">
                  Tipo
                </span>
                <select name="tipo" className={classiSelettore} defaultValue="IP">
                  <option value="IP">Indirizzo IP</option>
                  <option value="DISPOSITIVO">Dispositivo</option>
                </select>
              </label>
              <Campo
                etichetta="Valore"
                nome="valore"
                richiesto
                placeholder="203.0.113.7 oppure l'identificativo del dispositivo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etichetta="Motivo" nome="motivo" placeholder="Perché" />
              <Campo
                etichetta="Giorni (0 = permanente)"
                nome="giorni"
                tipo="number"
                valore="0"
              />
            </div>
            <button
              type="submit"
              className="mono spinta min-h-11 self-start border border-[var(--allarme)] px-5 text-[11px] tracking-[0.12em] text-[var(--allarme)] uppercase"
            >
              Bandisci
            </button>
          </form>

          {bandi.length > 0 && (
            <div className="mt-5 divide-y divide-[var(--bordo)] border-t border-[var(--bordo)]">
              {bandi.map((bando) => (
                <div
                  key={bando.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="mono truncate text-[12.5px]">
                      <span className="text-[var(--testo-debole)]">
                        {bando.tipo === "IP" ? "IP" : "DISP"}
                      </span>{" "}
                      {bando.valore}
                    </p>
                    <p className="mono mt-0.5 text-[10.5px] text-[var(--testo-debole)]">
                      {bando.motivo} · dal {data(bando.creatoIl)} ·{" "}
                      {bando.scadeIl
                        ? `fino al ${data(bando.scadeIl)}`
                        : "permanente"}
                    </p>
                  </div>
                  <form action={revocaBando} className="shrink-0">
                    <input type="hidden" name="id" value={bando.id} />
                    <button
                      type="submit"
                      className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase"
                    >
                      Revoca
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </BloccoNuovo>
      )}

      {/* ---------------------------- Anagrafica --------------------------- */}
      <FiltroAdmin
        segnaposto="Cerca per @username, nome o ID Telegram…"
        vuoto="Nessun utente corrisponde ai filtri."
        stati={[
          { valore: "attivi", etichetta: "Attivi" },
          { valore: "bloccati", etichetta: "Bloccati" },
          { valore: "segnalati", etichetta: "Segnalati" },
        ]}
        voci={utenti.map((utente) => ({
          id: utente.id,
          stato: utente.bloccato
            ? "bloccati"
            : utente.segnalazioniAperte > 0
              ? "segnalati"
              : "attivi",
          ricerca: [
            utente.username ?? "",
            utente.nome ?? "",
            utente.telegramId,
            utente.ruolo,
          ]
            .join(" ")
            .toLowerCase(),
          contenuto: (
            <SchedaUtente
              utente={utente}
              puoSegnalare={puoSegnalare}
              puoBloccare={puoBloccare}
              puoBandire={puoBandire}
            />
          ),
        }))}
      />
    </div>
  );
}

function SchedaUtente({
  utente,
  puoSegnalare,
  puoBloccare,
  puoBandire,
}: {
  utente: UtenteAdmin;
  puoSegnalare: boolean;
  puoBloccare: boolean;
  puoBandire: boolean;
}) {
  const attivi = utente.abbonamenti.filter((a) => a.stato === "ATTIVO");

  return (
    <VoceRichiudibile
      titolo={nomeVisibile(utente)}
      sottotitolo={`${utente.telegramId} · ${attivi.length} attivi · ${utente.richiesteAperte} pratiche aperte`}
      accessorio={
        <span className="flex items-center gap-2">
          {utente.segnalazioniAperte > 0 && (
            <Icone.allarme className="h-4 w-4 text-[var(--allarme)]" />
          )}
          {utente.bloccato && (
            <span className="mono border border-[var(--allarme)] px-2 py-1 text-[10px] tracking-[0.1em] text-[var(--allarme)] uppercase">
              Bloccato
            </span>
          )}
          <BadgeRuolo ruolo={utente.ruolo} />
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {utente.bloccato && (
          <p className="mono border border-[var(--allarme)] p-3 text-[11.5px] leading-[1.7] text-[var(--allarme)]">
            Bloccato il {data(utente.bloccatoIl)} —{" "}
            {utente.motivoBlocco ?? "nessun motivo indicato"}
          </p>
        )}

        {/* ---------------------------- Profilo --------------------------- */}
        <div>
          <Etichetta>Profilo</Etichetta>
          <div className="mt-2">
            <RigaDato chiave="ID Telegram" valore={utente.telegramId} />
            <RigaDato chiave="Nome" valore={utente.nome ?? "—"} />
            <RigaDato chiave="Ruolo" valore={utente.ruolo} />
            <RigaDato chiave="Iscritto il" valore={data(utente.creatoIl)} />
          </div>
        </div>

        {/* -------------------------- Abbonamenti ------------------------- */}
        <div>
          <Etichetta>Abbonamenti ({utente.abbonamenti.length})</Etichetta>
          {utente.abbonamenti.length === 0 ? (
            <p className="mono mt-2 text-[12px] text-[var(--testo-tenue)]">
              Nessun abbonamento.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-[var(--bordo)] border-y border-[var(--bordo)]">
              {utente.abbonamenti.map((voce) => (
                <div
                  key={voce.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <span className="mono text-[12.5px]">
                    {voce.codice && (
                      <span className="text-[var(--testo-debole)]">
                        {voce.codice}{" "}
                      </span>
                    )}
                    {voce.nome}
                  </span>
                  <span className="mono text-[11px] text-[var(--testo-tenue)]">
                    {ETICHETTE_STATO_ABBONAMENTO[voce.stato] ?? voce.stato}
                    {voce.scadeIl && ` · scade ${data(voce.scadeIl)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------- Richieste -------------------------- */}
        <div>
          <Etichetta>Richieste ({utente.richieste.length})</Etichetta>
          {utente.richieste.length === 0 ? (
            <p className="mono mt-2 text-[12px] text-[var(--testo-tenue)]">
              Nessuna richiesta.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-[var(--bordo)] border-y border-[var(--bordo)]">
              {utente.richieste.map((voce) => {
                const aperta = STATI_RICHIESTA_APERTI.has(voce.stato);
                return (
                  <div
                    key={voce.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                  >
                    <span className="mono text-[12.5px]">
                      <span className="text-[var(--testo-debole)]">
                        {voce.codice ?? `#${voce.numero}`}{" "}
                      </span>
                      {voce.ambito}
                    </span>
                    <span
                      className={`mono text-[11px] ${
                        aperta
                          ? "text-[var(--accento)]"
                          : "text-[var(--testo-tenue)]"
                      }`}
                    >
                      {ETICHETTE_STATO_RICHIESTA[voce.stato] ?? voce.stato} ·{" "}
                      {data(voce.creatoIl)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------------------------- Azioni ---------------------------- */}
        {puoSegnalare && !puoBloccare && (
          <form action={segnalaUtente} className="flex flex-col gap-3">
            <input type="hidden" name="utenteId" value={utente.id} />
            <AreaTesto
              etichetta="Segnala a un amministratore"
              nome="motivo"
              righe={3}
              placeholder="Cosa è successo. Un amministratore riceve la segnalazione e decide."
            />
            <button
              type="submit"
              className="mono spinta min-h-11 self-start border border-[var(--bordo)] px-5 text-[11px] tracking-[0.12em] uppercase"
            >
              Invia segnalazione
            </button>
            {utente.segnalazioniAperte > 0 && (
              <p className="mono text-[10.5px] text-[var(--testo-debole)]">
                C&apos;è già una segnalazione aperta su questo account: la tua
                verrà aggiunta a quella, non ne aprirà una seconda.
              </p>
            )}
          </form>
        )}

        {puoBloccare && utente.ruolo !== "DEVELOPER" && (
          <form action={cambiaBloccoUtente} className="flex flex-col gap-3">
            <input type="hidden" name="utenteId" value={utente.id} />
            <input
              type="hidden"
              name="blocca"
              value={utente.bloccato ? "false" : "true"}
            />
            {!utente.bloccato && (
              <Campo
                etichetta="Motivo del blocco (resta interno)"
                nome="motivo"
                placeholder="Perché"
              />
            )}
            <button
              type="submit"
              className={`mono spinta min-h-11 self-start border px-5 text-[11px] tracking-[0.12em] uppercase ${
                utente.bloccato
                  ? "border-[var(--ok)] text-[var(--ok)]"
                  : "border-[var(--allarme)] text-[var(--allarme)]"
              }`}
            >
              {utente.bloccato ? "Sblocca account" : "Blocca account"}
            </button>
          </form>
        )}

        {puoBandire && (
          <p className="mono border border-[var(--bordo)] p-3 text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
            Per escludere indirizzo o dispositivo usa il riquadro in cima alla
            scheda: gli identificativi si leggono nella console di
            Sorveglianza, dove ogni riga porta l&apos;IP accanto
            all&apos;account.
          </p>
        )}
      </div>
    </VoceRichiudibile>
  );
}
