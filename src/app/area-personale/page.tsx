import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { utenteCorrente } from "@/lib/sessione";
import { formattaPrezzo } from "@/lib/contenuti";
import { etichetteAmbito, etichetteStato } from "@/lib/telegram-bot";
import {
  STATI_VISIBILI_CLIENTE,
  attendeIlCliente,
  inLavorazione,
  quandoAggiornata,
} from "@/lib/richieste";
import {
  STATI_VISIBILI,
  dataBreve,
  giorniAllaScadenza,
  inScadenza,
  statoEffettivo,
} from "@/lib/abbonamenti";
import { Navigazione } from "@/components/navigazione";
import { PiedePagina } from "@/components/piede-pagina";
import { BadgeStato } from "@/components/badge-stato";
import { PannelloNotifiche } from "@/components/pannello-notifiche";
import { Rivela, Scaglionato, Voce } from "@/components/animazioni";
import { AccessoTelegram } from "@/components/accesso-telegram";
import { GestioneAbbonamento } from "@/components/gestione-abbonamento";
import { ConversazioneCliente } from "@/components/conversazione-cliente";
import { Avatar } from "@/components/avatar";
import { TrascinaAggiorna } from "@/components/trascina-aggiorna";
import { Schede } from "@/components/schede-admin";
import { Divulgatore } from "@/components/divulgatore";
import {
  BollinoNovita,
  CodiceCopiabile,
  NumeroAnimato,
  PercorsoStato,
} from "@/components/dettagli";
import { recente, saluto } from "@/lib/tempo";
import { Etichetta } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Area personale — Phantom Lab",
};

