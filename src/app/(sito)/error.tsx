"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Etichetta } from "@/components/ui";

/**
 * Confine d'errore per tutte le pagine del sito.
 *
 * Prima non ne esisteva nessuno: un'eccezione dentro un server component —
 * il database che non risponde mentre /admin fa le sue interrogazioni, per
 * dirne una — risaliva fino al confine predefinito di Next, che sotto il
 * layout condiviso non ha nulla da mostrare. Intestazione e piede
 * restavano, in mezzo compariva il vuoto: un guasto che si presenta come
 * una pagina bianca è un guasto che nessuno riesce a riferire.
 *
 * Qui l'errore diventa una schermata leggibile con un modo per uscirne, e
 * il `digest` — l'unica cosa che Next espone in produzione — resta scritto
 * per poterlo incrociare con i log di PM2.
 */
export default function ErroreSito({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In produzione il messaggio vero non arriva al browser: resta nei log
    // del server. Questa riga serve in sviluppo e per la console del
    // browser, dove almeno lo stack è completo.
    console.error("[sito] errore non gestito:", error);
  }, [error]);

  return (
    <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-24 sm:px-8">
      <div className="crocini relative max-w-md border border-[var(--bordo)] p-8 sm:p-10">
        <Etichetta className="text-[var(--allarme)]">
          Errore · pagina non caricata
        </Etichetta>
        <h1 className="display mt-5 text-[32px]">Qualcosa si è rotto</h1>
        <p className="mono mt-4 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
          La pagina non è riuscita a caricarsi. Riprova: se succede di nuovo,
          il guasto è sul server e non dipende da te.
        </p>

        {error.digest && (
          <p className="mono mt-4 border border-[var(--bordo)] p-3 text-[11px] break-all text-[var(--testo-debole)]">
            riferimento: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="mono spinta border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3 text-[12px] font-semibold tracking-[0.14em] text-[var(--testo-inverso)] uppercase"
          >
            Riprova
          </button>
          <Link
            href="/"
            className="mono spinta border border-[var(--bordo)] px-5 py-3 text-[12px] tracking-[0.14em] uppercase"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    </main>
  );
}
