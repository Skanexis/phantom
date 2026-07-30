"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { useTelegram, vibra } from "@/components/telegram-provider";
import { InterruttoreTema } from "@/components/interruttore-tema";

const voci = [
  { href: "/#servizi", etichetta: "Servizi", codice: "02" },
  { href: "/#abbonamenti", etichetta: "Abbonamenti", codice: "04" },
  { href: "/#su-misura", etichetta: "Su misura", codice: "05" },
  { href: "/#faq", etichetta: "FAQ", codice: "06" },
];

export function Navigazione() {
  const [menuAperto, setMenuAperto] = useState(false);
  const [nonLette, setNonLette] = useState(0);
  const { utente } = useTelegram();

  const { scrollYProgress } = useScroll();
  const progresso = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  useEffect(() => {
    let annullato = false;

    async function caricaConteggio() {
      if (!utente) {
        if (!annullato) setNonLette(0);
        return;
      }
      try {
        const risposta = await fetch("/api/notifiche");
        const dati = await risposta.json();
        if (!annullato) setNonLette(dati?.nonLette ?? 0);
      } catch {
        if (!annullato) setNonLette(0);
      }
    }

    caricaConteggio();
    return () => {
      annullato = true;
    };
  }, [utente]);

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

      <nav className="mx-auto flex h-14 w-full max-w-[1400px] items-stretch justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="mono flex h-6 w-6 items-center justify-center bg-[var(--accento)] text-[12px] font-bold text-[var(--accento-testo)]">
            P
          </span>
          <span className="mono text-[13px] font-semibold uppercase tracking-[0.14em]">
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

          <Link
            href="/area-personale"
            className="relative mono flex items-center border-l border-[var(--bordo)] px-4 text-[12px] uppercase tracking-[0.1em] transition-colors hover:bg-[var(--accento)] hover:text-[var(--accento-testo)]"
          >
            {utente ? "Account" : "Accedi"}
            <AnimatePresence>
              {nonLette > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="mono absolute right-1.5 top-2 flex h-4 min-w-4 items-center justify-center bg-[var(--allarme)] px-1 text-[9px] font-bold text-white"
                >
                  {nonLette > 9 ? "9+" : nonLette}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

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
                animate={menuAperto ? { rotate: 45, y: 3 } : { rotate: 0, y: 0 }}
                transition={{ duration: 0.18 }}
                className="h-px w-full bg-[var(--testo)]"
              />
              <motion.span
                animate={menuAperto ? { rotate: -45, y: -3 } : { rotate: 0, y: 0 }}
                transition={{ duration: 0.18 }}
                className="h-px w-full bg-[var(--testo)]"
              />
            </div>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuAperto && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-[var(--bordo)] bg-[var(--sfondo)] md:hidden"
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
