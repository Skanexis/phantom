import Link from "next/link";
import { FormSupporto } from "@/components/form-supporto";
import { Rivela } from "@/components/animazioni";
import { AccessoTelegram } from "@/components/accesso-telegram";
import { Etichetta } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { utenteCorrente } from "@/lib/sessione";
import { STATI_VISIBILI, statoEffettivo } from "@/lib/abbonamenti";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Supporto — Phantom Lab",
};

export default async function PaginaSupporto() {
  const utente = await utenteCorrente();

  if (!utente) {
    return (
      <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-16 sm:px-8 sm:py-24">
        <div className="w-full max-w-lg">
          <AccessoTelegram
            titolo="Accedi al tuo account"
            descrizione="Collega il tuo profilo Telegram: il supporto diretto è incluso in ogni abbonamento attivo."
          />
          <Link
            href="/"
            className="mono mt-6 inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
          >
            ← Torna alla home
          </Link>
        </div>
      </main>
    );
  }

  const sottoscrizioni = await prisma.abbonamentoUtente.findMany({
    where: { utenteId: utente.id, stato: { in: STATI_VISIBILI } },
    include: { abbonamento: true },
  });
  const attiva = sottoscrizioni.find((s) => statoEffettivo(s) === "ATTIVO");

  if (!attiva) {
    return (
      <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-16 sm:px-8 sm:py-24">
        <div className="crocini relative max-w-lg border border-[var(--bordo)] p-8 sm:p-10">
          <Etichetta className="text-[var(--accento)]">Supporto</Etichetta>
          <h1 className="display mt-5 text-[32px] sm:text-[42px]">
            Riservato a chi ha
            <br />
            un abbonamento attivo
          </h1>
          <p className="mono mt-4 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
            Il supporto diretto è incluso in ogni piano: problemi, domande
            o idee di miglioramento, con risposta del team sul bot
            Telegram. Attivane uno per iniziare.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/#abbonamenti"
              className="mono spinta border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3.5 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)]"
            >
              Scopri i piani
            </Link>
            <Link
              href="/area-personale"
              className="mono spinta border border-[var(--bordo)] px-5 py-3.5 text-center text-[12px] uppercase tracking-[0.14em]"
            >
              Area personale
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-12 sm:px-8 sm:py-20">
      <div className="mx-auto w-full max-w-2xl">
          <Rivela>
            <Link
              href="/area-personale"
              className="mono inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
            >
              ← Torna all&apos;area personale
            </Link>

            <div className="mt-8 border-t border-[var(--bordo)] pt-5">
              <Etichetta className="text-[var(--accento)]">
                Supporto · {attiva.abbonamento.nome}
              </Etichetta>
              <h1 className="display mt-5 text-[clamp(2.25rem,9vw,4.5rem)]">
                Scrivi
                <br />
                al team
              </h1>
              <p className="mono mt-5 max-w-md text-[12.5px] leading-[1.75] text-[var(--testo-tenue)]">
                Segnala un problema, fai una domanda o proponi un
                miglioramento. Rispondiamo dal bot Telegram, di solito in
                giornata.
              </p>
            </div>
          </Rivela>

          <div className="mt-12">
            <Rivela ritardo={0.08}>
              <FormSupporto />
            </Rivela>
          </div>
        </div>
      </main>
  );
}
