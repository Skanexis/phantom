"use client";

import { Etichetta } from "@/components/ui";
import { Icone } from "@/components/icone";
import type { OperatoreRete } from "@/lib/reti-note";
import { compatta } from "@/lib/cifre";

/**
 * CrowdSec: cosa sta bloccando adesso, e cosa ha bloccato prima.
 *
 * La sezione esiste per una conseguenza scomoda della scelta di bloccare nel
 * firewall: il pacchetto muore nel kernel, quindi non compare né nei log di
 * Nginx né nella console né nell'archivio. Senza questa schermata i
 * provvedimenti di CrowdSec sarebbero visibili solo da riga di comando, e
 * nessuno guarda una riga di comando finché non sospetta già qualcosa.
 *
 * Le due tabelle rispondono a due domande diverse, e mescolarle le
 * annullerebbe entrambe: «chi è bloccato adesso» si legge scorrendo,
 * «questo indirizzo era già stato bloccato?» si legge cercando. Lo storico
 * è nostro (vedi il modello DecisioneCrowdSec): CrowdSec le decisioni
 * scadute le dimentica.
 */

export type DecisioneAttiva = {
  valore: string;
  tipo: string;
  scenario: string;
  origine: string;
  durata: string;
};

export type DecisioneStorica = {
  id: number;
  valore: string;
  scenario: string;
  durata: string;
  vistoIl: number;
  scadutaIl: number | null;
};

export type StatoCrowdSec = {
  attivo: boolean;
  collegato: boolean;
  ultimoErrore: string | null;
  ultimaLettura: number;
  totale: number;
  locali: number;
  decisioni: DecisioneAttiva[];
  storico: DecisioneStorica[];
};

function eLocale(origine: string) {
  return origine !== "CAPI" && origine !== "lists";
}

