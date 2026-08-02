"use client";

import { useActionState } from "react";
import type { EsitoAzione } from "@/lib/bandi";

/**
 * Un modulo che dice com'è andata.
 *
 * Nasce da un difetto che si ripeteva identico in ogni azione del pannello:
 * le server action uscivano con un `return` muto su ogni controllo fallito,
 * la pagina si ricaricava uguale, e un'operazione riuscita era
 * indistinguibile da una rifiutata. Il caso peggiore non era l'errore
 * evidente ma quello silenzioso — un bando creato con un valore in una forma
 * sbagliata compare in elenco e sembra fatto, e si scopre che non
 * corrispondeva a nessuno solo il giorno in cui serviva.
 *
 * Sta in un componente invece che in ogni modulo perché la parte noiosa —
 * stato in corso, messaggio, colore — è sempre la stessa, e riscriverla ogni
 * volta significa che prima o poi qualcuno la salta.
 */
export function ModuloAzione({
  azione,
  className = "",
  children,
}: {
  azione: (dati: FormData) => Promise<EsitoAzione>;
  className?: string;
  /** Riceve `inCorso` per disabilitare il pulsante durante l'invio. */
  children: React.ReactNode | ((stato: { inCorso: boolean }) => React.ReactNode);
}) {
  const [esito, invia, inCorso] = useActionState(
    async (_precedente: EsitoAzione | null, dati: FormData) => azione(dati),
    null,
  );

  return (
    <form action={invia} className={className}>
      {typeof children === "function" ? children({ inCorso }) : children}

      {esito && (
        <p
          // aria-live: l'esito compare senza che nulla riceva il fuoco, e
          // chi usa un lettore di schermo altrimenti non saprebbe che il
          // pulsante appena premuto ha prodotto una risposta.
          aria-live="polite"
          className={`mono border p-2.5 text-[11px] leading-[1.6] break-words ${
            esito.ok
              ? "border-[var(--ok)] text-[var(--ok)]"
              : "border-[var(--allarme)] text-[var(--allarme)]"
          }`}
        >
          {esito.messaggio}
        </p>
      )}
    </form>
  );
}
