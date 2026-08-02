"use client";

import { Icone } from "@/components/icone";
import { nomePaese, siglaPaese } from "@/lib/geo";
import { sottorete } from "@/lib/rete";
import type { SchedaRete } from "@/lib/rete-inversa";
import type { LivelloRiga, RigaRegistro } from "@/lib/sorveglianza";

/**
 * Una riga di registro, e il vocabolario che la accompagna.
 *
 * Sta in un modulo suo perché la stessa riga si legge in due posti: la
 * console in tempo reale della sorveglianza e l'archivio a 365 giorni della
 * scheda Logs. Sono due domande diverse — "cosa sta succedendo" e "cosa è
 * successo" — ma la risposta ha la stessa forma, e due copie della stessa
 * marcatura divergerebbero alla prima modifica: un colore cambiato di qua e
 * non di là, e le due schede smettono di essere confrontabili proprio
 * mentre si passa dall'una all'altra seguendo lo stesso indirizzo.
 *
 * Sulla disposizione. La riga esiste in due versioni, non in una che si
 * adatta: su schermo largo è una linea densa da scorrere con gli occhi, su
 * telefono sono tre blocchi impilati. Il tentativo precedente — un solo
 * `flex-wrap` con nove elementi in fila — su 360 pixel produceva un
 * groviglio in cui l'ora finiva accanto al paese e il percorso spariva a
 * metà: gli elementi andavano a capo dove capitava, perché niente diceva
 * quali stanno insieme.
 */

export type BersaglioBando = "IP" | "SOTTORETE" | "DISPOSITIVO";

export const LIVELLI: LivelloRiga[] = ["critico", "allarme", "avviso", "info"];

export const ETICHETTA_LIVELLO: Record<LivelloRiga, string> = {
  critico: "CRIT",
  allarme: "ALERT",
  avviso: "WARN",
  info: "INFO",
};

/**
 * Il colore è l'unica cosa che si legge davvero scorrendo un elenco lungo:
 * il testo lo si guarda solo dopo essersi fermati su una riga.
 */
export const COLORE_LIVELLO: Record<LivelloRiga, string> = {
  critico: "bg-[var(--allarme)] text-white border-[var(--allarme)]",
  allarme: "bg-transparent text-[var(--allarme)] border-[var(--allarme)]",
  avviso: "bg-transparent text-[var(--accento)] border-[var(--accento)]",
  info: "bg-transparent text-[var(--testo-debole)] border-[var(--bordo)]",
};

