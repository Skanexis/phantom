"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Il logo è il "pulsante nascosto": un doppio clic apre il campo password.
 * Nessuna etichetta visibile, così la pagina resta una semplice pagina di attesa.
 */
export function PortaAccesso() {
  const [aperto, setAperto] = useState(false);
  const [password, setPassword] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const router = useRouter();

  async function sblocca(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setInvio(true);
    setErrore(null);

    try {
      const risposta = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!risposta.ok) {
        const corpo = await risposta.json().catch(() => null);
        setErrore(corpo?.errore ?? "Accesso non riuscito.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setErrore("Connessione non riuscita. Riprova.");
    } finally {
      setInvio(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onDoubleClick={() => setAperto((v) => !v)}
        aria-label="Phantom Lab"
        title=""
        className="mono flex h-11 w-11 cursor-default items-center justify-center bg-[var(--accento)] text-[18px] font-bold text-[var(--accento-testo)] select-none"
      >
        P
      </button>

      <AnimatePresence>
        {aperto && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={sblocca}
            className="overflow-hidden"
          >
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="Password"
                aria-label="Password di accesso"
                className="mono min-w-0 flex-1 border border-[var(--bordo)] bg-[var(--sfondo)] px-4 py-3 text-[13px] text-[var(--testo)] outline-none placeholder:text-[var(--testo-debole)] focus:border-[var(--accento)]"
              />
              <button
                type="submit"
                disabled={invio || password.length === 0}
                className="mono spinta border border-[var(--accento)] bg-[var(--accento)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accento-testo)] disabled:opacity-50"
              >
                {invio ? "Verifica…" : "Entra"}
              </button>
            </div>

            {errore && (
              <p className="mono mt-3 text-[11.5px] text-[var(--allarme)]">
                {errore}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </>
  );
}
