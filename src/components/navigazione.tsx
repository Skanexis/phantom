"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { useTelegram, vibra } from "@/components/telegram-provider";
import { InterruttoreTema } from "@/components/interruttore-tema";
import { NotificheNav } from "@/components/notifiche-nav";

/**
 * L'ordine e i numeri seguono la pagina, e non è un dettaglio estetico: i
 * numeri qui sono gli stessi che compaiono accanto ai titoli delle sezioni,
 * quindi una voce di menù marcata "04" che porta alla sezione "02" non è
 * disordine — è un'indicazione sbagliata. Cambiando l'ordine delle sezioni
 * in `app/(sito)/page.tsx` va cambiato anche questo elenco.
 */
const voci = [
  { href: "/#abbonamenti", etichetta: "Abbonamenti", codice: "01" },
  { href: "/#servizi", etichetta: "Servizi", codice: "02" },
  { href: "/#su-misura", etichetta: "Su misura", codice: "03" },
  { href: "/#automazioni", etichetta: "Automazioni", codice: "04" },
  { href: "/#faq", etichetta: "FAQ", codice: "06" },
];

export function Navigazione() {
  const [menuAperto, setMenuAperto] = useState(false);
  const { utente } = useTelegram();

  const { scrollYProgress } = useScroll();
  const progresso = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  useEffect(() => {
    document.body.style.overflow = menuAperto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAperto]);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--bordo)] bg-[var(--sfondo)]">
      <motion.div
        style={{ scaleX: progresso }}
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-[var(--accento)]"
      />

      {/* min-w-0 sulla barra e sul marchio: senza, la colonna di destra —
          tema, avatar, campanella, menù — spingeva il tutto tredici pixel
          oltre il bordo su uno schermo da 360, e il pulsante del menù
          risultava tagliato a metà. Il body ha overflow-x nascosto, quindi
          non compariva nemmeno una barra di scorrimento a segnalarlo: si
          vedeva solo un pulsante mozzato, che sembra un difetto grafico e
          invece era spazio mancante. */}
      <nav className="mx-auto flex h-14 w-full max-w-[1400px] min-w-0 items-stretch justify-between px-4 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="mono flex h-6 w-6 shrink-0 items-center justify-center bg-[var(--accento)] text-[12px] font-bold text-[var(--accento-testo)]">
            P
          </span>
          {/* Il nome per esteso sparisce sotto i 380 pixel: il quadrato con
              la P resta ed è già il marchio — è lo stesso segno su cui si fa
              doppio clic per entrare a sito chiuso. */}
          <span className="mono hidden truncate text-[13px] font-semibold tracking-[0.14em] uppercase min-[380px]:block">
            Phantom Lab
          </span>
        </Link>

        <div className="hidden items-stretch md:flex">
          {voci.map((voce) => (
            <Link
              key={voce.href}
              href={voce.href}
              className="group flex items-center gap-2 border-l border-[var(--bordo)] px-5 transition-colors hover:bg-[var(--accento)]"
            >
              <span className="mono text-[10px] tracking-[0.12em] text-[var(--testo-debole)] group-hover:text-[var(--accento-testo)]">
                {voce.codice}
              </span>
              <span className="mono text-[12px] uppercase tracking-[0.1em] group-hover:text-[var(--accento-testo)]">
                {voce.etichetta}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-stretch">
          <div className="flex items-center border-l border-[var(--bordo)] px-3">
            <InterruttoreTema />
          </div>

          {utente ? (
            <NotificheNav />
          ) : (
            <Link
              href="/area-personale"
              className="mono flex items-center border-l border-[var(--bordo)] px-4 text-[12px] uppercase tracking-[0.1em] transition-colors hover:bg-[var(--accento)] hover:text-[var(--accento-testo)]"
            >
              Accedi
            </Link>
          )}

          <Link
            href="/richiesta"
            className="mono hidden items-center border-l border-[var(--bordo)] bg-[var(--bordo-pieno)] px-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--testo-inverso)] sm:flex"
          >
            Richiedi
          </Link>

          <button
            type="button"
            onClick={() => {
              vibra();
              setMenuAperto((v) => !v);
            }}
            aria-label={menuAperto ? "Chiudi menu" : "Apri menu"}
            aria-expanded={menuAperto}
            className="flex w-12 items-center justify-center border-l border-[var(--bordo)] md:hidden"
          >
            <div className="flex w-4 flex-col gap-1">
              <motion.span
                animate={
                  menuAperto ? { rotate: 45, y: 3 } : { rotate: 0, y: 0 }
                }
                transition={{ duration: 0.18 }}
                className="h-px w-full bg-[var(--testo)]"
              />
              <motion.span
                animate={
                  menuAperto ? { rotate: -45, y: -3 } : { rotate: 0, y: 0 }
                }
                transition={{ duration: 0.18 }}
                className="h-px w-full bg-[var(--testo)]"
              />
            </div>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuAperto && (
          // Sfondo del resto della pagina: senza, il menu è un semplice
          // pannello che spinge in basso il contenuto sottostante, dello
          // stesso nero — sembra altro contenuto della pagina, non un
          // livello sopra di essa. Chiudibile anche toccandolo.
          <motion.button
            type="button"
            aria-label="Chiudi menu"
            onClick={() => setMenuAperto(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/70 md:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuAperto && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-50 overflow-hidden border-t border-[var(--bordo)] bg-[var(--sfondo)] md:hidden"
          >
            {voci.map((voce) => (
              <Link
                key={voce.href}
                href={voce.href}
                onClick={() => setMenuAperto(false)}
                className="flex items-center gap-4 border-b border-[var(--bordo)] px-4 py-4"
              >
                <span className="mono text-[10px] tracking-[0.12em] text-[var(--testo-debole)]">
                  {voce.codice}
                </span>
                <span className="mono text-[14px] uppercase tracking-[0.08em]">
                  {voce.etichetta}
                </span>
              </Link>
            ))}
            <Link
              href="/richiesta"
              onClick={() => setMenuAperto(false)}
              className="mono block bg-[var(--bordo-pieno)] px-4 py-4 text-center text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--testo-inverso)]"
            >
              Richiedi un progetto
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
