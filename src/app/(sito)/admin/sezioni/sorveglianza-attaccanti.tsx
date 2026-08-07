"use client";

import { Etichetta } from "@/components/ui";
import { Icone } from "@/components/icone";
import { nomePaese, siglaPaese } from "@/lib/geo";
import { sottorete } from "@/lib/rete";
import type { GenereRete, OperatoreRete } from "@/lib/reti-note";
import type { SchedaRete } from "@/lib/rete-inversa";
import type { TipoEvento } from "@/lib/sorveglianza";
import type { BersaglioBando } from "./riga-registro";

/**
 * Chi sta bussando, un indirizzo per riga.
 *
 * Il giornale degli eventi risponde a «cosa è successo» e va benissimo per
 * quello. Ma davanti a dodici righe consecutive «Sonda automatica da
 * 4.223.73.90» la domanda vera è un'altra — *chi è costui e cosa vuole* — e
 * dodici righe uguali non la aiutano: bisogna leggerle tutte e ricomporle a
 * mente. Qui la ricomposizione è già fatta: un indirizzo, quanti tentativi,
 * quali percorsi ha provato, da quanto insiste, a chi appartiene la sua
 * rete.
 *
 * La riga dei percorsi è la parte che dice davvero qualcosa. `/aa.php`,
 * `/av.php`, `/admin.php`, `/8.php` non è un elenco: è la firma di uno
 * scanner che cerca webshell PHP lasciate da qualcun altro. `/wp-admin/…`
 * è qualcuno che cerca WordPress. Il conteggio dice quanto insiste, i
 * percorsi dicono cosa cerca, e solo il secondo aiuta a decidere.
 */

export type Attaccante = {
  ip: string;
  eventi: number;
  richieste: number;
  tipi: Partial<Record<TipoEvento, number>>;
  primo: number;
  ultimo: number;
  agente: string;
  paese: string | null;
  inQuarantena: boolean;
  percorsi: { percorso: string; quante: number }[];
  percorsiDistinti: number;
};

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
  esclusione: "Escluso dallo staff",
  quarantena: "In quarantena",
};

/** Colore del marcatore di rete: dice cosa aspettarsi da un bando. */
const COLORE_GENERE: Record<GenereRete, string> = {
  cdn: "border-[var(--info)] text-[var(--info)]",
  cloud: "border-[var(--accento)] text-[var(--accento)]",
  vpn: "border-[var(--allarme)] text-[var(--allarme)]",
};

const NOME_GENERE: Record<GenereRete, string> = {
  cdn: "CDN",
  cloud: "cloud",
  vpn: "VPN",
};

