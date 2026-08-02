import Link from "next/link";
import { FormExchange } from "@/components/form-exchange";
import { Rivela } from "@/components/animazioni";
import { AccessoTelegram } from "@/components/accesso-telegram";
import { Icona } from "@/components/icone";
import { Etichetta } from "@/components/ui";
import { utenteCorrente } from "@/lib/sessione";
import { COMMISSIONE_PERCENTUALE, DIREZIONI_SCAMBIO } from "@/lib/scambio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Exchange — Phantom Lab",
};

export default async function PaginaExchange() {
  const utente = await utenteCorrente();

  if (!utente) {
    return (
      <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-16 sm:px-8 sm:py-24">
        <div className="w-full max-w-lg">
          <AccessoTelegram
            titolo="Accedi al tuo account"
            descrizione="Collega il tuo profilo Telegram per richiedere un cambio: ti scriviamo dallo stesso account per i dettagli."
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

  return (
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
                Exchange · Cripto ⇄ Fiat
              </Etichetta>
              <h1 className="display mt-5 text-[clamp(2.25rem,9vw,4.5rem)]">
                Cambia
                <br />
                in sicurezza
              </h1>
              <p className="mono mt-5 max-w-md text-[12.5px] leading-[1.75] text-[var(--testo-tenue)]">
                Conversioni rapide e riservate, solo BTC e USDC per ora.
                Commissione fissa: {COMMISSIONE_PERCENTUALE}% sull&apos;importo
                della transazione.
              </p>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden border border-[var(--bordo)] sm:grid-cols-2">
              {DIREZIONI_SCAMBIO.map((voce) => (
                <div
                  key={voce.valore}
                  className="flex items-center gap-3 bg-[var(--sfondo)] p-4"
                >
                  <span className="flex shrink-0 items-center gap-1 text-[var(--accento)]">
                    <Icona nome={voce.da} className="h-5 w-5" />
                    <Icona nome="freccia" className="h-3 w-3 opacity-50" />
                    <Icona nome={voce.a} className="h-5 w-5" />
                  </span>
                  <span className="mono text-[11.5px] leading-[1.4]">
                    {voce.etichetta}
                  </span>
                </div>
              ))}
            </div>
          </Rivela>

          <div className="mt-12">
          <Rivela ritardo={0.08}>
            <FormExchange />
          </Rivela>
        </div>
      </div>
    </main>
  );
}
