"use client";

import { useCallback, useMemo, useState } from "react";
import type { SchedaRete } from "@/lib/rete-inversa";
import type { LivelloRiga, RigaRegistro, TipoEvento } from "@/lib/sorveglianza";
import {
  ETICHETTA_LIVELLO,
  LIVELLI,
  PESO_LIVELLO,
  RigaConsole,
  type BersaglioBando,
} from "./riga-registro";

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
 * La finestra è dichiarata sotto l'elenco, non lasciata indovinare — e per
 * andare più indietro c'è la scheda Logs, che interroga il database.
 */

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

const classiCampo =
  "mono min-h-11 w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-2.5 py-1.5 text-[11.5px] text-[var(--testo)] focus:border-[var(--accento)] focus:outline-none";

export function ConsoleRegistro({
  righe,
  nomi,
  rete,
  tracciate,
  puoBandire,
  onBandisci,
}: {
  righe: RigaRegistro[];
  /** Traduzione utenteId → nome leggibile, fatta dal server. */
  nomi: Record<string, string>;
  /** Classificazione degli indirizzi per risoluzione inversa. */
  rete: Record<string, SchedaRete>;
  /** Quante righe esistono in memoria, oltre alla finestra ricevuta. */
  tracciate: number;
  /** Solo DEVELOPER: mostra le scorciatoie di esclusione sulle righe. */
  puoBandire: boolean;
  onBandisci?: (tipo: BersaglioBando, valore: string) => void;
}) {
  const [cerca, setCerca] = useState("");
  const [livelli, setLivelli] = useState<Set<LivelloRiga>>(new Set());
  const [metodo, setMetodo] = useState("");
  const [esito, setEsito] = useState("");
  const [soloIdentificati, setSoloIdentificati] = useState(false);
  const [soloVpn, setSoloVpn] = useState(false);
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
      if (soloVpn && !rete[riga.ip]?.hosting) return false;

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
        (riga.dispositivo ?? "").includes(testo) ||
        (riga.paese ?? "").toLowerCase().includes(testo) ||
        (rete[riga.ip]?.ptr ?? "").toLowerCase().includes(testo) ||
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
          (a, b) =>
            PESO_LIVELLO[b.livello] - PESO_LIVELLO[a.livello] ||
            b.quando - a.quando,
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
    soloVpn,
    ordine,
    rete,
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
    soloIdentificati ||
    soloVpn;

  return (
    <div className="flex flex-col gap-3">
      {/* ----------------------------- Filtri -----------------------------
          La ricerca da sola su tutta la larghezza, i menù in due colonne
          sotto: in una sola fila che va a capo, su telefono i tre selettori
          si stringevano a due centimetri l'uno e mostravano tre lettere
          della voce scelta. */}
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={cerca}
          onChange={(evento) => setCerca(evento.target.value)}
          placeholder="Cerca: percorso, IP, utente, dispositivo, paese, agente…"
          aria-label="Filtra le righe della console"
          className={classiCampo}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
            className={`${classiCampo} col-span-2 sm:col-span-1`}
          >
            {(Object.keys(ETICHETTA_ORDINE) as Ordine[]).map((voce) => (
              <option key={voce} value={voce}>
                {ETICHETTA_ORDINE[voce]}
              </option>
            ))}
          </select>
        </div>
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
                      livello === "critico" || livello === "allarme"
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

        <button
          type="button"
          onClick={() => setSoloVpn((v) => !v)}
          aria-pressed={soloVpn}
          title="Indirizzi il cui nome inverso indica un datacenter o una VPN"
          className={`mono min-h-9 border px-2.5 text-[10.5px] tracking-[0.1em] uppercase transition-colors ${
            soloVpn
              ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
              : "border-[var(--bordo)] text-[var(--testo-tenue)]"
          }`}
        >
          Solo VPN
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
              setSoloVpn(false);
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
          {filtrate.map((riga) => (
            <RigaConsole
              key={riga.id}
              riga={riga}
              nome={etichettaUtente(riga)}
              rete={rete[riga.ip]}
              puoBandire={puoBandire}
              onBandisci={onBandisci}
            />
          ))}
        </div>
      )}

      <p className="mono text-[10px] leading-[1.7] text-[var(--testo-debole)]">
        Filtri e ordinamento lavorano sulle ultime {righe.length} righe
        ricevute; in memoria ce ne sono {tracciate.toLocaleString("it-IT")}. Le
        righe più vecchie cadono via via: la console è una finestra sul
        presente. Per andare più indietro c&apos;è la scheda Logs.
      </p>
    </div>
  );
}

export type { LivelloRiga, TipoEvento };