function durata(millisecondi: number) {
  const minuti = Math.floor(millisecondi / 60000);
  if (minuti < 1) return "meno di un minuto";
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore}h ${minuti % 60}m`;
  return `${Math.floor(ore / 24)}g`;
}

function orario(quando: number) {
  return new Date(quando).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SezioneAttaccanti({
  attaccanti,
  operatori,
  rete,
  onBandisci,
}: {
  attaccanti: Attaccante[];
  /** ip → operatore riconosciuto per intervallo, quando c'è. */
  operatori: Record<string, OperatoreRete>;
  /** ip → esito della risoluzione inversa, per gli indirizzi non in tabella. */
  rete: Record<string, SchedaRete>;
  onBandisci: (tipo: BersaglioBando, valore: string) => void;
}) {
  if (attaccanti.length === 0) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
        Nessun indirizzo ha generato eventi da quando il processo è attivo. È
        la situazione normale: qui compare solo chi è stato respinto.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {attaccanti.map((voce) => {
        const operatore = operatori[voce.ip];
        const rete24 = sottorete(voce.ip);
        const inversa = rete[voce.ip];
        const scanner = (voce.tipi.sonda ?? 0) >= 3;

        return (
          <article
            key={voce.ip}
            className={`superficie p-3 sm:p-4 ${
              voce.inQuarantena ? "superficie--allarme" : ""
            }`}
          >
            {/* Intestazione: chi, da dove, da quanto */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
              <span className="mono flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                {voce.inQuarantena && (
                  <Icone.divieto className="h-4 w-4 shrink-0 text-[var(--allarme)]" />
                )}
                <span
                  aria-label={nomePaese(voce.paese)}
                  title={nomePaese(voce.paese)}
                  className="shrink-0 text-[10px] text-[var(--testo-debole)]"
                >
                  {siglaPaese(voce.paese)}
                </span>
                <span className="break-all">{voce.ip}</span>

                {operatore && (
                  <span
                    title={`Intervallo noto di ${operatore.nome}`}
                    className={`mono shrink-0 border px-1.5 py-0.5 text-[9.5px] tracking-[0.06em] uppercase ${COLORE_GENERE[operatore.genere]}`}
                  >
                    {operatore.nome} · {NOME_GENERE[operatore.genere]}
                  </span>
                )}
                {!operatore && inversa?.hosting && (
                  <span
                    title={inversa.ptr ?? undefined}
                    className="mono shrink-0 border border-[var(--accento)] px-1.5 py-0.5 text-[9.5px] tracking-[0.06em] text-[var(--accento)] uppercase"
                  >
                    datacenter
                  </span>
                )}
              </span>

              <span className="mono shrink-0 text-[10.5px] whitespace-nowrap text-[var(--testo-debole)]">
                {durata(voce.ultimo - voce.primo)} · {orario(voce.ultimo)}
              </span>
            </div>

            {/* Cifre in riga: quanto, di che tipo */}
            <div className="mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="text-[var(--allarme)]">
                {voce.eventi} respinte
              </span>
              <span className="text-[var(--testo-debole)]">
                su {voce.richieste} richieste
              </span>
              {voce.percorsiDistinti > 0 && (
                <span className="text-[var(--testo-tenue)]">
                  {voce.percorsiDistinti} percorsi distinti
                </span>
              )}
              {scanner && (
                <span className="border border-[var(--allarme)] px-1.5 text-[9.5px] tracking-[0.06em] text-[var(--allarme)] uppercase">
                  scanner
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(voce.tipi).map(([tipo, quanti]) => (
                <span
                  key={tipo}
                  className="mono border border-[var(--bordo)] px-1.5 py-0.5 text-[10px] text-[var(--testo-tenue)]"
                >
                  {ETICHETTE[tipo as TipoEvento]} ×{quanti}
                </span>
              ))}
            </div>

            {/* Cosa ha cercato: la parte che spiega chi è */}
            {voce.percorsi.length > 0 && (
              <div className="mt-3 border-t border-dashed border-[var(--bordo)] pt-2.5">
                <Etichetta className="block">Cosa ha cercato</Etichetta>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {voce.percorsi.map((riga) => (
                    <span
                      key={riga.percorso}
                      className="mono border border-[var(--bordo)] px-1.5 py-0.5 text-[10.5px] break-all"
                    >
                      {riga.percorso}
                      {riga.quante > 1 && (
                        <span className="text-[var(--testo-debole)]">
                          {" "}
                          ×{riga.quante}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {voce.agente && (
              <p className="mono mt-2 truncate text-[10px] text-[var(--testo-debole)]">
                {voce.agente}
              </p>
            )}

            {/* Azioni affiancate e consiglio in una riga sola.
                La versione precedente metteva sotto ogni carta un paragrafo
                di cinque righe che spiegava perché bandire una rete di CDN
                è inutile: giusto una volta, ma ripetuto identico su ogni
                indirizzo di Cloudflare diventava metà della schermata, e la
                spiegazione ripetuta si smette di leggere alla seconda. Il
                perché completo sta una volta sola in fondo all'elenco; qui
                resta la riga che serve per decidere adesso. */}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--bordo)] pt-3">
              <button
                type="button"
                onClick={() => onBandisci("IP", voce.ip)}
                className="mono spinta min-h-10 border border-[var(--bordo)] px-2 text-[10.5px] tracking-[0.08em] uppercase transition-colors hover:border-[var(--allarme)] hover:text-[var(--allarme)]"
              >
                Escludi IP
              </button>

              {rete24 && (
                <button
                  type="button"
                  onClick={() => onBandisci("SOTTORETE", rete24)}
                  disabled={operatore?.genere === "cdn"}
                  title={
                    operatore?.genere === "cdn"
                      ? `Disattivato: ${rete24} appartiene a ${operatore.nome}, non a chi ha bussato.`
                      : `Escludi la rete ${rete24}`
                  }
                  className="mono spinta min-h-10 border border-[var(--bordo)] px-2 text-[10.5px] tracking-[0.08em] uppercase transition-colors hover:border-[var(--allarme)] hover:text-[var(--allarme)] disabled:pointer-events-none disabled:opacity-30"
                >
                  Escludi /{rete24.split("/")[1]}
                </button>
              )}
            </div>

            {operatore && (
              <p
                className={`mono mt-2 text-[10.5px] leading-[1.5] ${
                  operatore.genere === "cdn"
                    ? "text-[var(--info)]"
                    : operatore.genere === "vpn"
                      ? "text-[var(--allarme)]"
                      : "text-[var(--testo-debole)]"
                }`}
              >
                {operatore.genere === "cdn" &&
                  `Rete di ${operatore.nome}: bandirla non serve, tornerà da un altro suo indirizzo.`}
                {operatore.genere === "vpn" &&
                  `Uscita di ${operatore.nome}: dietro ci sono molte persone e ne cambia una a piacere.`}
                {operatore.genere === "cloud" &&
                  `Macchina a noleggio su ${operatore.nome}: qui il bando della rete morde.`}
              </p>
            )}
          </article>
        );
      })}

      <div className="border-t border-[var(--bordo)] pt-3">
        <Etichetta className="block">Come leggere i marcatori di rete</Etichetta>
        <dl className="mono mt-2 flex flex-col gap-1.5 text-[10.5px] leading-[1.5]">
          <div className="flex gap-2">
            <dt className="shrink-0 text-[var(--info)]">CDN</dt>
            <dd className="text-[var(--testo-debole)]">
              il traffico passa di lì, non nasce lì. Bandire la rete colpisce
              il servizio in mezzo, e chi ha bussato ricompare da un altro suo
              indirizzo entro poche ore: il pulsante è disattivato apposta.
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-[var(--accento)]">cloud</dt>
            <dd className="text-[var(--testo-debole)]">
              macchina a noleggio. Chi la usa la tiene, quindi il bando della
              sottorete ha effetto reale.
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-[var(--allarme)]">VPN</dt>
            <dd className="text-[var(--testo-debole)]">
              uscita di un servizio commerciale: sta in mezzo come un CDN, ma
              dietro c&apos;è una persona che ha scelto di nascondersi.
            </dd>
          </div>
        </dl>
        <p className="mono mt-3 text-[10px] leading-[1.6] text-[var(--testo-debole)]">
          Il riconoscimento usa una tabella di intervalli noti tenuta nel
          codice: copre gli operatori da cui arriva davvero il traffico
          automatico, non tutta internet. Un indirizzo senza marcatore non è
          «una persona a casa sua», è solo «non in tabella».
        </p>
      </div>
    </div>
  );
}
