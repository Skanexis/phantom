"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useFlusso } from "@/components/flusso-provider";
import { tempoRelativo } from "@/lib/tempo";
import { Etichetta } from "@/components/ui";

type Notifica = {
  id: string;
  titolo: string;
  testo: string;
  letta: boolean;
  creatoIl: string;
};

export function PannelloNotifiche({ iniziali }: { iniziali: Notifica[] }) {
  const [notifiche, setNotifiche] = useState(iniziali);
  const nonLette = notifiche.filter((n) => !n.letta).length;
  const { ascolta, impostaNonLette } = useFlusso();

  // Una notifica che arriva mentre la pagina è aperta deve comparire in
  // cima subito: prima serviva un ricaricamento per vederla.
  useEffect(
    () =>
      ascolta((evento) => {
        if (evento.tipo !== "notifica" && evento.tipo !== "messaggio") return;
        fetch("/api/notifiche")
          .then((risposta) => risposta.json())
          .then((dati) => {
            if (Array.isArray(dati?.notifiche)) setNotifiche(dati.notifiche);
          })
          .catch(() => undefined);
      }),
    [ascolta],
  );

  async function segnaTutte() {
    vibra();
    // Aggiorno subito interfaccia e badge: la conferma dal server arriva dopo.
    setNotifiche((precedenti) =>
      precedenti.map((n) => ({ ...n, letta: true })),
    );
    impostaNonLette(0);

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

  if (notifiche.length === 0) return null;

  return (
    <section className="mt-12 sm:mt-14">
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-[var(--bordo)] pb-3">
        <Etichetta>Notifiche {nonLette > 0 && `· ${nonLette} nuove`}</Etichetta>
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
        {notifiche.map((notifica, indice) => (
          <motion.div
            key={notifica.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(indice, 8) * 0.03 }}
            className="flex gap-3 border-b border-[var(--bordo)] py-4 sm:gap-4"
          >
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
          </motion.div>
        ))}
      </div>
    </section>
  );
}
