"use client";

import { useEffect, useRef, useState } from "react";
import { Etichetta } from "@/components/ui";
import { Icone, type NomeIcona } from "@/components/icone";
import { liberaIndirizzo } from "../azioni";
import type { Istantanea, TipoEvento } from "@/lib/sorveglianza";

/**
 * Sorveglianza del perimetro: cosa arriva, da dove, cosa è stato respinto.
 *
 * I dati non vengono dal server component ma da una chiamata periodica: il
 * quadro cambia di secondo in secondo, e una pagina renderizzata una volta
 * sola mostrerebbe una fotografia già vecchia nel momento in cui la si
 * guarda. L'aggiornamento si ferma quando la scheda passa in secondo piano
 * — nessuno legge un pannello che non sta guardando, e ogni giro è lavoro
 * sul server che si stava misurando.
 */

const INTERVALLO_MS = 5000;

type Dati = Istantanea & {
  flussi: { connessioni: number; soggetti: number; massimoSingolo: number };
  carico: {
    utenti: number;
    abbonatiAttivi: number;
    attivazioniInAttesa: number;
    richiesteAperte: number;
    messaggiDaLeggere: number;
    letturaMs: number;
    erroreDatabase: string | null;
  };
  processo: {
    pid: number;
    node: string;
    attivoDaSecondi: number;
    memoriaMb: number;
    heapUsatoMb: number;
    heapTotaleMb: number;
  };
};

/* ------------------------------ Vocabolario ------------------------------ */

const ETICHETTE: Record<TipoEvento, string> = {
  sonda: "Sonda",
  iniezione: "Firma d'attacco",
  origine: "Origine non valida",
  frequenza: "Frequenza IP",
  frequenza_utente: "Frequenza utente",
  gate: "Password cantiere",
  webhook: "Webhook",
  flussi: "Connessioni SSE",
  accesso: "Accesso negato",
  quarantena: "In quarantena",
};

const ICONE_EVENTO: Record<TipoEvento, NomeIcona> = {
  sonda: "mirino",
  iniezione: "code",
  origine: "link",
  frequenza: "impulso",
  frequenza_utente: "utenti",
  gate: "shield",
  webhook: "telegram",
  flussi: "rete",
  accesso: "allarme",
  quarantena: "divieto",
};

/**
 * Non tutti gli eventi pesano uguale. Un segreto del webhook sbagliato è
 * qualcuno che ha trovato l'indirizzo e sta provando a inventarsi un
 * aggiornamento; una sonda su /wp-admin è rumore di fondo di internet.
 * Il colore dice dove guardare per primo.
 */
const GRAVITA: Record<TipoEvento, "alta" | "media" | "bassa"> = {
  webhook: "alta",
  gate: "alta",
  accesso: "alta",
  iniezione: "alta",
  origine: "media",
  frequenza_utente: "media",
  flussi: "media",
  quarantena: "media",
  frequenza: "bassa",
  sonda: "bassa",
};

function coloreGravita(tipo: TipoEvento) {
  const gravita = GRAVITA[tipo];
  if (gravita === "alta") return "text-[var(--allarme)]";
  if (gravita === "media") return "text-[var(--accento)]";
  return "text-[var(--testo-tenue)]";
}

/* -------------------------------- Formati -------------------------------- */