/** Peso per l'ordinamento: "critico" in cima, "info" in fondo. */
export const PESO_LIVELLO: Record<LivelloRiga, number> = {
  critico: 3,
  allarme: 2,
  avviso: 1,
  info: 0,
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

export function orario(quando: number) {
  return new Date(quando).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Nell'archivio l'ora da sola non basta: due righe alle 14:03 possono
 * distare sei mesi. La data compare solo quando serve — nella console
 * dal vivo sono tutte di oggi, e ripeterla su ogni riga ruberebbe spazio
 * al percorso senza dire niente.
 */
export function momento(quando: number, conData: boolean) {
  if (!conData) return orario(quando);
  const data = new Date(quando).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${data} ${orario(quando)}`;
}

/**
 * Origine dell'indirizzo: il marcatore di rete a noleggio.
 *
 * La V non è una certezza — è quello che dice il nome inverso
 * dell'indirizzo — quindi porta con sé la propria prova nel titolo, invece
 * di limitarsi ad affermare.
 */
export function Origine({ rete }: { rete?: SchedaRete }) {
  if (!rete?.hosting) return null;
  return (
    <span
      title={rete.ptr ? `Probabile VPN o datacenter: ${rete.ptr}` : undefined}
      aria-label="probabile VPN o datacenter"
      className="mono shrink-0 border border-[var(--accento)] px-1 text-[9px] font-bold text-[var(--accento)]"
    >
      V
    </span>
  );
}

/** Pastiglia cliccabile che prepara un'esclusione. */
function Bersaglio({
  etichetta,
  titolo,
  onClick,
}: {
  etichetta: string;
  titolo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titolo}
      className="mono shrink-0 border border-[var(--bordo)] px-1 text-[9px] tracking-[0.06em] text-[var(--testo-debole)] uppercase transition-colors hover:border-[var(--allarme)] hover:text-[var(--allarme)]"
    >
      {etichetta}
    </button>
  );
}

export function RigaConsole({
  riga,
  nome,
  rete,
  puoBandire,
  conData = false,
  onBandisci,
}: {
  riga: RigaRegistro;
  /** Nome leggibile dell'account, già tradotto dal server. */
  nome: string | null;
  rete?: SchedaRete;
  /** Solo DEVELOPER: mostra le scorciatoie di esclusione sulla riga. */
  puoBandire: boolean;
  conData?: boolean;
  onBandisci?: (tipo: BersaglioBando, valore: string) => void;
}) {
  const rete24 = sottorete(riga.ip);

  return (
    <div
      className={`border-b border-[var(--bordo)] px-3 py-2 last:border-b-0 ${
        riga.livello === "critico"
          ? "bg-[color-mix(in_srgb,var(--allarme)_12%,transparent)]"
          : ""
      }`}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2.5 sm:gap-y-1">
        {/* Quando, quanto grave, come, con che esito: il blocco che dice
            "che tipo di riga è questa" prima ancora di leggerla. */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="mono text-[10.5px] text-[var(--testo-debole)] tabular-nums">
            {momento(riga.quando, conData)}
          </span>
          <span
            className={`mono border px-1.5 text-[9.5px] font-bold tracking-[0.08em] ${COLORE_LIVELLO[riga.livello]}`}
          >
            {ETICHETTA_LIVELLO[riga.livello]}
          </span>
          <span
            className={`mono text-[10.5px] font-bold ${
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
          {riga.durataMs > 0 && (
            <span className="mono text-[10px] text-[var(--testo-debole)] tabular-nums sm:hidden">
              {riga.durataMs}ms
            </span>
          )}
        </span>

        {/* Il percorso prende tutto lo spazio che resta e va a capo dove
            vuole: è il campo più lungo e l'unico che non si può accorciare
            senza perdere il senso della riga. */}
        <span className="mono min-w-0 flex-1 text-[11.5px] break-all">
          {riga.percorso || "/"}
        </span>

        {/* Da dove e da chi. Su telefono è la terza riga della carta, su
            schermo largo la coda della linea. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--testo-tenue)]">
            <span
              aria-label={nomePaese(riga.paese)}
              title={nomePaese(riga.paese)}
              className="shrink-0 text-[var(--testo-debole)]"
            >
              {siglaPaese(riga.paese)}
            </span>
            {puoBandire && onBandisci ? (
              <button
                type="button"
                onClick={() => onBandisci("IP", riga.ip)}
                title="Prepara l'esclusione di questo indirizzo"
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--allarme)]"
              >
                {riga.ip}
              </button>
            ) : (
              riga.ip
            )}
            <Origine rete={rete} />
          </span>

          {/* La sottorete non si mostra da sola in una colonna propria: è
              l'indirizzo di prima con l'ultimo pezzo tolto, e messa
              accanto si legge come "anche tutta questa rete". */}
          {puoBandire && onBandisci && rete24 && (
            <Bersaglio
              etichetta={`/${rete24.split("/")[1]}`}
              titolo={`Prepara l'esclusione della sottorete ${rete24}`}
              onClick={() => onBandisci("SOTTORETE", rete24)}
            />
          )}

          {/* Il marcatore del dispositivo: è ciò che resta uguale quando
              l'indirizzo cambia, quindi è la chiave con cui si esclude
              davvero qualcuno che si riconnette da altrove. Mostrato
              accorciato — trentadue caratteri esadecimali in ogni riga
              renderebbero il registro illeggibile — ma il valore intero è
              nel titolo e nel bando. */}
          {riga.dispositivo &&
            (puoBandire && onBandisci ? (
              <Bersaglio
                etichetta={`⬡${riga.dispositivo.slice(0, 8)}`}
                titolo={`Dispositivo ${riga.dispositivo} — prepara l'esclusione`}
                onClick={() =>
                  onBandisci("DISPOSITIVO", riga.dispositivo as string)
                }
              />
            ) : (
              <span
                title={riga.dispositivo}
                className="mono text-[10px] text-[var(--testo-debole)]"
              >
                ⬡{riga.dispositivo.slice(0, 8)}
              </span>
            ))}

          {/* L'account, quando c'è. Senza, la riga resta un indirizzo e
              basta: è la differenza fra "qualcuno" e "chi". */}
          {nome ? (
            <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--accento)]">
              <Icone.utenti className="h-3 w-3 shrink-0" />
              {nome}
              {riga.ruolo && riga.ruolo !== "UTENTE" && (
                <span className="text-[var(--testo-debole)]">·{riga.ruolo}</span>
              )}
            </span>
          ) : (
            <span className="mono text-[10.5px] text-[var(--testo-debole)]">
              anonimo
            </span>
          )}

          {riga.durataMs > 0 && (
            <span className="mono hidden text-[10px] text-[var(--testo-debole)] tabular-nums sm:inline">
              {riga.durataMs}ms
            </span>
          )}
        </span>

        {riga.motivi.length > 0 && (
          <span className="mono w-full text-[10.5px] text-[var(--testo-tenue)]">
            ↳ {riga.motivi.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}
