"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { tempoRelativo } from "@/lib/tempo";
import { Etichetta, Freccia } from "@/components/ui";
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

export function PannelloNotifiche({
  iniziali,
  altreIniziali = false,
  dentroScheda = false,
}: {
  iniziali: Notifica[];
  /** Se la prima pagina era già piena: mostra "Carica altre" da subito. */
  altreIniziali?: boolean;
  /** Se dentro una scheda, l'etichetta "Notifiche" è già nella barra: qui
   * basta il conteggio e l'azione, senza ripetere il titolo. */
  dentroScheda?: boolean;
}) {
  const [notifiche, setNotifiche] = useState(iniziali);
  const [altreDisponibili, setAltreDisponibili] = useState(altreIniziali);
  const [caricandoAltre, setCaricandoAltre] = useState(false);
  const nonLette = notifiche.filter((n) => !n.letta).length;
  const { ascolta, impostaNonLette } = useFlusso();

  // Una notifica che arriva mentre la pagina è aperta deve comparire in
  // cima subito: prima serviva un ricaricamento per vederla. Unita alla
  // prima pagina invece di sostituire l'elenco intero: altrimenti ogni
  // evento cancellava le pagine già caricate con "Carica altre".
  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.tipo !== "notifica" && evento.tipo !== "messaggio") return;
        // Stessa lettura dell'anteprima nella barra: allo stesso evento
        // reagiscono entrambi, e la richiesta va fatta una volta sola.
        void caricaNotifiche().then((dati) => {
          if (!dati) return;
          setNotifiche((precedenti) => {
            const idFreschi = new Set(dati.notifiche.map((n) => n.id));
            const restanti = precedenti.filter((n) => !idFreschi.has(n.id));
            return [...dati.notifiche, ...restanti];
          });
        });
      }),
    [ascolta],
  );

  async function caricaAltre() {
    const ultima = notifiche.at(-1);
    if (!ultima || caricandoAltre) return;
    vibra();
    setCaricandoAltre(true);
    try {
      const risposta = await fetch(
        `/api/notifiche?prima=${encodeURIComponent(ultima.id)}`,
      );
      const dati = await risposta.json().catch(() => null);
      if (Array.isArray(dati?.notifiche)) {
        setNotifiche((precedenti) => [...precedenti, ...dati.notifiche]);
        setAltreDisponibili(Boolean(dati.altreDisponibili));
      }
    } catch {
      // Si riprova al prossimo tocco: il bottone resta al suo posto.
    } finally {
      setCaricandoAltre(false);
    }
  }

  async function segnaTutte() {
    vibra();
    // Aggiorno subito interfaccia e badge: la conferma dal server arriva dopo.
    setNotifiche((precedenti) =>
      precedenti.map((n) => ({ ...n, letta: true })),
    );
    impostaNonLette(0);
    // La copia condivisa mostra ancora tutto da leggere.
    scartaNotificheInCache();

    try {
      const risposta = await fetch("/api/notifiche", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutte: true }),
      });
      const dati = await risposta.json().catch(() => null);
      if (typeof dati?.nonLette === "number") impostaNonLette(dati.nonLette);
    } catch {
      // In caso di errore ricarico dal server per non mostrare uno stato falso.
      try {
        const risposta = await fetch("/api/notifiche");
        const dati = await risposta.json();
        if (dati?.notifiche) setNotifiche(dati.notifiche);
        if (typeof dati?.nonLette === "number") impostaNonLette(dati.nonLette);
      } catch {
        // Rete non disponibile: si sistema al ricaricamento.
      }
    }
  }

  // A differenza di "segna tutte", qui non si attende risposta: l'utente sta
  // già navigando verso la richiesta, farlo aspettare per un dettaglio come
  // il pallino letto/non letto sarebbe fuori luogo.
  function segnaLetta(id: string) {
    if (notifiche.find((n) => n.id === id)?.letta) return;
    vibra();
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

  if (notifiche.length === 0) {
    if (!dentroScheda) return null;
    return (
      <p className="mono py-8 text-[12.5px] text-[var(--testo-tenue)]">
        Nessuna notifica per ora.
      </p>
    );
  }

  return (
    <section className={dentroScheda ? "" : "mt-12 sm:mt-14"}>
      <div
        className={`flex flex-wrap items-center justify-between gap-x-4 pb-3 ${
          dentroScheda ? "" : "border-b border-[var(--bordo)]"
        }`}
      >
        {dentroScheda ? (
          <span className="mono text-[11px] text-[var(--testo-debole)]">
            {nonLette > 0
              ? `${nonLette} da leggere`
              : "Tutto letto"}
          </span>
        ) : (
          <Etichetta>Notifiche {nonLette > 0 && `· ${nonLette} nuove`}</Etichetta>
        )}
        {nonLette > 0 && (
          <button
            type="button"
            onClick={segnaTutte}
            className="mono flex min-h-11 items-center text-[11px] uppercase tracking-[0.1em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)]"
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      <div>
        {notifiche.map((notifica, indice) => {
          const contenuto = (
            <>
              <span
                aria-hidden="true"
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                  notifica.letta
                    ? "bg-[var(--bordo-forte)]"
                    : "bg-[var(--accento)]"
                }`}
              />
              <div className="min-w-0 flex-1">
                {/* La data va sotto il titolo su mobile: in fondo alla riga
                    comprime il testo in una colonna di poche lettere. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[14.5px] font-semibold tracking-[-0.01em]">
                    {notifica.titolo}
                  </p>
                  <span className="mono shrink-0 text-[10px] tracking-[0.06em] text-[var(--testo-debole)]">
                    {tempoRelativo(notifica.creatoIl)}
                  </span>
                </div>
                <p className="mono mt-1 text-[12.5px] leading-[1.65] break-words text-[var(--testo-tenue)] sm:text-[12px]">
                  {notifica.testo}
                </p>
              </div>
              {notifica.url && (
                <Freccia className="mt-1 h-3 w-3 shrink-0 self-start text-[var(--testo-debole)] transition-transform group-hover:translate-x-1" />
              )}
            </>
          );

          return (
            <motion.div
              key={notifica.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(indice, 8) * 0.03 }}
              className="border-b border-[var(--bordo)]"
            >
              {notifica.url ? (
                <Link
                  href={notifica.url}
                  onClick={() => segnaLetta(notifica.id)}
                  className="group flex gap-3 py-4 transition-colors hover:bg-[var(--sfondo-alt)] sm:gap-4"
                >
                  {contenuto}
                </Link>
              ) : (
                <div className="flex gap-3 py-4 sm:gap-4">{contenuto}</div>
              )}
            </motion.div>
          );
        })}
      </div>

      {altreDisponibili && (
        <button
          type="button"
          onClick={caricaAltre}
          disabled={caricandoAltre}
          className="mono spinta mt-5 flex min-h-11 w-full items-center justify-center border border-[var(--bordo)] px-4 text-[11px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:text-[var(--accento)] disabled:opacity-50"
        >
          {caricandoAltre ? "Carico…" : "Carica altre 20"}
        </button>
      )}
    </section>
  );
}
