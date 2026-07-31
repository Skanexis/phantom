import type { Metadata } from "next";
import { PortaAccesso } from "@/components/porta-accesso";
import { Rivela } from "@/components/animazioni";
import {
  BarraLavori,
  Orologio,
  SfondoAnimato,
  TitoloComposto,
} from "@/components/scena-attesa";
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
      <SfondoAnimato />

      <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-4 py-12 sm:px-8 sm:py-16">
        <div className="w-full max-w-2xl">
          <PortaAccesso />

          {/* Riga di stato: etichetta viva a sinistra, orologio a destra.
              Il tempo che scorre è ciò che rende viva una pagina d'attesa. */}
          <Rivela ritardo={0.05}>
            <div className="mt-10 flex items-center justify-between gap-4 border-b border-[var(--bordo)] pb-3">
              <span className="mono flex items-center gap-2.5 text-[11px] tracking-[0.18em] text-[var(--accento)] uppercase">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--accento)] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 bg-[var(--accento)]" />
                </span>
                Lavori in corso
              </span>
              <span className="mono text-[11px] tracking-[0.12em] text-[var(--testo-debole)]">
                <Orologio />
              </span>
            </div>
          </Rivela>

          <h1 className="display mt-6 text-[clamp(2.75rem,12vw,7rem)] leading-[0.92]">
            <span className="block">
              <TitoloComposto testo="Phantom" />
            </span>
            <span className="block text-[var(--accento)]">
              <TitoloComposto testo="Lab" />
            </span>
          </h1>

          <Rivela ritardo={0.55}>
            <FraseAlternata />
          </Rivela>

          <Rivela ritardo={0.6}>
            <AvanzamentoFinto />
          </Rivela>

          {/* Il cantiere: le voci si completano una dopo l'altra e il ciclo
              riparte, così si vede che dietro c'è del lavoro. */}
          <Rivela ritardo={0.7}>
            <div className="mt-10 border-t border-[var(--bordo)] pt-5">
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

          <Rivela ritardo={0.8}>
            <div className="mt-10 max-w-sm">
              <BarraLavori />
              <p className="mono mt-3 text-[11px] tracking-[0.14em] text-[var(--testo-debole)] uppercase">
                Il sito sarà online a breve
              </p>
            </div>
          </Rivela>

          <Rivela ritardo={0.9}>
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
                        contatto.url.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        contatto.url.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      /* min-h-11: il bersaglio resta comodo anche sul
                         telefono, dove una riga di testo è troppo sottile. */
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
