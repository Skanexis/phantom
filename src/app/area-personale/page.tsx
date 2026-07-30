import Link from "next/link";
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

  // Il piano che conta è quello attivo: guida sia il riepilogo in alto sia
  // le alternative proposte per il cambio.
  const attiva = sottoscrizioni.find((s) => statoEffettivo(s) === "ATTIVO");

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-8 sm:py-16">
        <Rivela>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--bordo)] pb-6">
            <div className="min-w-0">
              <Etichetta>Account · {utente.telegramId}</Etichetta>
              <h1 className="display mt-4 text-[clamp(1.9rem,7vw,4rem)] break-words">
                {utente.nome ?? "Utente"}
              </h1>
              <p className="mono mt-3 text-[12px] text-[var(--testo-tenue)]">
                {attiva
                  ? `Piano ${attiva.abbonamento.nome} attivo`
                  : "Nessun piano attivo"}
              </p>
              {daRispondere > 0 && (
                <p className="mono mt-2 text-[12px] text-[var(--accento)]">
                  {daRispondere === 1
                    ? "1 richiesta aspetta una tua risposta"
                    : `${daRispondere} richieste aspettano una tua risposta`}
                </p>
              )}
            </div>
            {utente.ruolo === "ADMIN" && (
              <Link
                href="/admin"
                className="mono spinta flex min-h-11 items-center border border-[var(--accento)] px-4 text-[11px] uppercase tracking-[0.12em] text-[var(--accento)]"
              >
                Pannello admin →
              </Link>
            )}
          </div>
        </Rivela>

        {/* Riepilogo numerico */}
        <Scaglionato className="grid grid-cols-3 border-b border-l border-[var(--bordo)]">
          {[
            { valore: richieste.length, etichetta: "Richieste" },
            { valore: inCorso, etichetta: "In corso" },
            { valore: completate, etichetta: "Completate" },
          ].map((dato) => (
            <Voce key={dato.etichetta}>
              <div className="border-r border-[var(--bordo)] p-4 sm:p-6">
                <span className="display block text-[30px] sm:text-[44px]">
                  {String(dato.valore).padStart(2, "0")}
                </span>
                <Etichetta className="mt-1 block">{dato.etichetta}</Etichetta>
              </div>
            </Voce>
          ))}
        </Scaglionato>

        {/* Abbonamenti */}
        <section className="mt-12 sm:mt-14">
          <Etichetta className="block border-b border-[var(--bordo)] pb-3">
            Il tuo abbonamento
          </Etichetta>

          {sottoscrizioni.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 border-b border-[var(--bordo)] py-8 sm:flex-row sm:items-center">
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
            <Scaglionato>
              {sottoscrizioni.map((sottoscrizione) => {
                const stato = statoEffettivo(sottoscrizione);
                const giorni = giorniAllaScadenza(sottoscrizione.scadeIl);
                const avviso = inScadenza(sottoscrizione);

                return (
                  <Voce key={sottoscrizione.id}>
                    <div className="border-b border-[var(--bordo)] py-6">
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
          )}
        </section>

        {/* Richieste */}
        <section className="mt-12 sm:mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--bordo)] pb-3">
            <Etichetta>Richieste</Etichetta>
            {richieste.length > 0 && (
              <span className="mono text-[11px] text-[var(--testo-debole)]">
                {inCorso} in corso · {completate}{" "}
                {completate === 1 ? "completata" : "completate"}
              </span>
            )}
          </div>

          {richieste.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 border-b border-[var(--bordo)] py-8 sm:flex-row sm:items-center">
              {/* Neutro di proposito: chi ha avuto solo richieste annullate
                  non ne vede nessuna qui, e "mai inviata" sarebbe falso. */}
              <p className="mono text-[12.5px] text-[var(--testo-tenue)]">
                Nessuna richiesta da seguire al momento.
              </p>
              <Link
                href="/richiesta"
                className="mono spinta flex min-h-12 w-full shrink-0 items-center justify-center border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)] sm:w-auto"
              >
                Invia richiesta
              </Link>
            </div>
          ) : (
            <Scaglionato>
              {richieste.map((richiesta) => {
                const attiva = inLavorazione(richiesta.stato);
                const tocca = attendeIlCliente(richiesta.stato);

                return (
                  <Voce key={richiesta.id}>
                    {/* Le pratiche chiuse restano leggibili ma arretrano: barra
                      d'accento e sfondo solo su quelle ancora in corso, così
                      lo stato si coglie prima di leggere il badge. */}
                    <article
                      className={`border-b border-[var(--bordo)] py-6 sm:py-7 ${
                        attiva
                          ? "border-l-2 border-l-[var(--accento)] bg-[var(--sfondo-alt)] pl-4 sm:pl-5"
                          : "pl-4 opacity-70 sm:pl-5"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-baseline gap-4">
                          {/* Il codice è il riferimento che il cliente cita
                            scrivendoci, e che compare nei messaggi del bot. */}
                          <span
                            className={`mono text-[12px] font-bold tracking-[0.08em] ${
                              attiva
                                ? "text-[var(--accento)]"
                                : "text-[var(--testo-debole)]"
                            }`}
                          >
                            {richiesta.codice ?? "—"}
                          </span>
                          <h3 className="text-[17px] font-semibold tracking-[-0.01em] sm:text-[18px]">
                            {etichetteAmbito[richiesta.ambito]}
                          </h3>
                        </div>
                        <BadgeStato stato={richiesta.stato} />
                      </div>

                      {/* "3 mesi fa" dice quello che una data non dice: nel solo
                        elenco cronologico una pratica di ieri e una ferma da
                        mesi si somigliano. */}
                      <p className="mono mt-2 text-[11px] text-[var(--testo-debole)]">
                        Aggiornata {quandoAggiornata(richiesta.aggiornatoIl)}
                      </p>

                      {tocca && (
                        <p className="mono mt-3 border border-[var(--accento)] px-3.5 py-2.5 text-[11.5px] leading-[1.6] text-[var(--accento)]">
                          Aspettiamo una tua risposta per procedere.
                        </p>
                      )}

                      <p className="mono mt-3 whitespace-pre-line text-[13px] leading-[1.75] break-words text-[var(--testo-tenue)] sm:pl-[calc(1rem+3ch)] sm:text-[12.5px]">
                        {richiesta.messaggio}
                      </p>

                      {richiesta.storico.length > 0 && (
                        <ol className="mt-5 sm:pl-[calc(1rem+3ch)]">
                          {richiesta.storico.map((voce, posizione) => (
                            // In colonna su mobile: stato, nota e data affiancati
                            // su schermo stretto si spezzano a metà parola.
                            <li
                              key={voce.id}
                              className="flex flex-col gap-1 border-t border-dashed border-[var(--bordo)] py-2.5 sm:flex-row sm:items-baseline sm:gap-3 sm:py-2"
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
                  </Voce>
                );
              })}
            </Scaglionato>
          )}
        </section>

        <PannelloNotifiche
          iniziali={notifiche.map((n) => ({
            id: n.id,
            titolo: n.titolo,
            testo: n.testo,
            letta: n.letta,
            creatoIl: n.creatoIl.toISOString(),
          }))}
        />
      </main>

      <PiedePagina />
    </div>
  );
}
