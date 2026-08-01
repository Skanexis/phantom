import Link from "next/link";
import { Etichetta } from "@/components/ui";

export function PiedePagina() {
  return (
    <footer className="border-t border-[var(--bordo)]">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-8">
        <div className="grid gap-8 border-b border-[var(--bordo)] py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="mono flex h-7 w-7 items-center justify-center bg-[var(--accento)] text-[13px] font-bold text-[var(--accento-testo)]">
              P
            </span>
            <p className="mono mt-4 text-[12px] leading-[1.7] text-[var(--testo-tenue)]">
              Studio di sviluppo digitale.
              <br />
              Siti, applicazioni, automazioni.
            </p>
          </div>

          <div>
            <Etichetta>Piattaforma</Etichetta>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { href: "/#servizi", testo: "Servizi" },
                { href: "/#abbonamenti", testo: "Abbonamenti" },
                { href: "/#automazioni", testo: "Automazioni" },
                { href: "/#faq", testo: "FAQ" },
              ].map((voce) => (
                <li key={voce.href}>
                  <Link
                    href={voce.href}
                    className="mono text-[12.5px] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
                  >
                    {voce.testo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Etichetta>Account</Etichetta>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { href: "/area-personale", testo: "Area personale" },
                { href: "/richiesta", testo: "Nuova richiesta" },
              ].map((voce) => (
                <li key={voce.href}>
                  <Link
                    href={voce.href}
                    className="mono text-[12.5px] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
                  >
                    {voce.testo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Etichetta>Stato</Etichetta>
            <p className="mono mt-4 flex items-center gap-2 text-[12.5px] text-[var(--testo-tenue)]">
              <span className="h-1.5 w-1.5 bg-[var(--ok)]" />
              Operativo
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-2 py-6 sm:flex-row">
          <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--testo-debole)]">
            © {new Date().getFullYear()} Phantom Lab
          </span>
          <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--testo-debole)]">
            Costruito per Telegram Mini App
          </span>
        </div>
      </div>
    </footer>
  );
}
