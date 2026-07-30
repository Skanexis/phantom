import type { Metadata } from "next";
import { PortaAccesso } from "@/components/porta-accesso";

export const metadata: Metadata = {
  title: "Phantom Lab — In arrivo",
  description: "Studio di sviluppo digitale. Sito in preparazione.",
  robots: { index: false, follow: false },
};

export default function Manutenzione() {
  return (
    <div className="reticolo flex min-h-full flex-col">
      <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-4 py-16 sm:px-8">
        <div className="max-w-2xl">
          <PortaAccesso />

          <p className="mono mt-10 text-[11px] uppercase tracking-[0.18em] text-[var(--accento)]">
            Stato · In preparazione
          </p>

          <h1 className="display mt-5 text-[clamp(2.75rem,12vw,7rem)]">
            Phantom
            <br />
            Lab
          </h1>

          <p className="mono mt-8 max-w-md text-[13px] leading-[1.8] text-[var(--testo-tenue)]">
            Studio di sviluppo digitale. Siti web, applicazioni, automazioni e
            bot Telegram su misura.
          </p>

          <p className="mono mt-4 max-w-md text-[13px] leading-[1.8] text-[var(--testo-tenue)]">
            Il sito sarà online a breve.
          </p>

          <dl className="mt-12 max-w-sm border-t border-[var(--bordo)]">
            <div className="flex items-baseline justify-between border-b border-[var(--bordo)] py-3">
              <dt className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--testo-debole)]">
                Contatto
              </dt>
              <dd>
                <a
                  href="https://t.me/phantomlab"
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-[13px] transition-colors hover:text-[var(--accento)]"
                >
                  @phantomlab
                </a>
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-[var(--bordo)] py-3">
              <dt className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--testo-debole)]">
                Email
              </dt>
              <dd>
                <a
                  href="mailto:info@phantom-lab.eu"
                  className="mono text-[13px] transition-colors hover:text-[var(--accento)]"
                >
                  info@phantom-lab.eu
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </main>

      <footer className="border-t border-[var(--bordo)] px-4 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--testo-debole)]">
            © {new Date().getFullYear()} Phantom Lab · phantom-lab.eu
          </span>
        </div>
      </footer>
    </div>
  );
}
