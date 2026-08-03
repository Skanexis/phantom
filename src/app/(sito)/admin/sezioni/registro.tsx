"use client";

import { useEffect, useState } from "react";
import { Etichetta } from "@/components/ui";
import { Icone } from "@/components/icone";
import { ModuloAzione } from "@/components/modulo-azione";
import { bandisciSubito } from "../azioni";
import {
  ETICHETTA_LIVELLO,
  LIVELLI,
  RigaConsole,
  type BersaglioBando,
} from "./riga-registro";
import type { LivelloRiga, RigaRegistro } from "@/lib/sorveglianza";

/**
 * Logs: l'archivio delle richieste, un anno indietro.
 *
 * La console della sorveglianza risponde a «cosa sta succedendo» e vive
 * nella memoria del processo: quattrocento righe, azzerate a ogni riavvio.
 * Questa scheda risponde alla domanda che quella non può reggere — «cosa ha
 * fatto quell'indirizzo tre settimane fa» — e per farlo interroga il
 * database invece della memoria.
 *
 * La differenza si vede nei filtri: là si filtra una finestra già in mano al
 * browser, qui ogni cambio di filtro è una interrogazione nuova. Per questo
 * il periodo è **sempre** impostato, anche all'apertura: una query senza
 * limiti di data su un archivio annuale è una scansione, e la si pagherebbe
 * per mostrare le prime cento righe che si sarebbero viste comunque.
 */

const PERIODI = [
  { id: "24h", etichetta: "24 ore", ore: 24 },
  { id: "7g", etichetta: "7 giorni", ore: 24 * 7 },
  { id: "30g", etichetta: "30 giorni", ore: 24 * 30 },
  { id: "365g", etichetta: "1 anno", ore: 24 * 365 },
] as const;

type IdPeriodo = (typeof PERIODI)[number]["id"];

type Filtri = {
  periodo: IdPeriodo;
  livelli: Set<LivelloRiga>;
  metodo: string;
  ip: string;
  sottorete: string;
  percorso: string;
  soloEventi: boolean;
};

const FILTRI_INIZIALI: Filtri = {
  periodo: "24h",
  livelli: new Set(),
  metodo: "",
  ip: "",
  sottorete: "",
  percorso: "",
  soloEventi: false,
};

const METODI = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"];

const classiCampo =
  "mono min-h-11 w-full border border-[var(--bordo)] bg-[var(--sfondo)] px-2.5 py-1.5 text-[11.5px] text-[var(--testo)] focus:border-[var(--accento)] focus:outline-none";

/** I filtri diventano la query string, in un posto solo: la usano l'elenco
 *  e l'esportazione, e due composizioni diverse divergerebbero. */
function componiQuery(filtri: Filtri): URLSearchParams {
  const ore = PERIODI.find((voce) => voce.id === filtri.periodo)?.ore ?? 24;
  const parametri = new URLSearchParams();

  parametri.set("da", new Date(Date.now() - ore * 3600_000).toISOString());
  if (filtri.livelli.size > 0) {
    parametri.set("livello", [...filtri.livelli].join(","));
  }
  if (filtri.metodo) parametri.set("metodo", filtri.metodo);
  if (filtri.ip.trim()) parametri.set("ip", filtri.ip.trim());
  if (filtri.sottorete.trim()) {
    parametri.set("sottorete", filtri.sottorete.trim());
  }
  if (filtri.percorso.trim()) parametri.set("percorso", filtri.percorso.trim());
  if (filtri.soloEventi) parametri.set("soloEventi", "1");

  return parametri;
}

type Pagina = {
  righe: RigaRegistro[];
  prossimoCursore: number | null;
  altre: boolean;
};

/** Legge una pagina. Non tocca nessuno stato: lo scrive chi la chiama. */
async function leggiPagina(
  percorsoApi: string,
  filtri: Filtri,
  cursore: number | null,
): Promise<Pagina> {
  const parametri = componiQuery(filtri);
  if (cursore) parametri.set("cursore", String(cursore));

  const risposta = await fetch(`${percorsoApi}?${parametri}`, {
    cache: "no-store",
  });
  if (!risposta.ok) throw new Error(String(risposta.status));
  return risposta.json();
}

