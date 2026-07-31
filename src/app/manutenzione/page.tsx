import type { Metadata } from "next";
import { PortaAccesso } from "@/components/porta-accesso";
import { Rivela } from "@/components/animazioni";
import { MarchioCostruito, NastroCantiere } from "@/components/costruzione";
import { Orologio } from "@/components/scena-attesa";
import {
  AvanzamentoFinto,
  FraseAlternata,
  GiorniDiLavoro,
  RegistroCantiere,
} from "@/components/cantiere";

export const metadata: Metadata = {
  title: "Phantom Lab — In arrivo",
  description: "Studio di sviluppo digitale. Sito in preparazione.",
  robots: { index: false, follow: false },
};

/** Inizio dei lavori: alimenta il contatore dei giorni. */
const INIZIO_LAVORI = "2026-07-01";

const NASTRO = [
  "Lavori in corso",
  "Siti web",
  "Applicazioni",
  "Automazioni",
  "Bot Telegram",
  "Presto online",
];

const CONTATTI = [
  {
    etichetta: "Telegram",
    valore: "@phantomlabd",
    url: "https://t.me/phantomlabd",
  },
  {
    etichetta: "Email",
    valore: "info@phantom-lab.eu",
    url: "mailto:info@phantom-lab.eu",
  },
];

export default function Manutenzione() {
  return (
    <div className="reticolo relative flex min-h-full flex-col overflow-hidden">
      <main className="relative flex flex-1 flex-col">
        {/* Barra di stato in cima: la chiave d'accesso resta il logo. */}
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 pt-6 sm:px-8">
          <PortaAccesso />
          <span className="mono flex items-center gap-2.5 text-[10.5px] tracking-[0.16em] text-[var(--accento)] uppercase sm:text-[11px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--accento)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 bg-[var(--accento)]" />
            </span>
            In costruzione
          </span>
          <span className="mono text-[11px] tracking-[0.12em] text-[var(--testo-debole)]">
            <Orologio />
          </span>
        </div>

        {/* Il marchio che si costruisce da solo: è il centro della pagina.
            Il titolo resta nel documento per chi usa uno screen reader,
            dove un canvas non dice nulla. */}
        <h1 className="sr-only">Phantom Lab — sito in costruzione</h1>

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-4 py-4 sm:px-8">
          <MarchioCostruito />

          <p className="mono mt-2 text-center text-[10.5px] tracking-[0.16em] text-[var(--testo-debole)] uppercase">
            Tocca il marchio
          </p>
        </div>

        <NastroCantiere voci={NASTRO} />

        {/* Il dettaglio dei lavori sta sotto la piega: chi vuole saperne di
            più scorre, chi no si ferma all'animazione. */}
        <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-8 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <Rivela>
                <FraseAlternata />
              </Rivela>

              <Rivela ritardo={0.1}>
                <AvanzamentoFinto />
              </Rivela>

              <Rivela ritardo={0.2}>
                <dl className="mt-10 max-w-sm border-t border-[var(--bordo)]">
                  {CONTATTI.map((contatto) => (
                    <div
                      key={contatto.etichetta}
                      className="group flex items-baseline justify-between gap-4 border-b border-[var(--bordo)]"
                    >
                      <dt className="mono py-3 text-[11px] tracking-[0.16em] text-[var(--testo-debole)] uppercase">
                        {contatto.etichetta}
                      </dt>
                      <dd>
                        <a
                          href={contatto.url}
                          target={
                            contatto.url.startsWith("http")
                              ? "_blank"
                              : undefined
                          }
                          rel={
                            contatto.url.startsWith("http")
                              ? "noopener noreferrer"
                              : undefined
                          }
                          /* min-h-11: bersaglio comodo anche sul telefono,
                             dove una riga di testo è troppo sottile. */
                          className="mono flex min-h-11 items-center gap-2 text-[13px] transition-colors hover:text-[var(--accento)]"
                        >
                          {contatto.valore}
                          <span
                            aria-hidden="true"
                            className="text-[var(--testo-debole)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accento)]"
                          >
                            →
                          </span>
                        </a>
                      </dd>
                    </div>
                  ))}
                </dl>
              </Rivela>
            </div>

            <Rivela ritardo={0.15}>
              <div className="border-t border-[var(--bordo)] pt-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="mono text-[11px] tracking-[0.16em] text-[var(--testo-debole)] uppercase">
                    Cosa stiamo costruendo
                  </span>
                  <span className="mono text-[11px] text-[var(--testo-debole)]">
                    giorno <GiorniDiLavoro dallaData={INIZIO_LAVORI} />
                  </span>
                </div>
                <RegistroCantiere />
              </div>
            </Rivela>
          </div>
        </div>
      </main>

      <footer className="relative border-t border-[var(--bordo)] px-4 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <span className="mono text-[11px] tracking-[0.14em] text-[var(--testo-debole)] uppercase">
            © {new Date().getFullYear()} Phantom Lab · phantom-lab.eu
          </span>
        </div>
      </footer>
    </div>
  );
}