function quando(istante: number) {
  return new Date(istante).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SezioneCrowdSec({
  stato,
  operatori,
}: {
  stato: StatoCrowdSec;
  operatori: Record<string, OperatoreRete>;
}) {
  if (!stato.attivo) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
        CrowdSec non è collegato a questo pannello. Il sito funziona
        identico — è uno strumento in più, non una dipendenza — ma i suoi
        provvedimenti restano visibili solo con{" "}
        <span className="text-[var(--testo)]">cscli decisions list</span>.
        Per collegarlo serve <span className="text-[var(--testo)]">
          CROWDSEC_API_KEY
        </span>{" "}
        nel .env: la stampa <span className="text-[var(--testo)]">
          deploy/crowdsec.sh
        </span>.
      </p>
    );
  }

  if (!stato.collegato) {
    return (
      <div className="border border-[var(--allarme)] p-4">
        <div className="flex items-center gap-2.5">
          <Icone.allarme className="h-4 w-4 shrink-0 text-[var(--allarme)]" />
          <Etichetta>Agente non raggiungibile</Etichetta>
        </div>
        <p className="mono mt-3 text-[11.5px] leading-[1.7] text-[var(--allarme)]">
          {stato.ultimoErrore ?? "motivo ignoto"}
        </p>
        <p className="mono mt-2 text-[10.5px] leading-[1.7] text-[var(--testo-debole)]">
          Finché resta così nessuno filtra a monte, ma il sito funziona
          normalmente. Da controllare:{" "}
          <span className="text-[var(--testo-tenue)]">
            systemctl status crowdsec
          </span>
        </p>
      </div>
    );
  }

  const condivise = stato.totale - stato.locali;
  const attive = stato.storico.filter((voce) => voce.scadutaIl === null).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Le tre cifre che dicono subito la situazione.
          Due colonne su telefono e non tre: a 360 pixel una terza colonna
          lascia novanta pixel per un numero e la sua etichetta, e non basta
          a nessuno dei due. La prima piastrella — quella che conta — prende
          la riga intera. */}
      <div className="grid grid-cols-2 gap-px bg-[var(--bordo)] sm:grid-cols-3">
        {[
          {
            valore: stato.locali,
            etichetta: "Decise qui",
            nota: "attacchi a questo sito",
            acceso: stato.locali > 0,
            larga: true,
          },
          {
            valore: condivise,
            etichetta: "Da elenco condiviso",
            nota: "segnalate da altri",
          },
          {
            valore: stato.storico.length,
            etichetta: "Nello storico",
            nota: "comprese le scadute",
          },
        ].map((voce) => (
          <div
            key={voce.etichetta}
            title={`${voce.etichetta}: ${voce.valore.toLocaleString("it-IT")}`}
            className={`flex min-w-0 flex-col justify-between bg-[var(--sfondo)] p-3 ${
              voce.larga ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <span
              className={`display block text-[clamp(1.25rem,6vw,1.75rem)] leading-none break-all ${
                voce.acceso ? "text-[var(--allarme)]" : ""
              }`}
            >
              {compatta(voce.valore)}
            </span>
            <span className="mt-2 flex items-baseline gap-1.5">
              {voce.acceso && (
                <span
                  aria-hidden="true"
                  className="mt-[3px] h-1.5 w-1.5 shrink-0 bg-[var(--allarme)]"
                />
              )}
              <Etichetta className="block min-w-0">{voce.etichetta}</Etichetta>
            </span>
            <span className="mono mt-1 block text-[10px] leading-[1.5] text-[var(--testo-debole)]">
              {voce.nota}
            </span>
          </div>
        ))}
      </div>

      {/* --------------------------- In vigore --------------------------- */}
      <section className="border border-[var(--bordo)]">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[var(--bordo)] px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icone.divieto className="h-4 w-4 shrink-0 text-[var(--allarme)]" />
            <Etichetta>Bloccati adesso</Etichetta>
          </div>
          <span className="mono min-w-0 text-[10.5px] break-words text-[var(--testo-debole)]">
            il pacchetto muore nel kernel: non arriva né a Nginx né qui
          </span>
        </header>

        <div className="p-3 sm:p-4">
          {stato.decisioni.length === 0 ? (
            <p className="mono text-[12px] text-[var(--testo-tenue)]">
              Nessuna decisione in vigore.
            </p>
          ) : (
            <div className="divide-y divide-[var(--bordo)]">
              {stato.decisioni.map((voce) => {
                const locale = eLocale(voce.origine);
                const operatore = operatori[voce.valore];
                return (
                  <div
                    key={`${voce.valore}-${voce.scenario}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="mono flex min-w-0 flex-wrap items-center gap-2 text-[12px]">
                      <span
                        title={
                          locale
                            ? "Deciso qui, sul traffico di questo sito"
                            : "Segnalato da altri: elenco condiviso"
                        }
                        className={`shrink-0 border px-1 text-[9px] tracking-[0.06em] uppercase ${
                          locale
                            ? "border-[var(--allarme)] text-[var(--allarme)]"
                            : "border-[var(--bordo)] text-[var(--testo-debole)]"
                        }`}
                      >
                        {locale ? "qui" : "rete"}
                      </span>
                      <span className="break-all">{voce.valore}</span>
                      {operatore && (
                        <span className="mono shrink-0 text-[9.5px] text-[var(--testo-debole)] uppercase">
                          {operatore.nome}
                        </span>
                      )}
                    </span>
                    <span className="mono text-[10.5px] break-words text-[var(--testo-tenue)]">
                      {voce.scenario} · {voce.durata}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------- Storico ---------------------------- */}
      <section className="border border-[var(--bordo)]">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[var(--bordo)] px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icone.registro className="h-4 w-4 shrink-0 text-[var(--accento)]" />
            <Etichetta>Storico delle decisioni prese qui</Etichetta>
          </div>
          <span className="mono min-w-0 text-[10.5px] text-[var(--testo-debole)]">
            {attive} ancora in vigore
          </span>
        </header>

        <div className="p-3 sm:p-4">
          {stato.storico.length === 0 ? (
            <p className="mono text-[12px] leading-[1.7] text-[var(--testo-tenue)]">
              Nessuna decisione registrata. Qui restano solo quelle prese sul
              traffico di questo sito: l&apos;elenco condiviso conta decine di
              migliaia di indirizzi e non direbbe niente su di noi.
            </p>
          ) : (
            <div className="divide-y divide-[var(--bordo)]">
              {stato.storico.map((voce) => {
                const operatore = operatori[voce.valore];
                return (
                  <div
                    key={voce.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="mono flex min-w-0 flex-wrap items-center gap-2 text-[12px]">
                      <span
                        className={`shrink-0 border px-1 text-[9px] tracking-[0.06em] uppercase ${
                          voce.scadutaIl === null
                            ? "border-[var(--allarme)] text-[var(--allarme)]"
                            : "border-[var(--bordo)] text-[var(--testo-debole)]"
                        }`}
                      >
                        {voce.scadutaIl === null ? "attiva" : "scaduta"}
                      </span>
                      <span className="break-all">{voce.valore}</span>
                      {operatore && (
                        <span className="mono shrink-0 text-[9.5px] text-[var(--testo-debole)] uppercase">
                          {operatore.nome}
                        </span>
                      )}
                    </span>
                    <span className="mono text-[10.5px] break-words text-[var(--testo-tenue)]">
                      {voce.scenario} · vista {quando(voce.vistoIl)}
                      {voce.scadutaIl !== null &&
                        ` · finita ${quando(voce.scadutaIl)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <p className="mono text-[10px] leading-[1.7] text-[var(--testo-debole)]">
        Solo le decisioni marcate «qui» generano un avviso su Telegram: quelle
        dell&apos;elenco condiviso arrivano a decine di migliaia e renderebbero
        il canale illeggibile. Elenco completo e comandi:{" "}
        <span className="text-[var(--testo-tenue)]">cscli decisions list</span>,{" "}
        <span className="text-[var(--testo-tenue)]">cscli alerts list</span>.
      </p>
    </div>
  );
}
