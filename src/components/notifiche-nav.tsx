"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useTelegram, vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { Avatar } from "@/components/avatar";
import { Icona } from "@/components/icone";
import { Freccia } from "@/components/ui";
import { tempoRelativo } from "@/lib/tempo";
import {
  caricaNotifiche,
  scartaNotificheInCache,
} from "@/lib/notifiche-client";

type Notifica = {
  id: string;
  titolo: string;
  testo: string;
  letta: boolean;
  creatoIl: string;
  url?: string | null;
};

/** Altezza della barra di navigazione (`h-14`): il pannello si appoggia
 *  esattamente sotto il suo bordo inferiore, senza fessure. */
const ALTEZZA_BARRA = 56;

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
  const [riquadro, setRiquadro] = useState<{
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  /**
   * Posizione calcolata a mano invece che con `right`/`vw` in CSS.
   *
   * Con contenuto intrinsecamente più largo dello schermo in qualunque
   * punto della pagina (anche se poi tagliato con overflow-hidden, come il
   * nastro scorrevole dell'hero), Chromium può calcolare il "layout
   * viewport" più largo di quello visibile — e ogni valore relativo alla
   * larghezza del viewport (vw, o "right" su un elemento fixed) si sposta
   * di conseguenza. `left`, misurato dall'origine sinistra, e
   * `document.documentElement.clientWidth` restano invece corretti in
   * ogni caso: per questo il pannello si posiziona così invece che con le
   * classi Tailwind `right-*`/`vw`.
   */
  useLayoutEffect(() => {
    if (!aperto) return;

    function aggiorna() {
      const schermo = document.documentElement.clientWidth;
      const alto = window.innerHeight;

      // Su schermo stretto il pannello attraversa lo schermo da bordo a
      // bordo invece di pendere dalla campanella: agganciato all'icona
      // restava una colonna di poche lettere, con titolo e testo spezzati
      // parola per parola. L'altezza è comunque limitata alla porzione
      // sotto la barra, e l'elenco scorre al suo interno: così il pannello
      // non esce mai dallo schermo, per lungo che sia il contenuto.
      if (schermo < 640) {
        setRiquadro({
          left: 0,
          width: schermo,
          maxHeight: Math.max(200, alto - ALTEZZA_BARRA - 16),
        });
        return;
      }

      const margine = 24;
      const larghezza = Math.min(schermo - margine * 2, 420);
      setRiquadro({
        left: Math.max(margine, schermo - margine - larghezza),
        width: larghezza,
        maxHeight: Math.max(200, alto - ALTEZZA_BARRA - 32),
      });
    }

    // Prima del paint: senza, il pannello comparirebbe per un fotogramma
    // nella posizione sbagliata (o senza larghezza) prima di scattare.
    aggiorna();
    window.addEventListener("resize", aggiorna);
    return () => window.removeEventListener("resize", aggiorna);
  }, [aperto]);

  // Lettura condivisa con il pannello dell'area personale: allo stesso
  // evento reagiscono entrambi, e senza la condivisione partirebbero due
  // richieste identiche.
  const carica = () => {
    void caricaNotifiche().then((dati) => {
      if (dati) setNotifiche(dati.notifiche);
    });
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
    // La copia condivisa non riflette più lo stato appena cambiato.
    scartaNotificheInCache();
    fetch("/api/notifiche", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  if (!utente) return null;

  const anteprima = notifiche.slice(0, 3);

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
          {/* Fondale sotto al pannello ma sopra la pagina. La barra è
              `z-50`, quindi resta scoperta: la campanella continua a
              ricevere il tocco e richiude il pannello come ci si aspetta. */}
          {aperto && (
            <motion.button
              type="button"
              aria-label="Chiudi le notifiche"
              onClick={() => setAperto(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/60 sm:bg-black/30"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
        {aperto && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            // "left" in px calcolato in JS, non "right"/vw in CSS: vedi il
            // commento sopra "riquadro" per il perché.
            style={{
              left: riquadro?.left,
              width: riquadro?.width,
              maxHeight: riquadro?.maxHeight,
            }}
            // A tutto schermo il bordo laterale cadrebbe fuori dallo
            // schermo: sotto sm resta solo quello inferiore.
            className="fixed top-14 z-50 flex flex-col border-b border-[var(--bordo)] bg-[var(--sfondo)] shadow-lg sm:border"
          >
            <div className="flex shrink-0 items-center justify-center border-b border-[var(--bordo)] px-5 py-3.5">
              <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--testo-tenue)]">
                {nonLette > 0 ? `${nonLette} da leggere` : "Notifiche"}
              </span>
            </div>

            {anteprima.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-[var(--testo-tenue)]">
                Nessuna notifica per ora.
              </p>
            ) : (
              // min-h-0 è ciò che rende scorrevole l'elenco: senza, il
              // figlio flessibile si allarga oltre il tetto di altezza
              // invece di comprimersi e mostrare la propria barra.
              <div className="nascondi-barra flex min-h-0 flex-1 flex-col overflow-y-auto">
                {anteprima.map((notifica) => {
                  const contenuto = (
                    // Colonna centrata: da bordo a bordo su un telefono
                    // largo il testo resterebbe schiacciato tutto a
                    // sinistra con mezzo pannello vuoto a destra.
                    <span className="mx-auto flex w-full max-w-[440px] gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                          notifica.letta
                            ? "bg-[var(--bordo-forte)]"
                            : "bg-[var(--accento)]"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                            {notifica.titolo}
                          </span>
                          <span className="mono shrink-0 text-[10.5px] text-[var(--testo-debole)]">
                            {tempoRelativo(notifica.creatoIl)}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[13.5px] leading-[1.5] text-[var(--testo-tenue)]">
                          {notifica.testo}
                        </span>
                      </span>
                    </span>
                  );

                  return (
                    <div
                      key={notifica.id}
                      className="border-b border-[var(--bordo)] last:border-b-0"
                    >
                      {notifica.url ? (
                        <Link
                          href={notifica.url}
                          onClick={() => {
                            segnaLetta(notifica.id);
                            setAperto(false);
                          }}
                          className="flex px-5 py-4 transition-colors hover:bg-[var(--sfondo-alt)]"
                        >
                          {contenuto}
                        </Link>
                      ) : (
                        <div className="flex px-5 py-4">{contenuto}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              href="/area-personale?scheda=notifiche"
              onClick={() => setAperto(false)}
              className="mono flex min-h-12 shrink-0 items-center justify-center gap-2 border-t border-[var(--bordo)] px-4 py-3.5 text-[12px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:bg-[var(--sfondo-alt)] hover:text-[var(--accento)]"
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
