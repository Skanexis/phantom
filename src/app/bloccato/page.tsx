import type { Metadata } from "next";

/**
 * Schermata mostrata a chi è stato escluso.
 *
 * Sta fuori dal gruppo `(sito)` di proposito, come /manutenzione: chi è
 * bloccato non deve vedere la navigazione, il piede di pagina, il pannello
 * delle notifiche né alcun link su cui ripartire. È una porta chiusa, e una
 * porta chiusa non ha un menù.
 *
 * Il testo dice cosa è successo e come farsi sentire, e non dice altro. In
 * particolare non dice *perché*: il motivo scritto dallo staff è una nota
 * interna, spesso con dettagli su come è stato scoperto un abuso, e
 * mostrarlo qui equivarrebbe a consegnare a chi ha aggirato le regole il
 * resoconto di come è stato preso.
 */
export const metadata: Metadata = {
  title: "Accesso revocato — Phantom Lab",
  robots: { index: false, follow: false },
};

const SPIEGAZIONE: Record<string, { titolo: string; testo: string }> = {
  account: {
    titolo: "Account sospeso",
    testo:
      "L'accesso a questo account è stato sospeso da un amministratore. I dati e le pratiche in corso restano al loro posto: la sospensione riguarda l'accesso, non il tuo storico.",
  },
  ip: {
    titolo: "Connessione non ammessa",
    testo:
      "Le richieste da questa connessione non vengono più accettate. Se condividi la rete con altre persone — un ufficio, una rete pubblica — il provvedimento potrebbe non riguardare te direttamente.",
  },
  dispositivo: {
    titolo: "Dispositivo non ammesso",
    testo:
      "Le richieste da questo dispositivo non vengono più accettate.",
  },
};

export default async function Bloccato({
  searchParams,
}: {
  searchParams: Promise<{ causa?: string }>;
}) {
  const { causa } = await searchParams;
  const spiegazione = SPIEGAZIONE[causa ?? "account"] ?? SPIEGAZIONE.account;

  return (
    <main className="reticolo flex min-h-screen items-center justify-center px-4 py-16">
      <div className="crocini relative w-full max-w-lg border border-[var(--allarme)] bg-[var(--sfondo)] p-8 sm:p-12">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--allarme)] text-[var(--allarme)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M5.6 5.6l12.8 12.8" />
            </svg>
          </span>
          <span className="mono text-[11px] tracking-[0.16em] text-[var(--allarme)] uppercase">
            Errore · 403 accesso revocato
          </span>
        </div>

        <h1 className="display mt-7 text-[clamp(2rem,7vw,3rem)]">
          {spiegazione.titolo}
        </h1>

        <p className="mono mt-5 text-[13px] leading-[1.8] text-[var(--testo-tenue)]">
          {spiegazione.testo}
        </p>

        <div className="mt-8 border-t border-[var(--bordo)] pt-6">
          <p className="mono text-[12.5px] leading-[1.8] text-[var(--testo-tenue)]">
            Se ritieni che sia un errore, scrivi al nostro bot su Telegram:
            una persona leggerà il messaggio e potrà riesaminare la decisione.
          </p>
          {/* Nessun link cliccabile verso il sito: da qui non si torna
              dentro. Il nome del bot è testo, e il contatto avviene su un
              canale che non passa da questo perimetro. */}
          <p className="mono mt-4 border border-[var(--bordo)] p-3 text-[13px] break-all">
            @{process.env.TELEGRAM_BOT_USERNAME ?? "phantomlab_bot"}
          </p>
        </div>
      </div>
    </main>
  );
}
