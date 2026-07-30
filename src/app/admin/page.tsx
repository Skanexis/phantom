import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { richiediAdmin } from "@/lib/sessione";
import {
  etichetteAmbito,
  etichetteStato,
  etichetteStatoAbbonamento,
} from "@/lib/telegram-bot";
import { formattaPrezzo } from "@/lib/contenuti";
import { Navigazione } from "@/components/navigazione";
import { PiedePagina } from "@/components/piede-pagina";
import { BadgeStato } from "@/components/badge-stato";
import { SchedeAdmin } from "@/components/schede-admin";
import { Etichetta } from "@/components/ui";
import {
  AreaTesto,
  BottoneElimina,
  BottoneSalva,
  Campo,
  SelettoreIcona,
  Spunta,
  classiSelettore,
} from "@/components/campi-admin";
import {
  aggiornaAbbonamento,
  aggiornaContenuto,
  aggiornaStatoRichiesta,
  aggiornaStatoSottoscrizione,
  aggiungiFunzionalita,
  creaAbbonamento,
  eliminaAbbonamento,
  eliminaContatto,
  eliminaFaq,
  eliminaFunzionalita,
  eliminaRichiesta,
  eliminaServizio,
  eliminaVantaggio,
  salvaContatto,
  salvaFaq,
  salvaServizio,
  salvaVantaggio,
} from "./azioni";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pannello amministrativo — Phantom Lab",
};

const blocco = "border border-[var(--bordo)] p-5 sm:p-6";