export default async function AreaPersonale() {
  const utente = await utenteCorrente();

  if (!utente) {
    return (
      <div className="flex min-h-full flex-col">
        <Navigazione />
        <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-16 sm:px-8 sm:py-24">
          <div className="w-full max-w-lg">
            <AccessoTelegram
              titolo="Accedi al tuo account"
              descrizione="Collega il tuo profilo Telegram per vedere abbonamenti, richieste e notifiche. Funziona anche se hai aperto il sito da un link normale."
            />
            <Link
              href="/"
              className="mono mt-6 inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
            >
              ← Torna alla home
            </Link>
          </div>
        </main>
        <PiedePagina />
      </div>
    );
  }

  const [richieste, sottoscrizioni, notifiche, pianiDisponibili] =
    await Promise.all([
      prisma.richiesta.findMany({
        // Le annullate non compaiono qui: al cliente resta la notifica che
        // ne spiega il motivo, mentre nel pannello admin la pratica rimane.
        where: {
          utenteId: utente.id,
          stato: { in: STATI_VISIBILI_CLIENTE },
        },
        // Per data di aggiornamento: una pratica che si è mossa ieri conta
        // più di una aperta prima ma ferma da mesi.
        orderBy: { aggiornatoIl: "desc" },
        include: {
          storico: { orderBy: { creatoIl: "asc" } },
          // Solo il conteggio dei messaggi non letti: il contenuto si
          // carica all'apertura della conversazione.
          _count: {
            select: { messaggi: { where: { daAdmin: true, letto: false } } },
          },
        },
      }),
      prisma.abbonamentoUtente.findMany({
        where: { utenteId: utente.id, stato: { in: STATI_VISIBILI } },
        include: { abbonamento: true },
        orderBy: { creatoIl: "desc" },
      }),
      prisma.notifica.findMany({
        where: { utenteId: utente.id },
        orderBy: { creatoIl: "desc" },
        take: 12,
      }),
      prisma.abbonamento.findMany({
        where: { attivo: true },
        orderBy: { ordine: "asc" },
      }),
    ]);

  const completate = richieste.filter((r) => r.stato === "COMPLETATA").length;
  const inCorso = richieste.filter((r) => inLavorazione(r.stato)).length;
  // Quante aspettano una risposta del cliente: è l'unica cosa che dipende
  // da lui, e va detta prima di tutto il resto.
  const daRispondere = richieste.filter((r) =>
    attendeIlCliente(r.stato),
  ).length;
  const nonLette = notifiche.filter((n) => !n.letta).length;

  // Il piano che conta è quello attivo: guida sia il riepilogo in alto sia
  // le alternative proposte per il cambio.
  const attiva = sottoscrizioni.find((s) => statoEffettivo(s) === "ATTIVO");

  // Aperte restano sempre in vista, chiuse si ripiegano: chi ha una lunga
  // storia di progetti non deve scorrerla tutta per trovare quella viva.
  const richiesteAperte = richieste.filter((r) => inLavorazione(r.stato));
  const richiesteChiuse = richieste.filter((r) => !inLavorazione(r.stato));

  const abbonamentoDaAttenzione = sottoscrizioni.some((s) =>
    ["SOSPESO", "SCADUTO"].includes(statoEffettivo(s)),
  );

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      {/* Il gesto di trascinamento vale per l'intera pagina: è quello che
          si tenta d'istinto per aggiornare un elenco sul telefono. */}
      <TrascinaAggiorna />

      <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-8 sm:py-16">
        <Rivela>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar nome={utente.nome} urlFoto={utente.urlFoto} dimensione={52} />
              <div className="min-w-0">
                <p className="mono text-[11px] text-[var(--testo-debole)]">
                  {saluto()}
                </p>
                <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px]">
                  {utente.nome ?? "Utente"}
                </h1>
              </div>
            </div>
            {utente.ruolo === "ADMIN" && (
              <Link
                href="/admin"
                className="mono spinta flex min-h-11 shrink-0 items-center border border-[var(--accento)] px-4 text-[11px] uppercase tracking-[0.12em] text-[var(--accento)]"
              >
                Pannello admin →
              </Link>
            )}
          </div>

          {/* Striscia di stato: una sola riga con il fatto più rilevante,
              invece di lasciarlo scoperto in mezzo a testo dello stesso peso. */}
          <div
            className={`superficie mt-5 flex items-center gap-3 px-4 py-3.5 sm:px-5 ${
              daRispondere > 0 ? "superficie--evidenza" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 ${
                daRispondere > 0
                  ? "bg-[var(--accento)]"
                  : attiva
                    ? "bg-[var(--ok)]"
                    : "bg-[var(--testo-debole)]"
              }`}
            />
            <p className="mono text-[12.5px] leading-[1.6]">
              {daRispondere > 0
                ? daRispondere === 1
                  ? "1 richiesta aspetta una tua risposta"
                  : `${daRispondere} richieste aspettano una tua risposta`
                : attiva
                  ? `Piano ${attiva.abbonamento.nome} attivo`
                  : "Nessun piano attivo"}
            </p>
          </div>
        </Rivela>

        <Schede
          schede={[
            { id: "panoramica", etichetta: "Panoramica" },
            {
              id: "abbonamento",
              etichetta: "Abbonamento",
              contatore: abbonamentoDaAttenzione ? 1 : 0,
            },
            { id: "richieste", etichetta: "Richieste", contatore: daRispondere },
            { id: "notifiche", etichetta: "Notifiche", contatore: nonLette },
          ]}
        >
          {{
            panoramica: (
              <div>
                <Scaglionato className="grid grid-cols-3 gap-2.5 sm:gap-4">
                  {[
                    { valore: richieste.length, etichetta: "Richieste" },
                    { valore: inCorso, etichetta: "In corso" },
                    { valore: completate, etichetta: "Completate" },
                  ].map((dato) => (
                    <Voce key={dato.etichetta}>
                      <div className="superficie p-3.5 sm:p-5">
                        <NumeroAnimato
                          valore={dato.valore}
                          className="display block text-[24px] sm:text-[36px]"
                        />
                        <Etichetta className="mt-1 block">
                          {dato.etichetta}
                        </Etichetta>
                      </div>
                    </Voce>
                  ))}
                </Scaglionato>

                <div className="mt-8">
                  <Etichetta className="block pb-3">Il tuo piano</Etichetta>
                  {attiva ? (
                    <div className="superficie flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold tracking-[-0.01em]">
                          {attiva.abbonamento.nome}
                        </p>
                        <p className="mono mt-1 text-[12px] text-[var(--testo-tenue)]">
                          {formattaPrezzo(
                            attiva.abbonamento.prezzoCentesimi,
                            attiva.abbonamento.valuta,
                          )}{" "}
                          /{attiva.abbonamento.periodo}
                          {attiva.scadeIl &&
                            ` · rinnovo il ${dataBreve(attiva.scadeIl)}`}
                        </p>
                      </div>
                      <BadgeStato stato="ATTIVO" tipo="abbonamento" />
                    </div>
                  ) : (
                    <div className="superficie flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                      <p className="mono text-[12.5px] text-[var(--testo-tenue)]">
                        Nessun abbonamento attivo.
                      </p>
                      <Link
                        href="/#abbonamenti"
                        className="mono spinta flex min-h-11 shrink-0 items-center justify-center border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)]"
                      >
                        Scopri i piani
                      </Link>
                    </div>
                  )}
                </div>

                {notifiche.length > 0 && (
                  <div className="mt-8">
                    <Etichetta className="block pb-3">
                      Ultime notifiche
                    </Etichetta>
                    <div className="superficie divide-y divide-[var(--bordo)]">
                      {notifiche.slice(0, 3).map((notifica) => (
                        <div
                          key={notifica.id}
                          className="flex items-start gap-3 p-4 sm:p-5"
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                              notifica.letta
                                ? "bg-[var(--bordo-forte)]"
                                : "bg-[var(--accento)]"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold tracking-[-0.01em]">
                              {notifica.titolo}
                            </p>
                            <p className="mono mt-1 text-[12px] leading-[1.6] text-[var(--testo-tenue)]">
                              {notifica.testo}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ),

            abbonamento:
              sottoscrizioni.length === 0 ? (
                <div className="superficie flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
                  <p className="mono text-[12.5px] text-[var(--testo-tenue)]">
                    Nessun abbonamento attivo.
                  </p>
                  <Link
                    href="/#abbonamenti"
                    className="mono spinta flex min-h-12 w-full shrink-0 items-center justify-center border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)] sm:w-auto"
                  >
                    Scopri i piani
                  </Link>
                </div>
              ) : (
                <Scaglionato className="flex flex-col gap-4">
                  {sottoscrizioni.map((sottoscrizione) => {
                    const stato = statoEffettivo(sottoscrizione);
                    const giorni = giorniAllaScadenza(sottoscrizione.scadeIl);
                    const avviso = inScadenza(sottoscrizione);

                    return (
                      <Voce key={sottoscrizione.id}>
                        <div
                          className={`superficie p-5 sm:p-6 ${
                            stato === "SOSPESO" || stato === "SCADUTO"
                              ? "superficie--allarme"
                              : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              {sottoscrizione.codice && (
                                <span className="mono block text-[11px] font-bold tracking-[0.08em] text-[var(--accento)]">
                                  {sottoscrizione.codice}
                                </span>
                              )}
                              <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.01em] break-words sm:text-[20px]">
                                {sottoscrizione.abbonamento.nome}
                              </h3>
                              <p className="mono mt-1.5 text-[12px] text-[var(--testo-tenue)]">
                                {formattaPrezzo(
                                  sottoscrizione.abbonamento.prezzoCentesimi,
                                  sottoscrizione.abbonamento.valuta,
                                )}{" "}
                                /{sottoscrizione.abbonamento.periodo}
                              </p>
                            </div>
                            <BadgeStato stato={stato} tipo="abbonamento" />
                          </div>

                          {/* Lo stato da solo non dice quanto manca: la data e i
                              giorni residui sono l'informazione che l'utente cerca. */}
                          {stato === "ATTIVO" && sottoscrizione.scadeIl && (
                            <p
                              className={`mono mt-3 text-[12px] ${
                                avviso
                                  ? "text-[var(--accento)]"
                                  : "text-[var(--testo-tenue)]"
                              }`}
                            >
                              {giorni !== null && giorni <= 0
                                ? "Rinnovo oggi"
                                : `Rinnovo il ${dataBreve(sottoscrizione.scadeIl)}${
                                    giorni !== null ? ` · fra ${giorni} giorni` : ""
                                  }`}
                            </p>
                          )}

                          {stato === "IN_ATTESA" && (
                            <p className="mono mt-3 text-[12px] text-[var(--testo-tenue)]">
                              In attesa della nostra conferma. Ti avvisiamo su
                              Telegram appena è attivo.
                            </p>
                          )}

                          {stato === "SCADUTO" && (
                            <p className="mono mt-3 text-[12px] text-[var(--allarme)]">
                              Scaduto il {dataBreve(sottoscrizione.scadeIl)}.
                              Scrivici per rinnovarlo.
                            </p>
                          )}

                          {stato === "SOSPESO" && (
                            <p className="mono mt-3 text-[12px] text-[var(--allarme)]">
                              Piano sospeso. Contattaci per riattivarlo.
                            </p>
                          )}

                          {stato === "ATTIVO" && (
                            <GestioneAbbonamento
                              sottoscrizioneId={sottoscrizione.id}
                              pianiAlternativi={pianiDisponibili
                                .filter(
                                  (piano) =>
                                    piano.id !== sottoscrizione.abbonamentoId,
                                )
                                .map((piano) => ({
                                  slug: piano.slug,
                                  nome: piano.nome,
                                  prezzo: formattaPrezzo(
                                    piano.prezzoCentesimi,
                                    piano.valuta,
                                  ),
                                  periodo: piano.periodo,
                                }))}
                            />
                          )}
                        </div>
                      </Voce>
                    );
                  })}
                </Scaglionato>
              ),

            richieste:
              richieste.length === 0 ? (
                /* Non un vicolo cieco: chi arriva qui la prima volta trova
                   cosa scrivere e cosa aspettarsi, non solo un pulsante. */
                <div className="superficie p-5 sm:p-6">
                  {/* Neutro di proposito: chi ha avuto solo richieste annullate
                      non ne vede nessuna qui, e "mai inviata" sarebbe falso. */}
                  <p className="mono text-[12.5px] text-[var(--testo-tenue)]">
                    Nessuna richiesta da seguire al momento.
                  </p>

                  <ul className="mt-5 flex flex-col gap-2.5">
                    {[
                      "Descrivi l'obiettivo in un paragrafo: a cosa deve servire.",
                      "Indica tempi e budget, anche approssimativi.",
                      "Ti rispondiamo su Telegram, di solito in giornata.",
                    ].map((suggerimento, indice) => (
                      <li
                        key={suggerimento}
                        className="mono flex gap-3 text-[12px] leading-[1.65] text-[var(--testo-tenue)]"
                      >
                        <span className="shrink-0 text-[var(--accento)]">
                          {String(indice + 1).padStart(2, "0")}
                        </span>
                        {suggerimento}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/richiesta"
                    className="mono spinta mt-6 flex min-h-12 w-full items-center justify-center border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)] sm:w-auto sm:self-start"
                  >
                    Invia la prima richiesta
                  </Link>
                </div>
              ) : (
                <div>
                  <Scaglionato className="flex flex-col gap-4">
                    {richiesteAperte.map((richiesta) => (
                      <Voce key={richiesta.id}>
                        <CartaRichiesta richiesta={richiesta} />
                      </Voce>
                    ))}
                  </Scaglionato>

                  {richiesteAperte.length === 0 && richiesteChiuse.length > 0 && (
                    <p className="mono py-6 text-[12.5px] text-[var(--testo-tenue)]">
                      Nessuna richiesta in corso al momento.
                    </p>
                  )}

                  <Divulgatore
                    titolo="Completate"
                    contatore={richiesteChiuse.length}
                    apertoIniziale={richiesteAperte.length === 0}
                  >
                    <div className="flex flex-col gap-4 pt-4 pb-2">
                      {richiesteChiuse.map((richiesta) => (
                        <CartaRichiesta key={richiesta.id} richiesta={richiesta} />
                      ))}
                    </div>
                  </Divulgatore>
                </div>
              ),

            notifiche: (
              <PannelloNotifiche
                dentroScheda
                iniziali={notifiche.map((n) => ({
                  id: n.id,
                  titolo: n.titolo,
                  testo: n.testo,
                  letta: n.letta,
                  creatoIl: n.creatoIl.toISOString(),
                }))}
              />
            ),
          }}
        </Schede>
      </main>

      <PiedePagina />
    </div>
  );
}

type RichiestaConStorico = Prisma.RichiestaGetPayload<{
  include: {
    storico: true;
    _count: { select: { messaggi: true } };
  };
}>;

/** Scheda di una singola richiesta: usata sia fra le aperte sia fra quelle
 * ripiegate sotto "Completate". */
function CartaRichiesta({ richiesta }: { richiesta: RichiestaConStorico }) {
  const attiva = inLavorazione(richiesta.stato);
  const tocca = attendeIlCliente(richiesta.stato);

  return (
    <article
      className={`superficie p-5 sm:p-6 ${
        attiva ? "superficie--attiva" : "opacity-75"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          {/* Il codice è il riferimento che il cliente cita scrivendoci:
              un tocco lo copia negli appunti. */}
          {richiesta.codice ? (
            <CodiceCopiabile
              codice={richiesta.codice}
              className={`text-[12px] font-bold tracking-[0.08em] ${
                attiva ? "text-[var(--accento)]" : "text-[var(--testo-debole)]"
              }`}
            />
          ) : (
            <span className="mono text-[12px] text-[var(--testo-debole)]">
              —
            </span>
          )}
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] sm:text-[18px]">
            {etichetteAmbito[richiesta.ambito]}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {recente(richiesta.aggiornatoIl) && <BollinoNovita />}
          <BadgeStato stato={richiesta.stato} />
        </div>
      </div>

      {/* "3 mesi fa" dice quello che una data non dice: nel solo elenco
          cronologico una pratica di ieri e una ferma da mesi si somigliano. */}
      <p className="mono mt-2 text-[11px] text-[var(--testo-debole)]">
        Aggiornata {quandoAggiornata(richiesta.aggiornatoIl)}
      </p>

      {/* Il badge dice dove sei, non quanto manca: il percorso mostra il
          processo intero e la posizione dentro. */}
      <PercorsoStato
        tappe={["Ricevuta", "In lavorazione", "Completata"]}
        corrente={
          richiesta.stato === "COMPLETATA"
            ? 2
            : richiesta.stato === "NUOVA"
              ? 0
              : 1
        }
      />

      {tocca && (
        <p className="mono mt-3 border border-[var(--accento)] px-3.5 py-2.5 text-[11.5px] leading-[1.6] text-[var(--accento)]">
          Aspettiamo una tua risposta per procedere.
        </p>
      )}

      <p className="mono mt-3 whitespace-pre-line text-[13px] leading-[1.75] break-words text-[var(--testo-tenue)] sm:text-[12.5px]">
        {richiesta.messaggio}
      </p>

      {richiesta.storico.length > 0 && (
        <ol className="mt-5 border-t border-[var(--bordo)]">
          {richiesta.storico.map((voce, posizione) => (
            // In colonna su mobile: stato, nota e data affiancati su
            // schermo stretto si spezzano a metà parola.
            <li
              key={voce.id}
              className="flex flex-col gap-1 border-b border-dashed border-[var(--bordo)] py-2.5 sm:flex-row sm:items-baseline sm:gap-3"
            >
              <span className="flex items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 ${
                    posizione === richiesta.storico.length - 1
                      ? "bg-[var(--accento)]"
                      : "bg-[var(--bordo-forte)]"
                  }`}
                />
                <span className="mono text-[11.5px] uppercase tracking-[0.08em]">
                  {etichetteStato[voce.stato]}
                </span>
              </span>
              {voce.nota && (
                <span className="mono flex-1 pl-4 text-[11.5px] leading-[1.6] text-[var(--testo-tenue)] sm:pl-0">
                  {voce.nota}
                </span>
              )}
              <span className="mono pl-4 text-[10.5px] text-[var(--testo-debole)] sm:ml-auto sm:shrink-0 sm:pl-0">
                {voce.creatoIl.toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ol>
      )}

      <ConversazioneCliente
        richiestaId={richiesta.id}
        codice={richiesta.codice}
        nonLetti={richiesta._count.messaggi}
      />
    </article>
  );
}