function orario(quando: number) {
  return new Date(quando).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function durata(millisecondi: number) {
  const minuti = Math.floor(millisecondi / 60000);
  if (minuti < 1) return "meno di un minuto";
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore}h ${minuti % 60}m`;
  return `${Math.floor(ore / 24)}g ${ore % 24}h`;
}

/** Migliaia separate: 12480 diventa illeggibile in una griglia di numeri. */
function cifra(valore: number) {
  return valore.toLocaleString("it-IT");
}

/* ------------------------------- Mattoni --------------------------------- */

function Sezione({
  icona,
  titolo,
  nota,
  accento,
  children,
}: {
  icona: NomeIcona;
  titolo: string;
  nota?: string;
  accento?: boolean;
  children: React.ReactNode;
}) {
  const Icona = Icone[icona];
  return (
    <section className="border border-[var(--bordo)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bordo)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Icona
            className={`h-4 w-4 shrink-0 ${
              accento ? "text-[var(--allarme)]" : "text-[var(--accento)]"
            }`}
          />
          <Etichetta>{titolo}</Etichetta>
        </div>
        {nota && (
          <span className="mono text-[10.5px] text-[var(--testo-debole)]">
            {nota}
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Griglia di numeri: il mattone che si ripete in quasi ogni sezione. */
function Cifre({
  voci,
  colonne = "sm:grid-cols-4",
}: {
  voci: {
    valore: string | number;
    etichetta: string;
    acceso?: boolean;
    tenue?: boolean;
  }[];
  colonne?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-px bg-[var(--bordo)] ${colonne}`}>
      {voci.map((voce) => (
        <div key={voce.etichetta} className="bg-[var(--sfondo)] p-3">
          <span
            className={`display block text-[20px] leading-tight sm:text-[24px] ${
              voce.acceso
                ? "text-[var(--allarme)]"
                : voce.tenue
                  ? "text-[var(--testo-tenue)]"
                  : ""
            }`}
          >
            {typeof voce.valore === "number" ? cifra(voce.valore) : voce.valore}
          </span>
          <Etichetta className="mt-1 block">{voce.etichetta}</Etichetta>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- Pannello -------------------------------- */

export function SezioneSorveglianza() {
  const [dati, setDati] = useState<Dati | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inPausa, setInPausa] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Smontato il componente, le risposte ancora in volo non devono più
    // scrivere sullo stato: la richiesta parte prima e torna dopo.
    let vivo = true;

    const carica = async () => {
      try {
        const risposta = await fetch("/api/admin/sorveglianza", {
          cache: "no-store",
        });
        if (!risposta.ok) throw new Error(String(risposta.status));
        const corpo = await risposta.json();
        if (!vivo) return;
        setDati(corpo);
        setErrore(null);
      } catch {
        if (vivo) setErrore("Aggiornamento non riuscito.");
      }
    };

    void carica();

    const avvia = () => {
      if (timer.current) return;
      timer.current = setInterval(carica, INTERVALLO_MS);
    };
    const ferma = () => {
      if (!timer.current) return;
      clearInterval(timer.current);
      timer.current = null;
    };

    // La scheda nascosta non va aggiornata: il browser rallenterebbe
    // comunque l'intervallo, ma la richiesta continuerebbe a partire.
    const cambioVisibilita = () => {
      const nascosta = document.visibilityState === "hidden";
      setInPausa(nascosta);
      if (nascosta) ferma();
      else {
        void carica();
        avvia();
      }
    };

    avvia();
    document.addEventListener("visibilitychange", cambioVisibilita);

    return () => {
      vivo = false;
      ferma();
      document.removeEventListener("visibilitychange", cambioVisibilita);
    };
  }, []);

  if (!dati) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
        {errore ?? "Lettura dello stato in corso…"}
      </p>
    );
  }

  const { minaccia, carico, processo, flussi } = dati;
  const allarme = minaccia.livello === "allarme";
  const attenzione = minaccia.livello === "attenzione";
  const coloreMinaccia = allarme
    ? "text-[var(--allarme)]"
    : attenzione
      ? "text-[var(--accento)]"
      : "text-[var(--testo-tenue)]";

  const massimo = Math.max(...dati.traffico.map((r) => r.totale), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------- Perimetro ---------------------------- */}
      <section
        className={`border p-5 sm:p-6 ${
          allarme
            ? "border-[var(--allarme)]"
            : attenzione
              ? "border-[var(--accento)]"
              : "border-[var(--bordo)]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Icone.impulso
              className={`mt-1 h-6 w-6 shrink-0 ${coloreMinaccia} ${
                allarme ? "animate-pulse" : ""
              }`}
            />
            <div>
              <Etichetta>Stato del perimetro</Etichetta>
              <p
                className={`display mt-1 text-[clamp(1.5rem,5vw,2.4rem)] leading-none uppercase ${coloreMinaccia}`}
              >
                {minaccia.livello}
              </p>
              <p className="mono mt-2 text-[12px] text-[var(--testo-tenue)]">
                {minaccia.motivo}
              </p>
            </div>
          </div>

          <div className="mono text-right text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
            <span className="flex items-center justify-end gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  inPausa
                    ? "bg-[var(--testo-debole)]"
                    : "animate-pulse bg-[var(--accento)]"
                }`}
              />
              {inPausa ? "in pausa" : `ogni ${INTERVALLO_MS / 1000}s`}
            </span>
            attivo da {durata(dati.adesso - dati.avvio)}
            <br />
            pid {processo.pid} · node {processo.node}
            {errore && (
              <>
                <br />
                <span className="text-[var(--allarme)]">{errore}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------- In tempo reale -------------------------- */}
      <Sezione
        icona="utenti"
        titolo="In tempo reale"
        nota={
          flussi.massimoSingolo > 0
            ? `punta di ${flussi.massimoSingolo} schede per un solo utente`
            : undefined
        }
      >
        <Cifre
          colonne="sm:grid-cols-3 lg:grid-cols-6"
          voci={[
            { valore: flussi.soggetti, etichetta: "Utenti collegati" },
            { valore: flussi.connessioni, etichetta: "Connessioni SSE" },
            { valore: dati.alMinuto, etichetta: "Richieste/min" },
            { valore: dati.ipAlMinuto, etichetta: "IP distinti/min" },
            {
              valore: dati.bloccateAlMinuto,
              etichetta: "Respinte/min",
              acceso: dati.bloccateAlMinuto > 0,
            },
            {
              valore: dati.quarantena.length,
              etichetta: "In quarantena",
              acceso: dati.quarantena.length > 0,
            },
          ]}
        />
      </Sezione>

      {/* ---------------------------- Traffico ----------------------------- */}
      <Sezione
        icona="grafico"
        titolo="Traffico dell'ultima ora"
        nota={`media ${dati.mediaAlMinuto}/min · punta ${cifra(dati.puntaOraria)}/min`}
      >
        <div
          className="flex h-28 items-end gap-px"
          role="img"
          aria-label={`Traffico dell'ultima ora, punta di ${dati.puntaOraria} richieste al minuto`}
        >
          {dati.traffico.map((riga) => {
            const altezza = (riga.totale / massimo) * 100;
            const quotaBloccate =
              riga.totale > 0 ? (riga.bloccate / riga.totale) * 100 : 0;
            return (
              <div key={riga.minuto} className="group relative h-full flex-1">
                <div
                  className="absolute bottom-0 w-full bg-[var(--bordo-pieno)] transition-[height] duration-300"
                  style={{
                    height: `${Math.max(altezza, riga.totale > 0 ? 2 : 0)}%`,
                  }}
                >
                  {quotaBloccate > 0 && (
                    <div
                      className="absolute bottom-0 w-full bg-[var(--allarme)]"
                      style={{ height: `${quotaBloccate}%` }}
                    />
                  )}
                </div>
                {/* Il dettaglio compare al passaggio: con sessanta barre,
                    un'etichetta fissa per ognuna sarebbe illeggibile. */}
                <span className="mono pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 border border-[var(--bordo)] bg-[var(--sfondo)] px-2 py-1 text-[10px] whitespace-nowrap group-hover:block">
                  {cifra(riga.totale)} richieste · {riga.bloccate} respinte ·{" "}
                  {riga.ipUnici} IP
                </span>
              </div>
            );
          })}
        </div>

        <div className="mono mt-2 flex items-center justify-between text-[10px] text-[var(--testo-debole)]">
          <span>60 min fa</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--bordo-pieno)]" />
              servite
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--allarme)]" />
              respinte
            </span>
          </span>
          <span>adesso</span>
        </div>
      </Sezione>

      {/* ----------------------------- Sistemi ----------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Sezione
          icona="server"
          titolo="Processo"
          nota={`in piedi da ${durata(processo.attivoDaSecondi * 1000)}`}
        >
          <Cifre
            colonne="sm:grid-cols-4"
            voci={[
              { valore: `${processo.memoriaMb} MB`, etichetta: "Memoria (RSS)" },
              {
                valore: `${processo.heapUsatoMb}/${processo.heapTotaleMb}`,
                etichetta: "Heap MB",
              },
              { valore: dati.totali.richieste, etichetta: "Richieste totali" },
              {
                valore: dati.totali.eventi,
                etichetta: "Eventi totali",
                acceso: dati.totali.eventi > 0,
              },
            ]}
          />
          <p className="mono mt-3 text-[10.5px] leading-[1.6] text-[var(--testo-debole)]">
            Tracciati in memoria: {cifra(dati.ipTracciati)} indirizzi,{" "}
            {cifra(dati.sospettiTracciati)} sotto osservazione,{" "}
            {cifra(dati.percorsiTracciati)} percorsi. Ogni struttura ha un
            tetto e scarta le voci più vecchie: la memoria non cresce con il
            traffico.
          </p>
        </Sezione>

        <Sezione
          icona="database"
          titolo="Carico applicativo"
          nota={
            carico.erroreDatabase
              ? "database non raggiungibile"
              : `lettura in ${carico.letturaMs} ms`
          }
          accento={Boolean(carico.erroreDatabase)}
        >
          {carico.erroreDatabase ? (
            <p className="mono mb-3 border border-[var(--allarme)] p-3 text-[11.5px] break-all text-[var(--allarme)]">
              {carico.erroreDatabase}
            </p>
          ) : null}
          <Cifre
            colonne="sm:grid-cols-3"
            voci={[
              { valore: carico.utenti, etichetta: "Utenti" },
              { valore: carico.abbonatiAttivi, etichetta: "Abbonati attivi" },
              {
                valore: carico.attivazioniInAttesa,
                etichetta: "Da attivare",
                acceso: carico.attivazioniInAttesa > 0,
              },
              { valore: carico.richiesteAperte, etichetta: "Pratiche aperte" },
              {
                valore: carico.messaggiDaLeggere,
                etichetta: "Messaggi da leggere",
                acceso: carico.messaggiDaLeggere > 0,
              },
              {
                valore: dati.totali.quarantene,
                etichetta: "Quarantene applicate",
                tenue: dati.totali.quarantene === 0,
              },
            ]}
          />
          <p className="mono mt-3 text-[10.5px] leading-[1.6] text-[var(--testo-debole)]">
            Aggiornato al massimo ogni 30 secondi: sono cifre che cambiano
            lentamente, e interrogare il database a ogni giro farebbe pesare
            il monitoraggio più di ciò che monitora.
          </p>
        </Sezione>
      </div>

      {/* ---------------------------- Quarantena --------------------------- */}
      {dati.quarantena.length > 0 && (
        <Sezione
          icona="divieto"
          titolo={`Indirizzi in quarantena (${dati.quarantena.length})`}
          nota="lo staff collegato non viene mai bloccato"
          accento
        >
          <div className="divide-y divide-[var(--bordo)]">
            {dati.quarantena.map((voce) => (
              <div
                key={voce.ip}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="mono truncate text-[13px] font-semibold">
                    {voce.ip}
                  </p>
                  <p className="mono mt-1 text-[11px] text-[var(--testo-tenue)]">
                    {voce.motivo}
                  </p>
                  <p className="mono mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--testo-debole)]">
                    <Icone.orologio className="h-3 w-3" />
                    si sblocca fra {durata(Math.max(voce.fino - dati.adesso, 0))}
                  </p>
                </div>
                <form action={liberaIndirizzo} className="shrink-0">
                  <input type="hidden" name="ip" value={voce.ip} />
                  <button
                    type="submit"
                    className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase"
                  >
                    Libera
                  </button>
                </form>
              </div>
            ))}
          </div>
        </Sezione>
      )}

      {/* --------------------------- Chi insiste --------------------------- */}
      {dati.sospetti.length > 0 && (
        <Sezione
          icona="allarme"
          titolo={`Indirizzi con eventi (${cifra(dati.sospettiTracciati)})`}
          nota="ordinati per numero di tentativi respinti"
        >
          <div className="divide-y divide-[var(--bordo)]">
            {dati.sospetti.map((voce) => (
              <div key={voce.ip} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="mono flex items-center gap-2 text-[13px] font-semibold">
                    {voce.inQuarantena && (
                      <Icone.divieto className="h-3.5 w-3.5 text-[var(--allarme)]" />
                    )}
                    {voce.ip}
                  </span>
                  <span className="mono text-[11px] text-[var(--testo-tenue)]">
                    {voce.eventi} respinte su {cifra(voce.richieste)} richieste
                    · {orario(voce.ultimo)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(voce.tipi).map(([tipo, quanti]) => (
                    <span
                      key={tipo}
                      className={`mono border border-[var(--bordo)] px-1.5 py-0.5 text-[10px] ${coloreGravita(tipo as TipoEvento)}`}
                    >
                      {ETICHETTE[tipo as TipoEvento]} ×{quanti}
                    </span>
                  ))}
                </div>
                {voce.agente && (
                  <p className="mono mt-1 truncate text-[10px] text-[var(--testo-debole)]">
                    {voce.agente}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Sezione>
      )}

      {/* ------------------------------ Eventi ----------------------------- */}
      <Sezione
        icona="registro"
        titolo={`Giornale degli eventi (${cifra(dati.eventiUltimaOra)} nell'ultima ora)`}
        nota={
          dati.totali.eventi > 0
            ? `${cifra(dati.totali.eventi)} dall'avvio`
            : undefined
        }
      >
        {Object.keys(dati.perTipo).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(dati.perTipo)
              .sort((a, b) => b[1] - a[1])
              .map(([tipo, quanti]) => {
                const Icona = Icone[ICONE_EVENTO[tipo as TipoEvento]];
                return (
                  <span
                    key={tipo}
                    className={`mono flex items-center gap-1.5 border border-[var(--bordo)] px-2 py-1 text-[10px] tracking-[0.08em] uppercase ${coloreGravita(tipo as TipoEvento)}`}
                  >
                    <Icona className="h-3 w-3" />
                    {ETICHETTE[tipo as TipoEvento]} · {quanti}
                  </span>
                );
              })}
          </div>
        )}

        {dati.eventi.length === 0 ? (
          <p className="mono py-2 text-[12.5px] text-[var(--testo-tenue)]">
            Nessun evento da quando il processo è attivo. È la situazione
            normale: qui compare solo ciò che è stato respinto.
          </p>
        ) : (
          <div className="max-h-[420px] divide-y divide-[var(--bordo)] overflow-y-auto">
            {dati.eventi.map((evento) => {
              const Icona = Icone[ICONE_EVENTO[evento.tipo]];
              return (
                <div key={evento.id} className="flex gap-3 py-2.5 first:pt-0">
                  <Icona
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${coloreGravita(evento.tipo)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="mono text-[11px] text-[var(--testo-debole)]">
                        {orario(evento.quando)}
                      </span>
                      <span
                        className={`mono text-[11px] font-semibold tracking-[0.08em] uppercase ${coloreGravita(evento.tipo)}`}
                      >
                        {ETICHETTE[evento.tipo]}
                      </span>
                      <span className="mono text-[12px]">{evento.ip}</span>
                    </div>
                    <p className="mono mt-1 text-[11.5px] break-all text-[var(--testo-tenue)]">
                      {evento.metodo} {evento.percorso}
                      {evento.dettaglio ? ` — ${evento.dettaglio}` : ""}
                    </p>
                    {evento.agente && (
                      <p className="mono mt-0.5 truncate text-[10.5px] text-[var(--testo-debole)]">
                        {evento.agente}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Sezione>

      {/* --------------------- Percorsi e indirizzi ------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Sezione icona="mirino" titolo="Percorsi più richiesti">
          {dati.percorsi.length === 0 ? (
            <p className="mono text-[12px] text-[var(--testo-tenue)]">
              Nessun traffico registrato.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {dati.percorsi.map((voce) => {
                const quota = (voce.quante / dati.percorsi[0].quante) * 100;
                return (
                  <div key={voce.percorso}>
                    <div className="mono flex items-baseline justify-between gap-3 text-[11.5px]">
                      <span className="truncate">{voce.percorso || "/"}</span>
                      <span className="shrink-0 text-[var(--testo-tenue)]">
                        {cifra(voce.quante)}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1 bg-[var(--bordo-pieno)]"
                      style={{ width: `${Math.max(quota, 1)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Sezione>

        <Sezione
          icona="rete"
          titolo="Indirizzi per volume"
          nota={`${cifra(dati.ipTracciati)} in memoria`}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--bordo)] text-left">
                  {["Indirizzo", "Richieste", "Respinte", "Visto"].map((voce) => (
                    <th key={voce} className="pb-2">
                      <Etichetta>{voce}</Etichetta>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bordo)]">
                {dati.indirizzi.map((riga) => (
                  <tr key={riga.ip}>
                    <td className="mono py-2 text-[11.5px]">{riga.ip}</td>
                    <td className="mono py-2 text-[11.5px]">
                      {cifra(riga.richieste)}
                    </td>
                    <td
                      className={`mono py-2 text-[11.5px] ${
                        riga.bloccate > 0 ? "text-[var(--allarme)]" : ""
                      }`}
                    >
                      {riga.bloccate}
                    </td>
                    <td className="mono py-2 text-[11px] text-[var(--testo-debole)]">
                      {orario(riga.ultimoVisto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sezione>
      </div>

      <p className="mono text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
        Tutto questo vive nella memoria del processo: un riavvio azzera il
        quadro. È voluto — scrivere ogni evento a database, proprio mentre
        arriva un flusso ostile, aggraverebbe il problema che si sta
        osservando. Le richieste al webhook di Telegram non sono conteggiate:
        arrivano da pochi indirizzi e a raffica, e falserebbero ogni media.
      </p>
    </div>
  );
}
