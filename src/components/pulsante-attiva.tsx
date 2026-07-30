"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { vibra } from "@/components/telegram-provider";

type Stato = "pronto" | "invio" | "fatto" | "errore";

export function PulsanteAttiva({
  slug,
  nome,
  inEvidenza,
}: {
  slug: string;
  nome: string;
  inEvidenza: boolean;
}) {
  const [stato, setStato] = useState<Stato>("pronto");
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const router = useRouter();

  async function attiva() {
    if (stato === "invio" || stato === "fatto") return;

    setStato("invio");
    setMessaggio(null);

    try {
      const risposta = await fetch("/api/abbonamenti/attiva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const corpo = await risposta.json().catch(() => null);

      if (!risposta.ok) {
        // Senza account porto l'utente alla pagina di accesso.
        if (risposta.status === 401) {
          router.push("/area-personale");
          return;
        }
        setStato("errore");
        setMessaggio(corpo?.errore ?? "Attivazione non riuscita.");
        vibra("errore");
        // Con un piano già attivo il passaggio si fa dall'area personale,
        // dove c'è il pannello di cambio: lascio il tempo di leggere il
        // motivo, poi porto l'utente dove può agire.
        if (corpo?.cambioPiano) {
          setTimeout(() => router.push("/area-personale"), 1800);
        }
        return;
      }

      setStato("fatto");
      vibra("successo");
      router.refresh();
    } catch {
      setStato("errore");
      setMessaggio("Connessione non riuscita. Riprova.");
      vibra("errore");
    }
  }

  const etichette: Record<Stato, string> = {
    pronto: `Attiva ${nome}`,
    invio: "Invio…",
    fatto: "✓ Richiesta inviata",
    errore: "Riprova",
  };

  const disabilitato = stato === "invio" || stato === "fatto";

  return (
    <div className="mt-7 flex flex-col gap-2">
      <button
        type="button"
        onClick={attiva}
        disabled={disabilitato}
        className={`mono spinta w-full border px-5 py-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] disabled:cursor-default ${
          stato === "fatto"
            ? "border-[var(--ok)] text-[var(--ok)]"
            : stato === "errore"
              ? "border-[var(--allarme)] text-[var(--allarme)]"
              : inEvidenza
                ? "border-[var(--accento)] bg-[var(--accento)] text-[var(--accento-testo)]"
                : "border-[var(--bordo-forte)] text-[var(--testo)]"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={stato}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="block"
          >
            {etichette[stato]}
          </motion.span>
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {messaggio && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mono text-[11px] leading-relaxed text-[var(--allarme)]"
          >
            {messaggio}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