export function SezioneRegistro({
  percorsoApi = "/api/admin/registro",
  titolo = "Archivio delle richieste",
  nota = "conservate 365 giorni · scritte a lotti, non a ogni richiesta",
  vuoto = "Nessuna richiesta nell'archivio con questi filtri.",
}: {
  /**
   * Da dove leggere. DEV.LOGS usa la stessa interfaccia su una rotta
   * diversa, che impone il filtro sul ruolo dal lato server: il componente
   * non sa e non deve sapere quale sottoinsieme sta guardando.
   */
  percorsoApi?: string;
  titolo?: string;
  nota?: string;
  vuoto?: string;
} = {}) {
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_INIZIALI);
  const [righe, setRighe] = useState<RigaRegistro[]>([]);
  const [cursore, setCursore] = useState<number | null>(null);
  const [altre, setAltre] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [bozza, setBozza] = useState<{
    tipo: BersaglioBando;
    valore: string;
  } | null>(null);

  /**
   * A ogni cambio di filtro si riparte dalla prima pagina: mantenere il
   * cursore vorrebbe dire chiedere "la pagina dopo" di un elenco che non
   * esiste più.
   *
   * La lettura sta dentro l'effetto e non in una funzione condivisa perché
   * chi scrive lo stato dev'essere chi lo possiede: l'effetto sa se è
   * ancora vivo quando la risposta arriva, il gestore del pulsante sa di
   * esserlo per definizione. La parte comune — comporre l'URL e leggere la
   * risposta — è in `leggiPagina`, che non tocca nessuno stato.
   */
  useEffect(() => {
    // Smontato il componente o cambiati i filtri, la risposta ancora in
    // volo non deve più scrivere: partirebbe una richiesta e ne
    // arriverebbero due, in ordine non garantito.
    let vivo = true;

    void (async () => {
      try {
        const corpo = await leggiPagina(percorsoApi, filtri, null);
        if (!vivo) return;
        setErrore(null);
        setRighe(corpo.righe);
        setCursore(corpo.prossimoCursore ?? null);
        setAltre(Boolean(corpo.altre));
      } catch {
        if (vivo) setErrore("Lettura dell'archivio non riuscita.");
      } finally {
        if (vivo) setCaricando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [filtri, percorsoApi]);

  /** Pagina successiva: allunga l'elenco invece di sostituirlo. */
  const caricaAltre = async () => {
    if (!cursore || caricando) return;
    setCaricando(true);
    try {
      const corpo = await leggiPagina(percorsoApi, filtri, cursore);
      setErrore(null);
      setRighe((precedenti) => [...precedenti, ...corpo.righe]);
      setCursore(corpo.prossimoCursore ?? null);
      setAltre(Boolean(corpo.altre));
    } catch {
      setErrore("Lettura dell'archivio non riuscita.");
    } finally {
      setCaricando(false);
    }
  };

  const commuta = (livello: LivelloRiga) => {
    setFiltri((precedenti) => {
      const livelli = new Set(precedenti.livelli);
      if (livelli.has(livello)) livelli.delete(livello);
      else livelli.add(livello);
      return { ...precedenti, livelli };
    });
  };

  const scarica = () => {
    const parametri = componiQuery(filtri);
    parametri.set("formato", "csv");
    // Stessa rotta dell'elenco: se questa fosse fissa, l'esportazione da
    // DEV.LOGS scaricherebbe in silenzio l'archivio intero invece del
    // sottoinsieme che si sta guardando.
    window.location.href = `${percorsoApi}?${parametri}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="border border-[var(--bordo)]">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[var(--bordo)] px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icone.registro className="h-4 w-4 shrink-0 text-[var(--accento)]" />
            <Etichetta>{titolo}</Etichetta>
          </div>
          <span className="mono min-w-0 text-[10.5px] break-words text-[var(--testo-debole)]">
            {nota}
          </span>
        </header>

        <div className="flex flex-col gap-3 p-3 sm:p-4">
          {/* Periodo: sempre impostato, mai "tutto". Vedi la nota in testa. */}
          <div className="flex flex-wrap gap-1.5">
            {PERIODI.map((voce) => (
              <button
                key={voce.id}
                type="button"
                onClick={() =>
                  setFiltri((p) => ({ ...p, periodo: voce.id }))
                }
                aria-pressed={filtri.periodo === voce.id}
                className={`mono min-h-9 border px-3 text-[10.5px] tracking-[0.1em] uppercase transition-colors ${
                  filtri.periodo === voce.id
                    ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                    : "border-[var(--bordo)] text-[var(--testo-tenue)]"
                }`}
              >
                {voce.etichetta}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={filtri.percorso}
              onChange={(e) =>
                setFiltri((p) => ({ ...p, percorso: e.target.value }))
              }
              placeholder="Percorso contiene…"
              aria-label="Filtra per percorso"
              className={classiCampo}
            />
            <input
              value={filtri.ip}
              onChange={(e) => setFiltri((p) => ({ ...p, ip: e.target.value }))}
              placeholder="Indirizzo esatto"
              aria-label="Filtra per indirizzo"
              className={classiCampo}
            />
            <input
              value={filtri.sottorete}
              onChange={(e) =>
                setFiltri((p) => ({ ...p, sottorete: e.target.value }))
              }
              placeholder="Rete, es. 203.0.113.0/24"
              aria-label="Filtra per sottorete"
              className={classiCampo}
            />
            <select
              value={filtri.metodo}
              onChange={(e) =>
                setFiltri((p) => ({ ...p, metodo: e.target.value }))
              }
              aria-label="Filtra per metodo"
              className={classiCampo}
            >
              <option value="">Ogni metodo</option>
              {METODI.map((voce) => (
                <option key={voce} value={voce}>
                  {voce}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {LIVELLI.map((livello) => {
              const attivo = filtri.livelli.has(livello);
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
                  {ETICHETTA_LIVELLO[livello]}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() =>
                setFiltri((p) => ({ ...p, soloEventi: !p.soloEventi }))
              }
              aria-pressed={filtri.soloEventi}
              title="Solo le righe nate da un evento di sicurezza"
              className={`mono min-h-9 border px-2.5 text-[10.5px] tracking-[0.1em] uppercase transition-colors ${
                filtri.soloEventi
                  ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                  : "border-[var(--bordo)] text-[var(--testo-tenue)]"
              }`}
            >
              Solo respinte
            </button>

            <button
              type="button"
              onClick={() => setFiltri(FILTRI_INIZIALI)}
              className="mono min-h-9 border border-[var(--bordo)] px-2.5 text-[10.5px] tracking-[0.1em] text-[var(--testo-tenue)] uppercase"
            >
              Azzera
            </button>

            <button
              type="button"
              onClick={scarica}
              className="mono ml-auto min-h-9 border border-[var(--bordo)] px-2.5 text-[10.5px] tracking-[0.1em] text-[var(--testo-tenue)] uppercase transition-colors hover:text-[var(--accento)]"
            >
              Esporta CSV
            </button>
          </div>
        </div>
      </section>

      {/* --------------------------- Esclusione ---------------------------- */}
      {bozza && (
        <section className="border border-[var(--allarme)] p-3 sm:p-4">
          <Etichetta className="block">Escludi</Etichetta>
          <p className="mono mt-2 border border-[var(--bordo)] p-3 text-[12px] break-all">
            {bozza.valore}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ModuloAzione azione={bandisciSubito} className="contents">
              {({ inCorso }) => (
                <>
                  <input type="hidden" name="tipo" value={bozza.tipo} />
                  <input type="hidden" name="valore" value={bozza.valore} />
                  <button
                    type="submit"
                    disabled={inCorso}
                    className="mono spinta min-h-11 border border-[var(--allarme)] bg-[var(--allarme)] px-5 text-[11px] tracking-[0.12em] text-white uppercase disabled:opacity-50"
                  >
                    {inCorso ? "Escludo…" : "Escludi subito"}
                  </button>
                </>
              )}
            </ModuloAzione>
            <button
              type="button"
              onClick={() => setBozza(null)}
              className="mono spinta min-h-11 border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase"
            >
              Annulla
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------ Righe ------------------------------ */}
      {errore && (
        <p className="mono border border-[var(--allarme)] p-4 text-[12px] text-[var(--allarme)]">
          {errore}
        </p>
      )}

      {righe.length === 0 && !caricando && !errore ? (
        <p className="mono border border-[var(--bordo)] p-4 text-[12px] leading-[1.7] text-[var(--testo-tenue)]">
          {vuoto} Se il sito è appena stato riavviato, le prime righe
          compaiono entro venti secondi: la scrittura è a lotti.
        </p>
      ) : (
        <div className="border border-[var(--bordo)]">
          {righe.map((riga) => (
            <RigaConsole
              key={riga.id}
              riga={riga}
              // I nomi degli account non si traducono qui: sarebbe una
              // lettura per pagina su una tabella che non è indicizzata per
              // questo. L'identificativo Telegram è già nella riga, e
              // l'anagrafica sta nella scheda Utenti.
              nome={riga.telegramId}
              puoBandire
              conData
              onBandisci={(tipo, valore) => setBozza({ tipo, valore })}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="mono text-[10.5px] text-[var(--testo-debole)]">
          {righe.length} righe caricate
        </span>
        {altre && (
          <button
            type="button"
            onClick={() => void caricaAltre()}
            disabled={caricando}
            className="mono spinta min-h-11 border border-[var(--bordo)] px-5 text-[11px] tracking-[0.12em] uppercase disabled:opacity-50"
          >
            {caricando ? "Carico…" : "Carica altre"}
          </button>
        )}
      </div>
    </div>
  );
}
