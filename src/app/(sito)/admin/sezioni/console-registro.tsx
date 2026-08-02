"use client";

import { useCallback, useMemo, useState } from "react";
import { Icone } from "@/components/icone";
import type { LivelloRiga, RigaRegistro, TipoEvento } from "@/lib/sorveglianza";

/**
 * Console del traffico: una riga per richiesta, con il livello davanti.
 *
 * Il giornale degli eventi accanto mostra solo ciò che è stato respinto, ed
 * è il pannello giusto per la domanda "cosa ha provato a fare qualcuno".
 * Questa risponde a quella prima e più difficile: *cosa stava succedendo*.
 * Un blocco isolato non dice quasi nulla; le trenta righe che lo precedono
 * dicono se era uno scanner, una persona che ha sbagliato password o un
 * account interno che ha toccato dove non doveva.
 *
 * Filtri e ordinamento lavorano sulla finestra che il server manda (le
 * ultime quattrocento righe), non su tutto il deposito: cercare a monte
 * significherebbe spedire al pannello, a ogni giro di aggiornamento, un
 * archivio che serve tutto intero solo nel momento in cui lo si interroga.
 * La finestra è dichiarata sotto l'elenco, non lasciata indovinare.
 */

const LIVELLI: LivelloRiga[] = ["critico", "allarme", "avviso", "info"];

const ETICHETTA_LIVELLO: Record<LivelloRiga, string> = {
  critico: "CRIT",
  allarme: "ALERT",
  avviso: "WARN",
  info: "INFO",
};

/**
 * Il colore è l'unica cosa che si legge davvero scorrendo un elenco lungo:
 * il testo lo si guarda solo dopo essersi fermati su una riga.
 */
const COLORE_LIVELLO: Record<LivelloRiga, string> = {
  critico: "bg-[var(--allarme)] text-white",
  allarme: "bg-transparent text-[var(--allarme)] border-[var(--allarme)]",
  avviso: "bg-transparent text-[var(--accento)] border-[var(--accento)]",
  info: "bg-transparent text-[var(--testo-debole)] border-[var(--bordo)]",
};

/** I metodi hanno un colore stabile: si riconoscono senza leggerli. */
const COLORE_METODO: Record<string, string> = {
  GET: "text-[var(--info)]",
  HEAD: "text-[var(--info)]",
  POST: "text-[var(--ok)]",
  PATCH: "text-[var(--accento)]",
  PUT: "text-[var(--accento)]",
  DELETE: "text-[var(--allarme)]",
  OPTIONS: "text-[var(--testo-debole)]",
};

function coloreStato(stato: number | null) {
  if (stato === null) return "text-[var(--testo-debole)]";
  if (stato >= 500) return "text-[var(--allarme)]";
  if (stato >= 400) return "text-[var(--accento)]";
  return "text-[var(--ok)]";
}

