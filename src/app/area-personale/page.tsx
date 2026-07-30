import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { utenteCorrente } from "@/lib/sessione";
import { formattaPrezzo } from "@/lib/contenuti";
import { etichetteAmbito, etichetteStato } from "@/lib/telegram-bot";
import { Navigazione } from "@/components/navigazione";
import { PiedePagina } from "@/components/piede-pagina";
import { BadgeStato } from "@/components/badge-stato";
import { PannelloNotifiche } from "@/components/pannello-notifiche";
import { Rivela, Scaglionato, Voce } from "@/components/animazioni";
import { AccessoTelegram } from "@/components/accesso-telegram";
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
              className="mono mt-6 inline-block text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
            >
              ← Torna alla home
            </Link>
          </div>
        </main>
        <PiedePagina />
      </div>
    );
  }

  const [richieste, sottoscrizioni, notifiche] = await Promise.all([
    prisma.richiesta.findMany({
      where: { utenteId: utente.id },
      orderBy: { creatoIl: "desc" },
      include: { storico: { orderBy: { creatoIl: "asc" } } },
    }),
    prisma.abbonamentoUtente.findMany({
      where: {
        utenteId: utente.id,
        stato: { in: ["IN_ATTESA", "ATTIVO", "SOSPESO"] },
      },
      include: { abbonamento: true },
      orderBy: { creatoIl: "desc" },
    }),
    prisma.notifica.findMany({
      where: { utenteId: utente.id },
      orderBy: { creatoIl: "desc" },
      take: 12,
    }),
  ]);

  const completate = richieste.filter((r) => r.stato === "COMPLETATA").length;

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <Rivela>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--bordo)] pb-6">
            <div>
              <Etichetta>Account · {utente.telegramId}</Etichetta>
              <h1 className="display mt-4 text-[clamp(2rem,7vw,4rem)]">
                {utente.nome ?? "Utente"}
              </h1>
            </div>
            {utente.ruolo === "ADMIN" && (
              <Link
                href="/admin"
                className="mono spinta border border-[var(--accento)] px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--accento)]"
              >
                Pannello admin →
              </Link>
            )}
          </div>
        </Rivela>

        {/* Riepilogo numerico */}
        <Scaglionato className="grid border-b border-l border-[var(--bordo)] sm:grid-cols-3">
          {[
            { valore: richieste.length, etichetta: "Richieste" },
            { valore: completate, etichetta: "Completate" },
            { valore: sottoscrizioni.length, etichetta: "Abbonamenti" },
          ].map((dato) => (
            <Voce key={dato.etichetta}>
              <div className="border-r border-[var(--bordo)] p-6">
                <span className="display block text-[44px]">
                  {String(dato.valore).padStart(2, "0")}
                </span>
                <Etichetta className="mt-1 block">{dato.etichetta}</Etichetta>
              </div>
            </Voce>
          ))}
        </Scaglionato>

        {/* Abbonamenti */}
        <section className="mt-14">
          <Etichetta className="block border-b border-[var(--bordo)] pb-3">
            Abbonamenti attivi
          </Etichetta>

          {sottoscrizioni.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 border-b border-[var(--bordo)] py-8 sm:flex-row sm:items-center">
              <p className="mono text-[12.5px] text-[var(--testo-tenue)]">
                Nessun abbonamento attivo.
              </p>
              <Link
                href="/#abbonamenti"
                className="mono spinta shrink-0 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)]"
              >
                Scopri i piani
              </Link>
            </div>
          ) : (
            <Scaglionato>
              {sottoscrizioni.map((sottoscrizione) => (
                <Voce key={sottoscrizione.id}>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--bordo)] py-6">
                    <div>
                      <h3 className="text-[20px] font-semibold tracking-[-0.01em]">
                        {sottoscrizione.abbonamento.nome}
                      </h3>
                      <p className="mono mt-1.5 text-[12px] text-[var(--testo-tenue)]">
                        {formattaPrezzo(
                          sottoscrizione.abbonamento.prezzoCentesimi,
                          sottoscrizione.abbonamento.valuta,
                        )}{" "}
                        /{sottoscrizione.abbonamento.periodo}
                        {sottoscrizione.stato === "ATTIVO" &&
                          sottoscrizione.scadeIl &&
                          ` · rinnovo ${sottoscrizione.scadeIl.toLocaleDateString("it-IT")}`}
                        {sottoscrizione.stato === "IN_ATTESA" &&
                          " · in attesa di conferma"}
                      </p>
                    </div>
                    <BadgeStato stato={sottoscrizione.stato} tipo="abbonamento" />
                  </div>
                </Voce>
              ))}
            </Scaglionato>
          )}
        </section>

        {/* Richieste */}
        <section className="mt-14">
          <Etichetta className="block border-b border-[var(--bordo)] pb-3">
            Richieste
          </Etichetta>

          {richieste.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 border-b border-[var(--bordo)] py-8 sm:flex-row sm:items-center">
              <p className="mono text-[12.5px] text-[var(--testo-tenue)]">
                Nessuna richiesta inviata.
              </p>
              <Link
                href="/richiesta"
                className="mono spinta shrink-0 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)]"
              >
                Invia richiesta
              </Link>
            </div>
          ) : (
            <Scaglionato>
              {richieste.map((richiesta, indice) => (
                <Voce key={richiesta.id}>
                  <article className="border-b border-[var(--bordo)] py-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-baseline gap-4">
                        <span className="mono text-[11px] tracking-[0.12em] text-[var(--testo-debole)]">
                          {String(richieste.length - indice).padStart(3, "0")}
                        </span>
                        <h3 className="text-[18px] font-semibold tracking-[-0.01em]">
                          {etichetteAmbito[richiesta.ambito]}
                        </h3>
                      </div>
                      <BadgeStato stato={richiesta.stato} />
                    </div>

                    <p className="mono mt-3 whitespace-pre-line pl-0 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)] sm:pl-[calc(1rem+3ch)]">
                      {richiesta.messaggio}
                    </p>

                    {richiesta.storico.length > 0 && (
                      <ol className="mt-5 sm:pl-[calc(1rem+3ch)]">
                        {richiesta.storico.map((voce, posizione) => (
                          <li
                            key={voce.id}
                            className="flex items-baseline gap-3 border-t border-dashed border-[var(--bordo)] py-2"
                          >
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
                            {voce.nota && (
                              <span className="mono flex-1 text-[11.5px] text-[var(--testo-tenue)]">
                                {voce.nota}
                              </span>
                            )}
                            <span className="mono ml-auto shrink-0 text-[10.5px] text-[var(--testo-debole)]">
                              {voce.creatoIl.toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                </Voce>
              ))}
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
