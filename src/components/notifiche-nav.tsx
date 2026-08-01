"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useTelegram, vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { Avatar } from "@/components/avatar";
import { Icona } from "@/components/icone";
import { Freccia } from "@/components/ui";
import { tempoRelativo } from "@/lib/tempo";

type Notifica = {
  id: string;
  titolo: string;
  testo: string;
  letta: boolean;
  creatoIl: string;
  url?: string | null;
};

/**
 * Avatar e campanella al posto del link "Account" in navigazione: l'avatar
 * porta dritto al profilo, la campanella apre un'anteprima delle ultime
 * notifiche senza lasciare la pagina — due gesti diversi non devono
 * condividere lo stesso tocco.
 */
export function NotificheNav() {
  const { utente } = useTelegram();
  const { nonLette, ascolta, impostaNonLette } = useFlusso();
  const [aperto, setAperto] = useState(false);
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);
  const contenitore = useRef<HTMLDivElement>(null);

  const carica = () => {
    fetch("/api/notifiche")
      .then((risposta) => risposta.json())
      .then((dati) => {
        if (Array.isArray(dati?.notifiche)) setNotifiche(dati.notifiche);
      })
      .catch(() => undefined);
  };

  // Precaricate all'accesso: aprendo il pannello deve comparire subito
  // qualcosa, non un vuoto seguito da uno scatto quando arriva la risposta.
  useEffect(() => {
    if (utente) carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utente?.id]);

  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.tipo === "notifica" || evento.tipo === "messaggio") carica();
      }),
    [ascolta],
  );

  useEffect(() => {
    if (!aperto) return;
    function fuori(evento: MouseEvent) {
      if (!contenitore.current?.contains(evento.target as Node)) {
        setAperto(false);
      }
    }
    function esc(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAperto(false);
    }
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperto]);

  function segnaLetta(id: string) {
    if (notifiche.find((n) => n.id === id)?.letta) return;
    setNotifiche((precedenti) =>
      precedenti.map((n) => (n.id === id ? { ...n, letta: true } : n)),
    );
    impostaNonLette(Math.max(0, nonLette - 1));
    fetch("/api/notifiche", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  if (!utente) return null;

  const anteprima = notifiche.slice(0, 2);

  return (
    <div className="flex items-stretch">
      <Link
        href="/area-personale"
        onClick={() => vibra()}
        aria-label="Il tuo profilo"
        className="flex items-center border-l border-[var(--bordo)] px-3.5 transition-colors hover:bg-[var(--sfondo-alt)]"
      >
        <Avatar nome={utente.nome} urlFoto={utente.urlFoto} dimensione={26} />
      </Link>

      <div ref={contenitore} className="relative flex items-stretch">
        <button
          type="button"
          onClick={() => {
            vibra();
            setAperto((v) => !v);
          }}
          aria-label="Notifiche"
          aria-expanded={aperto}
          className="relative flex items-center border-l border-[var(--bordo)] px-3.5 transition-colors hover:bg-[var(--sfondo-alt)]"
        >
          <Icona nome="campanella" className="h-[18px] w-[18px]" />
          <AnimatePresence>
            {nonLette > 0 && (
              <motion.span
                key={nonLette}
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.35, 1] }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                aria-label={`${nonLette} notifiche non lette`}
                className="mono absolute right-0.5 top-1.5 flex h-4 min-w-4 items-center justify-center bg-[var(--allarme)] px-1 text-[9px] font-bold text-white"
              >
                {nonLette > 9 ? "9+" : nonLette}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <AnimatePresence>
        {aperto && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-50 w-[min(92vw,380px)] border border-[var(--bordo)] bg-[var(--sfondo)] shadow-lg"
          >
            <div className="px-5 pt-4 pb-2">
              <span className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--testo-tenue)]">
                {nonLette > 0 ? `${nonLette} da leggere` : "Notifiche"}
              </span>
            </div>

            {anteprima.length === 0 ? (
              <p className="px-5 py-7 text-[14px] text-[var(--testo-tenue)]">
                Nessuna notifica per ora.
              </p>
            ) : (
              <div className="flex flex-col">
                {anteprima.map((notifica, indice) => {
                  const contenuto = (
                    <>
                      <span
                        aria-hidden="true"
                        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                          notifica.letta
                            ? "bg-[var(--bordo-forte)]"
                            : "bg-[var(--accento)]"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                            {notifica.titolo}
                          </p>
                          <span className="mono shrink-0 text-[10.5px] text-[var(--testo-debole)]">
                            {tempoRelativo(notifica.creatoIl)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13.5px] leading-[1.5] text-[var(--testo-tenue)]">
                          {notifica.testo}
                        </p>
                      </div>
                    </>
                  );

                  return (
                    <div
                      key={notifica.id}
                      className={
                        indice === 1
                          ? "max-[380px]:hidden"
                          : undefined
                      }
                    >
                      {notifica.url ? (
                        <Link
                          href={notifica.url}
                          onClick={() => {
                            segnaLetta(notifica.id);
                            setAperto(false);
                          }}
                          className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--sfondo-alt)]"
                        >
                          {contenuto}
                        </Link>
                      ) : (
                        <div className="flex gap-3 px-5 py-3.5">{contenuto}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              href="/area-personale?scheda=notifiche"
              onClick={() => setAperto(false)}
              className="mono mt-1 flex min-h-12 items-center justify-center gap-2 px-4 py-3 text-[12px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:bg-[var(--sfondo-alt)] hover:text-[var(--accento)]"
            >
              Guarda tutte le notifiche
              <Freccia className="h-3 w-3" />
            </Link>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
