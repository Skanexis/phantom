import Link from "next/link";
import { FormRichiesta } from "@/components/form-richiesta";
import { Navigazione } from "@/components/navigazione";
import { PiedePagina } from "@/components/piede-pagina";
import { Rivela } from "@/components/animazioni";
import { AccessoTelegram } from "@/components/accesso-telegram";
import { Etichetta } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { utenteCorrente } from "@/lib/sessione";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Richiedi un progetto — Phantom Lab",
};

export default async function PaginaRichiesta({
  searchParams,
}: {
  searchParams: Promise<{ ambito?: string; piano?: string }>;
}) {
  const parametri = await searchParams;
  const utente = await utenteCorrente();

  // Mostro il nome leggibile del piano, non lo slug tecnico dell'URL.
  const piano = parametri.piano
    ? await prisma.abbonamento.findUnique({
        where: { slug: parametri.piano },
        select: { nome: true },
      })
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-12 sm:px-8 sm:py-20">
        <div className="mx-auto w-full max-w-2xl">
          <Rivela>
            <Link
              href="/"
              className="mono inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
            >
              ← Torna alla home
            </Link>

            <div className="mt-8 border-t border-[var(--bordo)] pt-5">
              <Etichetta className="text-[var(--accento)]">
                Modulo · Nuova richiesta
              </Etichetta>
              <h1 className="display mt-5 text-[clamp(2.25rem,9vw,4.5rem)]">
                Raccontaci
                <br />
                il progetto
              </h1>
              <p className="mono mt-5 max-w-md text-[12.5px] leading-[1.75] text-[var(--testo-tenue)]">
                Compila il modulo: riceviamo la richiesta e ti ricontattiamo per
                definire insieme obiettivi, tempi e costi.
              </p>
            </div>

            {piano && (
              <p className="mono mt-6 border border-[var(--accento)] px-4 py-3 text-[12px]">
                <span className="text-[var(--testo-tenue)]">
                  Piano selezionato:{" "}
                </span>
                <span className="font-semibold">{piano.nome}</span>
              </p>
            )}
          </Rivela>

          <div className="mt-12">
            <Rivela ritardo={0.08}>
              {utente ? (
                <FormRichiesta ambitoIniziale={parametri.ambito} />
              ) : (
                <AccessoTelegram
                  titolo="Prima collega l'account"
                  descrizione="Serve un account Telegram per inviare la richiesta e seguirne lo stato. Apri il bot, premi Avvia e torni qui già collegato."
                />
              )}
            </Rivela>
          </div>
        </div>
      </main>

      <PiedePagina />
    </div>
  );
}