function orario(quando: number) {
  return new Date(quando).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type Ordine =
  | "recenti"
  | "vecchie"
  | "gravita"
  | "durata"
  | "percorso"
  | "indirizzo";

const ETICHETTA_ORDINE: Record<Ordine, string> = {
  recenti: "Più recenti",
  vecchie: "Più vecchie",
  gravita: "Gravità",
  durata: "Durata",
  percorso: "Percorso",
  indirizzo: "Indirizzo",
};

/** Peso per l'ordinamento: "critico" in cima, "info" in fondo. */
const PESO: Record<LivelloRiga, number> = {
  critico: 3,
  allarme: 2,
  avviso: 1,
  info: 0,
};

const classiCampo =
  "mono min-h-9 border border-[var(--bordo)] bg-[var(--sfondo)] px-2.5 py-1.5 text-[11.5px] text-[var(--testo)] focus:border-[var(--accento)] focus:outline-none";

export function ConsoleRegistro({
  righe,
  nomi,
  tracciate,
}: {
  righe: RigaRegistro[];
  /** Traduzione utenteId → nome leggibile, fatta dal server. */
  nomi: Record<string, string>;
  /** Quante righe esistono in memoria, oltre alla finestra ricevuta. */
  tracciate: number;
}) {
  const [cerca, setCerca] = useState("");
  const [livelli, setLivelli] = useState<Set<LivelloRiga>>(new Set());
  const [metodo, setMetodo] = useState("");
  const [esito, setEsito] = useState("");
  const [soloIdentificati, setSoloIdentificati] = useState(false);
  const [ordine, setOrdine] = useState<Ordine>("recenti");

  const etichettaUtente = useCallback(
    (riga: RigaRegistro) => {
      if (!riga.utenteId) return null;
      return nomi[riga.utenteId] ?? riga.telegramId ?? riga.utenteId;
    },
    [nomi],
  );

  // I valori dei menù nascono dai dati, non da un elenco scritto a mano:
  // un metodo inatteso è esattamente ciò che si vuole poter isolare, e in
  // una lista fissa non comparirebbe mai.
  const metodi = useMemo(
    () => [...new Set(righe.map((r) => r.metodo))].sort(),
    [righe],
  );
  const esiti = useMemo(
    () => [...new Set(righe.map((r) => r.esito))].sort(),
    [righe],
  );

  const filtrate = useMemo(() => {
    const testo = cerca.trim().toLowerCase();

    const selezionate = righe.filter((riga) => {
      if (livelli.size > 0 && !livelli.has(riga.livello)) return false;
      if (metodo && riga.metodo !== metodo) return false;
      if (esito && riga.esito !== esito) return false;
      if (soloIdentificati && !riga.utenteId) return false;

      if (!testo) return true;

      // Una ricerca sola su tutto ciò che identifica la riga: separare
      // "cerca per IP" da "cerca per percorso" costringerebbe a sapere in
      // anticipo cosa si sta cercando, che è il contrario di come si guarda
      // un registro.
      const nome = etichettaUtente(riga) ?? "";
      return (
        riga.percorso.toLowerCase().includes(testo) ||
        riga.ip.toLowerCase().includes(testo) ||
        riga.metodo.toLowerCase().includes(testo) ||
        riga.esito.toLowerCase().includes(testo) ||
        nome.toLowerCase().includes(testo) ||
        (riga.ruolo ?? "").toLowerCase().includes(testo) ||
        (riga.telegramId ?? "").includes(testo) ||
        riga.agente.toLowerCase().includes(testo) ||
        riga.motivi.some((motivo) => motivo.toLowerCase().includes(testo))
      );
    });

    // Copia prima di ordinare: `sort` lavora sul posto, e l'array filtrato
    // può essere lo stesso riferimento quando non c'è nessun filtro attivo.
    const ordinate = [...selezionate];

    switch (ordine) {
      case "recenti":
        return ordinate.sort((a, b) => b.quando - a.quando);
      case "vecchie":
        return ordinate.sort((a, b) => a.quando - b.quando);
      case "gravita":
        return ordinate.sort(
          (a, b) => PESO[b.livello] - PESO[a.livello] || b.quando - a.quando,
        );
      case "durata":
        return ordinate.sort((a, b) => b.durataMs - a.durataMs);
      case "percorso":
        return ordinate.sort(
          (a, b) => a.percorso.localeCompare(b.percorso) || b.quando - a.quando,
        );
      case "indirizzo":
        return ordinate.sort(
          (a, b) => a.ip.localeCompare(b.ip) || b.quando - a.quando,
        );
    }
  }, [
    righe,
    cerca,
    livelli,
    metodo,
    esito,
    soloIdentificati,
    ordine,
    etichettaUtente,
  ]);

  const conteggi = useMemo(() => {
    const mappa: Record<LivelloRiga, number> = {
      critico: 0,
      allarme: 0,
      avviso: 0,
      info: 0,
    };
    for (const riga of righe) mappa[riga.livello] += 1;
    return mappa;
  }, [righe]);

  const commuta = (livello: LivelloRiga) => {
    setLivelli((precedenti) => {
      const successivi = new Set(precedenti);
      if (successivi.has(livello)) successivi.delete(livello);
      else successivi.add(livello);
      return successivi;
    });
  };

  const filtriAttivi =
    Boolean(cerca) ||
    livelli.size > 0 ||
    Boolean(metodo) ||
    Boolean(esito) ||
    soloIdentificati;

  return (
    <div className="flex flex-col gap-3">
      {/* ----------------------------- Filtri ----------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <input
            type="search"
            value={cerca}
            onChange={(evento) => setCerca(evento.target.value)}
            placeholder="Cerca: percorso, IP, utente, ruolo, agente, motivo…"
            aria-label="Filtra le righe della console"
            className={`${classiCampo} w-full`}
          />
        </div>

        <select
          value={metodo}
          onChange={(evento) => setMetodo(evento.target.value)}
          aria-label="Filtra per metodo"
          className={classiCampo}
        >
          <option value="">Ogni metodo</option>
          {metodi.map((voce) => (
            <option key={voce} value={voce}>
              {voce}
            </option>
          ))}
        </select>

        <select
          value={esito}
          onChange={(evento) => setEsito(evento.target.value)}
          aria-label="Filtra per esito"
          className={classiCampo}
        >
          <option value="">Ogni esito</option>
          {esiti.map((voce) => (
            <option key={voce} value={voce}>
              {voce}
            </option>
          ))}
        </select>

        <select
          value={ordine}
          onChange={(evento) => setOrdine(evento.target.value as Ordine)}
          aria-label="Ordina le righe"
          className={classiCampo}
        >
          {(Object.keys(ETICHETTA_ORDINE) as Ordine[]).map((voce) => (
            <option key={voce} value={voce}>
              {ETICHETTA_ORDINE[voce]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {LIVELLI.map((livello) => {
          const attivo = livelli.has(livello);
          return (
            <button
              key={livello}
              type="button"
              onClick={() => commuta(livello)}
              aria-pressed={attivo}
              className={`mono min-h-9 border px-2.5 text-[10.5px] tracking-[0.1em] uppercase transition-colors ${
                attivo
                  ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                  : `border-[var(--bordo)] ${
                      livello === "critico"
                        ? "text-[var(--allarme)]"
                        : livello === "allarme"
                          ? "text-[var(--allarme)]"
                          : livello === "avviso"
                            ? "text-[var(--accento)]"
                            : "text-[var(--testo-tenue)]"
                    }`
              }`}
            >
              {ETICHETTA_LIVELLO[livello]} · {conteggi[livello]}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setSoloIdentificati((v) => !v)}
          aria-pressed={soloIdentificati}
          className={`mono min-h-9 border px-2.5 text-[10.5px] tracking-[0.1em] uppercase transition-colors ${
            soloIdentificati
              ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
              : "border-[var(--bordo)] text-[var(--testo-tenue)]"
          }`}
        >
          Solo con account
        </button>

        {filtriAttivi && (
          <button
            type="button"
            onClick={() => {
              setCerca("");
              setLivelli(new Set());
              setMetodo("");
              setEsito("");
              setSoloIdentificati(false);
            }}
            className="mono min-h-9 border border-[var(--bordo)] px-2.5 text-[10.5px] tracking-[0.1em] text-[var(--testo-tenue)] uppercase"
          >
            Azzera
          </button>
        )}

        <span className="mono ml-auto text-[10.5px] text-[var(--testo-debole)]">
          {filtrate.length} di {righe.length} righe
        </span>
      </div>

      {/* ------------------------------ Righe ----------------------------- */}
      {filtrate.length === 0 ? (
        <p className="mono border border-[var(--bordo)] p-4 text-[12px] text-[var(--testo-tenue)]">
          {righe.length === 0
            ? "Nessuna richiesta registrata da quando il processo è attivo."
            : "Nessuna riga corrisponde ai filtri."}
        </p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto border border-[var(--bordo)]">
          {filtrate.map((riga) => {
            const nome = etichettaUtente(riga);
            return (
              <div
                key={riga.id}
                className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-[var(--bordo)] px-3 py-1.5 last:border-b-0 ${
                  riga.livello === "critico"
                    ? "bg-[color-mix(in_srgb,var(--allarme)_12%,transparent)]"
                    : ""
                }`}
              >
                <span className="mono text-[10.5px] text-[var(--testo-debole)] tabular-nums">
                  {orario(riga.quando)}
                </span>

                <span
                  className={`mono border px-1.5 text-[9.5px] font-bold tracking-[0.08em] ${COLORE_LIVELLO[riga.livello]}`}
                >
                  {ETICHETTA_LIVELLO[riga.livello]}
                </span>

                <span
                  className={`mono w-[52px] shrink-0 text-[10.5px] font-bold ${
                    COLORE_METODO[riga.metodo] ?? "text-[var(--allarme)]"
                  }`}
                >
                  {riga.metodo}
                </span>

                {riga.stato !== null && (
                  <span
                    className={`mono text-[10.5px] tabular-nums ${coloreStato(riga.stato)}`}
                  >
                    {riga.stato}
                  </span>
                )}

                <span className="mono min-w-0 flex-1 text-[11.5px] break-all">
                  {riga.percorso || "/"}
                </span>

                <span className="mono text-[10.5px] text-[var(--testo-tenue)]">
                  {riga.ip}
                </span>

                {/* L'account, quando c'è. Senza, la riga resta un indirizzo
                    e basta: è la differenza fra "qualcuno" e "chi". */}
                {nome ? (
                  <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--accento)]">
                    <Icone.utenti className="h-3 w-3" />
                    {nome}
                    {riga.ruolo && riga.ruolo !== "UTENTE" && (
                      <span className="text-[var(--testo-debole)]">
                        ·{riga.ruolo}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="mono text-[10.5px] text-[var(--testo-debole)]">
                    anonimo
                  </span>
                )}

                {riga.durataMs > 0 && (
                  <span className="mono text-[10px] text-[var(--testo-debole)] tabular-nums">
                    {riga.durataMs}ms
                  </span>
                )}

                {riga.motivi.length > 0 && (
                  <span className="mono w-full text-[10.5px] text-[var(--testo-tenue)]">
                    ↳ {riga.motivi.join(" · ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mono text-[10px] leading-[1.7] text-[var(--testo-debole)]">
        Filtri e ordinamento lavorano sulle ultime {righe.length} righe
        ricevute; in memoria ce ne sono {tracciate.toLocaleString("it-IT")}. Le
        righe più vecchie cadono via via: la console è una finestra sul
        presente, non un archivio.
      </p>
    </div>
  );
}

export type { LivelloRiga, TipoEvento };