export default async function PannelloAdmin() {
  const admin = await richiediAdmin();

  if (!admin) {
    return (
      <div className="flex min-h-full flex-col">
        <Navigazione />
        <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-24 sm:px-8">
          <div className="crocini relative max-w-md border border-[var(--bordo)] p-8 sm:p-10">
            <Etichetta className="text-[var(--allarme)]">
              Errore · 403 accesso negato
            </Etichetta>
            <h1 className="display mt-5 text-[32px]">Area riservata</h1>
            <p className="mono mt-4 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
              Questa sezione è accessibile solo agli amministratori.
            </p>
            <Link
              href="/"
              className="mono spinta mt-8 inline-block border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)]"
            >
              Torna alla home
            </Link>
          </div>
        </main>
        <PiedePagina />
      </div>
    );
  }

  const [
    abbonamenti,
    richieste,
    sottoscrizioni,
    contenuti,
    servizi,
    vantaggi,
    faq,
    contatti,
  ] = await Promise.all([
    prisma.abbonamento.findMany({
      orderBy: { ordine: "asc" },
      include: { funzionalita: { orderBy: { ordine: "asc" } } },
    }),
    prisma.richiesta.findMany({
      orderBy: { creatoIl: "desc" },
      include: { utente: true },
      take: 50,
    }),
    prisma.abbonamentoUtente.findMany({
      orderBy: { creatoIl: "desc" },
      include: { utente: true, abbonamento: true },
      take: 50,
    }),
    prisma.contenutoSito.findMany({ orderBy: { chiave: "asc" } }),
    prisma.servizio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.vantaggio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.faq.findMany({ orderBy: { ordine: "asc" } }),
    prisma.contatto.findMany({ orderBy: { ordine: "asc" } }),
  ]);

  const richiesteNuove = richieste.filter((r) => r.stato === "NUOVA").length;
  const attivazioniInAttesa = sottoscrizioni.filter(
    (s) => s.stato === "IN_ATTESA",
  ).length;

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--bordo)] pb-6">
          <div>
            <Etichetta className="text-[var(--accento)]">
              Console · Amministrazione
            </Etichetta>
            <h1 className="display mt-4 text-[clamp(2rem,7vw,4rem)]">
              Pannello
            </h1>
          </div>
          <Link
            href="/"
            className="mono spinta border border-[var(--bordo)] px-4 py-2.5 text-[11px] uppercase tracking-[0.12em]"
          >
            Vedi il sito →
          </Link>
        </div>

        {/* 2 colonne su mobile invece di 4 righe impilate: i numeri restano
            visibili tutti insieme senza occupare l'intera schermata. */}
        <div className="grid grid-cols-2 border-b border-l border-[var(--bordo)] sm:grid-cols-4">
          {[
            { valore: richieste.length, etichetta: "Richieste" },
            { valore: richiesteNuove, etichetta: "Da lavorare" },
            { valore: attivazioniInAttesa, etichetta: "Attivazioni" },
            {
              valore: abbonamenti.filter((a) => a.attivo).length,
              etichetta: "Piani attivi",
            },
          ].map((dato) => (
            <div
              key={dato.etichetta}
              className="border-r border-t border-[var(--bordo)] p-4 sm:border-t-0 sm:p-5"
            >
              <span className="display block text-[32px] sm:text-[36px]">
                {String(dato.valore).padStart(2, "0")}
              </span>
              <Etichetta className="mt-1 block">{dato.etichetta}</Etichetta>
            </div>
          ))}
        </div>

        <SchedeAdmin
          schede={[
            { id: "richieste", etichetta: "Richieste", contatore: richiesteNuove },
            { id: "abbonamenti", etichetta: "Abbonamenti" },
            {
              id: "sottoscrizioni",
              etichetta: "Sottoscrizioni",
              contatore: attivazioniInAttesa,
            },
            { id: "servizi", etichetta: "Servizi" },
            { id: "vantaggi", etichetta: "Vantaggi" },
            { id: "faq", etichetta: "FAQ" },
            { id: "contatti", etichetta: "Contatti" },
            { id: "testi", etichetta: "Testi" },
          ]}
        >
          {{
            /* ------------------------------ Richieste ----------------------------- */
            richieste:
              richieste.length === 0 ? (
                <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
                  Nessuna richiesta ricevuta.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {richieste.map((richiesta, indice) => (
                    <article key={richiesta.id} className={blocco}>
                      <div className="flex flex-col gap-3 border-b border-[var(--bordo)] pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="flex items-baseline gap-3">
                          <span className="mono shrink-0 text-[11px] tracking-[0.12em] text-[var(--testo-debole)]">
                            {String(richieste.length - indice).padStart(3, "0")}
                          </span>
                          <h3 className="text-[17px] font-semibold tracking-[-0.01em] break-words">
                            {etichetteAmbito[richiesta.ambito]} ·{" "}
                            {richiesta.nomeContatto}
                          </h3>
                        </div>
                        <div className="self-start sm:self-auto">
                          <BadgeStato stato={richiesta.stato} />
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-1">
                        {[
                          ["Contatto", richiesta.contatto],
                          ...(richiesta.budget ? [["Budget", richiesta.budget]] : []),
                          ...(richiesta.utente
                            ? [
                                [
                                  "Telegram",
                                  richiesta.utente.username
                                    ? `@${richiesta.utente.username}`
                                    : richiesta.utente.telegramId,
                                ],
                              ]
                            : []),
                          ["Data", richiesta.creatoIl.toLocaleString("it-IT")],
                        ].map(([chiave, valore]) => (
                          // Su mobile l'etichetta va sopra il valore: affiancata
                          // lascerebbe ai contatti lunghi una colonna troppo
                          // stretta, con il testo spezzato a metà parola.
                          <div
                            key={chiave}
                            className="flex flex-col gap-0.5 border-b border-dashed border-[var(--bordo)] py-1.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-2 sm:border-0 sm:py-0"
                          >
                            <dt className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--testo-debole)] sm:w-24 sm:shrink-0">
                              {chiave}
                            </dt>
                            <dd className="mono text-[13px] break-words sm:text-[12px]">
                              {valore}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <p className="mono mt-4 whitespace-pre-line border-t border-dashed border-[var(--bordo)] pt-4 text-[13.5px] leading-[1.75] break-words sm:text-[12.5px]">
                        {richiesta.messaggio}
                      </p>

                      {/* Su mobile i campi vanno in colonna e "Elimina" resta
                          staccato in fondo: affiancato a "Aggiorna" su schermi
                          stretti finirebbe premuto per sbaglio. */}
                      <div className="mt-5 flex flex-col gap-4">
                        <form
                          action={aggiornaStatoRichiesta}
                          className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end"
                        >
                          <input type="hidden" name="id" value={richiesta.id} />
                          <select
                            name="stato"
                            defaultValue={richiesta.stato}
                            aria-label="Stato della richiesta"
                            className={`${classiSelettore} sm:w-auto`}
                          >
                            {Object.entries(etichetteStato).map(
                              ([valore, etichetta]) => (
                                <option
                                  key={valore}
                                  value={valore}
                                  className="bg-[var(--sfondo)]"
                                >
                                  {etichetta}
                                </option>
                              ),
                            )}
                          </select>
                          <input
                            name="nota"
                            placeholder="Nota per il cliente (facoltativa)"
                            aria-label="Nota per il cliente"
                            className={`${classiSelettore} sm:min-w-40 sm:flex-1`}
                          />
                          <BottoneSalva testo="Aggiorna" />
                        </form>

                        <form
                          action={eliminaRichiesta}
                          className="border-t border-dashed border-[var(--bordo)] pt-4 sm:border-0 sm:pt-0"
                        >
                          <input type="hidden" name="id" value={richiesta.id} />
                          <BottoneElimina />
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              ),

            /* ----------------------------- Abbonamenti ---------------------------- */
            abbonamenti: (
              <div className="flex flex-col gap-4">
                {abbonamenti.map((piano) => (
                  <div key={piano.id} className={blocco}>
                    <form action={aggiornaAbbonamento} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={piano.id} />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo etichetta="Nome" nome="nome" valore={piano.nome} richiesto />
                        <Campo
                          etichetta="Prezzo (€)"
                          nome="prezzo"
                          tipo="number"
                          step="0.01"
                          valore={(piano.prezzoCentesimi / 100).toString()}
                        />
                      </div>

                      <Campo
                        etichetta="Sottotitolo"
                        nome="sottotitolo"
                        valore={piano.sottotitolo}
                      />
                      <AreaTesto
                        etichetta="Descrizione"
                        nome="descrizione"
                        valore={piano.descrizione}
                      />

                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5">
                        <div className="w-full sm:w-24">
                          <Campo
                            etichetta="Ordine"
                            nome="ordine"
                            tipo="number"
                            valore={piano.ordine.toString()}
                          />
                        </div>
                        <div className="flex gap-4 pb-2.5">
                          <Spunta etichetta="Attivo" nome="attivo" attivo={piano.attivo} />
                          <Spunta
                            etichetta="Evidenza"
                            nome="inEvidenza"
                            attivo={piano.inEvidenza}
                          />
                        </div>
                        <div className="w-full sm:ml-auto sm:w-auto">
                          <BottoneSalva />
                        </div>
                      </div>
                    </form>

                    <div className="mt-6 border-t border-[var(--bordo)] pt-4">
                      <Etichetta>Funzionalità incluse</Etichetta>
                      <ul className="mt-3">
                        {piano.funzionalita.map((funzione) => (
                          <li
                            key={funzione.id}
                            className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--bordo)] py-2"
                          >
                            <span className="mono text-[12px]">
                              <span className="text-[var(--accento)]">+ </span>
                              {funzione.testo}
                            </span>
                            <form action={eliminaFunzionalita}>
                              <input type="hidden" name="id" value={funzione.id} />
                              <button
                                type="submit"
                                aria-label="Rimuovi funzionalità"
                                className="mono px-2 text-[13px] text-[var(--testo-debole)] transition-colors hover:text-[var(--allarme)]"
                              >
                                ×
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>

                      <form action={aggiungiFunzionalita} className="mt-4 flex gap-2">
                        <input type="hidden" name="abbonamentoId" value={piano.id} />
                        <input
                          name="testo"
                          required
                          placeholder="Nuova funzionalità"
                          className={`${classiSelettore} flex-1`}
                        />
                        <BottoneSalva testo="Aggiungi" />
                      </form>
                    </div>

                    <form action={eliminaAbbonamento} className="mt-5">
                      <input type="hidden" name="id" value={piano.id} />
                      <BottoneElimina testo="Elimina piano" />
                    </form>
                  </div>
                ))}

                <form action={creaAbbonamento} className={`${blocco} flex flex-col gap-4`}>
                  <Etichetta className="text-[var(--accento)]">Nuovo piano</Etichetta>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etichetta="Nome" nome="nome" richiesto placeholder="Es. Catalogo Pro" />
                    <Campo etichetta="Prezzo (€)" nome="prezzo" tipo="number" step="0.01" valore="0" />
                  </div>
                  <AreaTesto etichetta="Descrizione" nome="descrizione" />
                  <p className="mono text-[11px] text-[var(--testo-debole)]">
                    Il piano viene creato disattivato: attivalo quando è pronto.
                  </p>
                  <div>
                    <BottoneSalva testo="Crea piano" />
                  </div>
                </form>
              </div>
            ),

            /* ---------------------------- Sottoscrizioni --------------------------- */
            sottoscrizioni:
              sottoscrizioni.length === 0 ? (
                <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
                  Nessuna sottoscrizione registrata.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {sottoscrizioni.map((sottoscrizione) => (
                    <article key={sottoscrizione.id} className={blocco}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <h3 className="text-[17px] font-semibold tracking-[-0.01em] break-words">
                          {sottoscrizione.abbonamento.nome}
                        </h3>
                        <div className="self-start sm:self-auto">
                          <BadgeStato stato={sottoscrizione.stato} tipo="abbonamento" />
                        </div>
                      </div>

                      {/* In colonna su mobile: i tre dati separati da "·" su una
                          riga sola diventano illeggibili quando vanno a capo. */}
                      <dl className="mono mt-3 flex flex-col gap-1 text-[13px] text-[var(--testo-tenue)] sm:mt-2.5 sm:flex-row sm:gap-2 sm:text-[12px]">
                        <dd className="break-words">
                          {sottoscrizione.utente.username
                            ? `@${sottoscrizione.utente.username}`
                            : sottoscrizione.utente.telegramId}
                        </dd>
                        <dd className="hidden sm:block" aria-hidden="true">
                          ·
                        </dd>
                        <dd>
                          {formattaPrezzo(
                            sottoscrizione.abbonamento.prezzoCentesimi,
                            sottoscrizione.abbonamento.valuta,
                          )}
                        </dd>
                        <dd className="hidden sm:block" aria-hidden="true">
                          ·
                        </dd>
                        <dd>{sottoscrizione.creatoIl.toLocaleDateString("it-IT")}</dd>
                      </dl>

                      <form
                        action={aggiornaStatoSottoscrizione}
                        className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap"
                      >
                        <input type="hidden" name="id" value={sottoscrizione.id} />
                        <select
                          name="stato"
                          defaultValue={sottoscrizione.stato}
                          aria-label="Stato della sottoscrizione"
                          className={`${classiSelettore} sm:w-auto`}
                        >
                          {Object.entries(etichetteStatoAbbonamento).map(
                            ([valore, etichetta]) => (
                              <option
                                key={valore}
                                value={valore}
                                className="bg-[var(--sfondo)]"
                              >
                                {etichetta}
                              </option>
                            ),
                          )}
                        </select>
                        <BottoneSalva testo="Aggiorna stato" />
                      </form>
                    </article>
                  ))}
                </div>
              ),

            /* -------------------------------- Servizi ------------------------------ */
            servizi: (
              <div className="flex flex-col gap-4">
                {servizi.map((servizio) => (
                  <div key={servizio.id} className={blocco}>
                    <form action={salvaServizio} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={servizio.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo etichetta="Titolo" nome="titolo" valore={servizio.titolo} richiesto />
                        <SelettoreIcona nome="icona" valore={servizio.icona} />
                      </div>
                      <AreaTesto
                        etichetta="Descrizione"
                        nome="descrizione"
                        valore={servizio.descrizione}
                      />
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5">
                        <div className="w-full sm:w-24">
                          <Campo
                            etichetta="Ordine"
                            nome="ordine"
                            tipo="number"
                            valore={servizio.ordine.toString()}
                          />
                        </div>
                        <div className="pb-2.5">
                          <Spunta etichetta="Attivo" nome="attivo" attivo={servizio.attivo} />
                        </div>
                        <div className="w-full sm:ml-auto sm:w-auto">
                          <BottoneSalva />
                        </div>
                      </div>
                    </form>
                    <form action={eliminaServizio} className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4">
                      <input type="hidden" name="id" value={servizio.id} />
                      <BottoneElimina />
                    </form>
                  </div>
                ))}

                <form action={salvaServizio} className={`${blocco} flex flex-col gap-4`}>
                  <Etichetta className="text-[var(--accento)]">Nuovo servizio</Etichetta>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etichetta="Titolo" nome="titolo" richiesto />
                    <SelettoreIcona nome="icona" valore="code" />
                  </div>
                  <AreaTesto etichetta="Descrizione" nome="descrizione" />
                  <div>
                    <BottoneSalva testo="Aggiungi servizio" />
                  </div>
                </form>
              </div>
            ),

            /* ------------------------------- Vantaggi ------------------------------ */
            vantaggi: (
              <div className="flex flex-col gap-4">
                {vantaggi.map((vantaggio) => (
                  <div key={vantaggio.id} className={blocco}>
                    <form action={salvaVantaggio} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={vantaggio.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo etichetta="Titolo" nome="titolo" valore={vantaggio.titolo} richiesto />
                        <SelettoreIcona nome="icona" valore={vantaggio.icona} />
                      </div>
                      <AreaTesto
                        etichetta="Descrizione"
                        nome="descrizione"
                        valore={vantaggio.descrizione}
                      />
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5">
                        <div className="w-full sm:w-24">
                          <Campo
                            etichetta="Ordine"
                            nome="ordine"
                            tipo="number"
                            valore={vantaggio.ordine.toString()}
                          />
                        </div>
                        <div className="pb-2.5">
                          <Spunta etichetta="Attivo" nome="attivo" attivo={vantaggio.attivo} />
                        </div>
                        <div className="w-full sm:ml-auto sm:w-auto">
                          <BottoneSalva />
                        </div>
                      </div>
                    </form>
                    <form action={eliminaVantaggio} className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4">
                      <input type="hidden" name="id" value={vantaggio.id} />
                      <BottoneElimina />
                    </form>
                  </div>
                ))}

                <form action={salvaVantaggio} className={`${blocco} flex flex-col gap-4`}>
                  <Etichetta className="text-[var(--accento)]">Nuovo vantaggio</Etichetta>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etichetta="Titolo" nome="titolo" richiesto />
                    <SelettoreIcona nome="icona" valore="spark" />
                  </div>
                  <AreaTesto etichetta="Descrizione" nome="descrizione" />
                  <div>
                    <BottoneSalva testo="Aggiungi vantaggio" />
                  </div>
                </form>
              </div>
            ),

            /* --------------------------------- FAQ -------------------------------- */
            faq: (
              <div className="flex flex-col gap-4">
                {faq.map((voce) => (
                  <div key={voce.id} className={blocco}>
                    <form action={salvaFaq} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={voce.id} />
                      <Campo etichetta="Domanda" nome="domanda" valore={voce.domanda} richiesto />
                      <AreaTesto
                        etichetta="Risposta"
                        nome="risposta"
                        valore={voce.risposta}
                        righe={3}
                      />
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5">
                        <div className="w-full sm:w-24">
                          <Campo
                            etichetta="Ordine"
                            nome="ordine"
                            tipo="number"
                            valore={voce.ordine.toString()}
                          />
                        </div>
                        <div className="pb-2.5">
                          <Spunta etichetta="Attiva" nome="attiva" attivo={voce.attiva} />
                        </div>
                        <div className="w-full sm:ml-auto sm:w-auto">
                          <BottoneSalva />
                        </div>
                      </div>
                    </form>
                    <form action={eliminaFaq} className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4">
                      <input type="hidden" name="id" value={voce.id} />
                      <BottoneElimina />
                    </form>
                  </div>
                ))}

                <form action={salvaFaq} className={`${blocco} flex flex-col gap-4`}>
                  <Etichetta className="text-[var(--accento)]">Nuova domanda</Etichetta>
                  <Campo etichetta="Domanda" nome="domanda" richiesto />
                  <AreaTesto etichetta="Risposta" nome="risposta" righe={3} />
                  <div>
                    <BottoneSalva testo="Aggiungi FAQ" />
                  </div>
                </form>
              </div>
            ),

            /* ------------------------------- Contatti ----------------------------- */
            contatti: (
              <div className="flex flex-col gap-4">
                {contatti.map((contatto) => (
                  <div key={contatto.id} className={blocco}>
                    <form action={salvaContatto} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={contatto.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo
                          etichetta="Etichetta"
                          nome="etichetta"
                          valore={contatto.etichetta}
                          richiesto
                        />
                        <Campo etichetta="Valore" nome="valore" valore={contatto.valore} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo etichetta="URL" nome="url" valore={contatto.url} />
                        <SelettoreIcona nome="icona" valore={contatto.icona} />
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5">
                        <div className="w-full sm:w-24">
                          <Campo
                            etichetta="Ordine"
                            nome="ordine"
                            tipo="number"
                            valore={contatto.ordine.toString()}
                          />
                        </div>
                        <div className="pb-2.5">
                          <Spunta etichetta="Attivo" nome="attivo" attivo={contatto.attivo} />
                        </div>
                        <div className="w-full sm:ml-auto sm:w-auto">
                          <BottoneSalva />
                        </div>
                      </div>
                    </form>
                    <form action={eliminaContatto} className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4">
                      <input type="hidden" name="id" value={contatto.id} />
                      <BottoneElimina />
                    </form>
                  </div>
                ))}

                <form action={salvaContatto} className={`${blocco} flex flex-col gap-4`}>
                  <Etichetta className="text-[var(--accento)]">Nuovo contatto</Etichetta>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etichetta="Etichetta" nome="etichetta" richiesto />
                    <Campo etichetta="Valore" nome="valore" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etichetta="URL" nome="url" />
                    <SelettoreIcona nome="icona" valore="link" />
                  </div>
                  <div>
                    <BottoneSalva testo="Aggiungi contatto" />
                  </div>
                </form>
              </div>
            ),

            /* --------------------------------- Testi ------------------------------ */
            testi: (
              <div className="flex flex-col gap-3">
                {contenuti.map((contenuto) => (
                  <form
                    key={contenuto.chiave}
                    action={aggiornaContenuto}
                    className="flex flex-col gap-2.5 border border-[var(--bordo)] p-4"
                  >
                    <input type="hidden" name="chiave" value={contenuto.chiave} />
                    <span className="mono text-[11px] tracking-[0.08em] text-[var(--accento)]">
                      {contenuto.chiave}
                    </span>
                    <textarea
                      name="valore"
                      rows={2}
                      defaultValue={contenuto.valore}
                      className={`${classiSelettore} resize-none leading-[1.65]`}
                    />
                    <div className="self-start">
                      <BottoneSalva />
                    </div>
                  </form>
                ))}
              </div>
            ),
          }}
        </SchedeAdmin>
      </main>

      <PiedePagina />
    </div>
  );
}
