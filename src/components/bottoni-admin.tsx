"use client";

import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";
import { useAvvisi } from "@/components/avvisi";

/**
 * Pulsanti delle azioni server con riscontro visibile.
 *
 * Salvando, la pagina si limitava a ridisegnarsi: senza conferma non è
 * chiaro se l'operazione sia riuscita o se il tocco sia andato perso.
 * useFormStatus dà lo stato dell'invio senza dover gestire uno stato
 * locale per ogni form del pannello.
 */

/** min-h-11 = 44px, la soglia sotto la quale il tocco diventa impreciso. */
export function BottoneSalva({
  testo = "Salva",
  conferma = "Salvato",
}: {
  testo?: string;
  /** Messaggio del riscontro a operazione conclusa. */
  conferma?: string;
}) {
  const { pending } = useFormStatus();
  const { avvisa } = useAvvisi();

  return (
    <motion.button
      type="submit"
      disabled={pending}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onClick={() => {
        vibra();
        // L'azione server non torna qui: l'avviso parte all'invio, che è
        // il momento in cui l'utente ha bisogno di sapere che è partita.
        setTimeout(() => avvisa(conferma), 400);
      }}
      className="mono spinta flex min-h-11 w-full items-center justify-center gap-2 border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--testo-inverso)] disabled:opacity-60 sm:w-auto sm:text-[11px]"
    >
      {pending && (
        <motion.span
          aria-hidden="true"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
          className="h-3 w-3 border border-current border-t-transparent"
        />
      )}
      {pending ? "Salvo…" : testo}
    </motion.button>
  );
}

export function BottoneElimina({ testo = "Elimina" }: { testo?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={() => vibra("errore")}
      className="mono min-h-11 w-full border border-[var(--bordo)] px-4 py-2.5 text-[12px] uppercase tracking-[0.12em] text-[var(--testo-tenue)] transition-colors hover:border-[var(--allarme)] hover:text-[var(--allarme)] disabled:opacity-60 sm:w-auto sm:text-[11px]"
    >
      {pending ? "Elimino…" : testo}
    </button>
  );
}
