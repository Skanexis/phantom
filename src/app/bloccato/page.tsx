import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ipClient, sottorete } from "@/lib/rete";
import {
  NOME_COOKIE_DISPOSITIVO,
  identificativoValido,
  valutaEsclusione,
  type CausaEsclusione,
} from "@/lib/bandi";
import { NOME_COOKIE_SESSIONE, verificaTokenSessione } from "@/lib/sessione-token";
import { ModuloRicorso } from "./modulo-ricorso";

/**
 * Schermata mostrata a chi è stato escluso.
 *
 * Sta fuori dal gruppo `(sito)` di proposito, come /manutenzione: chi è
 * bloccato non deve vedere la navigazione, il piede di pagina, il pannello
 * delle notifiche né alcun link su cui ripartire. È una porta chiusa, e una
 * porta chiusa non ha un menù.
 *
 * ---
 *
 * Cosa dice, e perché è cambiato.
 *
 * Fino a ieri questa pagina non diceva né *cosa* fosse stato bloccato né
 * *perché*: il motivo era considerato una nota interna fra chi decide. Il
 * ragionamento non reggeva alla prova dei fatti. Il bando di rete colpisce
 * un intervallo di indirizzi, quindi prende dentro estranei per
 * costruzione, e a un estraneo la schermata muta non lasciava modo né di
 * capire né di reagire: vedeva una porta chiusa senza sapere se fosse per
 * lui, per la sua connessione o per il bar sotto casa.
 *
 * Adesso dice tre cose: quale provvedimento lo riguarda, su quale valore, e
 * il motivo scritto da chi lo ha deciso. La conseguenza va accettata
 * apertamente: quel testo lo legge anche chi è stato bandito a ragione,
 * quindi non è più il posto dove annotare come si è scoperto un abuso — il
 * modulo del pannello lo ricorda a chi scrive, e per le note che restano
 * interne c'è il campo del ricorso.
 *
 * Non compare invece nulla che chi legge non possieda già: il proprio
 * indirizzo, la propria rete, il proprio marcatore. L'identificativo
 * dell'account non esce mai da qui (vedi `EsitoEsclusione.valore`).
 */
export const metadata: Metadata = {
  title: "Accesso revocato — Phantom Lab",
  robots: { index: false, follow: false },
};

const SPIEGAZIONE: Record<
  CausaEsclusione,
  { titolo: string; testo: string; etichettaValore: string }
> = {
  account: {
    titolo: "Account sospeso",
    testo:
      "L'accesso a questo account è stato sospeso da un amministratore. I dati e le pratiche in corso restano al loro posto: la sospensione riguarda l'accesso, non il tuo storico.",
    etichettaValore: "Account",
  },
  ip: {
    titolo: "Connessione non ammessa",
    testo:
      "Le richieste da questo indirizzo non vengono più accettate. Se condividi la rete con altre persone — un ufficio, una rete pubblica — il provvedimento potrebbe non riguardare te direttamente.",
    etichettaValore: "Indirizzo bloccato",
  },
  // Distinta da "ip" perché il provvedimento è diverso e la probabilità di
  // colpire un estraneo è molto più alta: una rete intera contiene centinaia
  // di persone che non c'entrano nulla, e chi legge deve poterlo capire per
  // decidere se vale la pena segnalarlo.
  sottorete: {
    titolo: "Rete non ammessa",
    testo:
      "Il blocco riguarda un intervallo di indirizzi, non il tuo in particolare: viene deciso quando un attacco arriva da più indirizzi della stessa rete. Se sei finito dentro senza averne colpa, segnalalo qui sotto — è il caso per cui questo pulsante esiste.",
    etichettaValore: "Rete bloccata",
  },
  dispositivo: {
    titolo: "Dispositivo non ammesso",
    testo:
      "Le richieste da questo dispositivo non vengono più accettate. Il provvedimento segue il browser, non la connessione.",
    etichettaValore: "Dispositivo",
  },
};

function quandoScade(scadeIl: number | null) {
  if (scadeIl === null) return "senza scadenza";
  const giorni = Math.ceil((scadeIl - Date.now()) / (24 * 60 * 60 * 1000));
  if (giorni <= 0) return "in scadenza";
  if (giorni === 1) return "scade domani";
  return `scade fra ${giorni} giorni`;
}

export default async function Bloccato() {
  /**
   * Lo stato si ricalcola qui invece di arrivare dalla query string.
   *
   * Il middleware conosce già la risposta e potrebbe passarla nell'URL, ma
   * allora motivo e valore finirebbero in un indirizzo — cioè nei log del
   * proxy, nella cronologia del browser e in qualunque link inoltrato. Qui
   * la stessa risposta costa quattro letture da mappe in memoria, ed è
   * esattamente la funzione che ha deciso il blocco: non c'è modo che le
   * due versioni divergano.
   */
  const intestazioni = await headers();
  const biscotti = await cookies();

  const ip = ipClient(intestazioni);
  const cookieDispositivo = biscotti.get(NOME_COOKIE_DISPOSITIVO)?.value;
  const dispositivo = identificativoValido(cookieDispositivo)
    ? (cookieDispositivo as string)
    : null;

  const cookieSessione = biscotti.get(NOME_COOKIE_SESSIONE)?.value;
  const sessione = cookieSessione
    ? await verificaTokenSessione(cookieSessione)
    : null;

  const esito = valutaEsclusione({
    ip,
    dispositivo,
    utenteId: sessione?.utenteId,
  });

  const causa: CausaEsclusione = esito.causa ?? "account";
  const spiegazione = SPIEGAZIONE[causa];

  // Il ricorso ha senso solo per i provvedimenti di rete: un account
  // sospeso ha già un canale — la conversazione con lo staff dentro il
  // proprio profilo — e un ricorso anonimo da lì confonderebbe due strade.
  const ricorribile = causa === "ip" || causa === "sottorete" || causa === "dispositivo";

  return (
    <main className="reticolo flex min-h-screen items-center justify-center px-4 py-10 sm:py-16">
      <div className="crocini relative w-full max-w-lg border border-[var(--allarme)] bg-[var(--sfondo)] p-6 sm:p-10">
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

        <h1 className="display mt-6 text-[clamp(1.8rem,7vw,3rem)]">
          {spiegazione.titolo}
        </h1>

        <p className="mono mt-5 text-[13px] leading-[1.8] text-[var(--testo-tenue)]">
          {spiegazione.testo}
        </p>

        {/* Cosa esattamente è stato bloccato. Il valore è sempre qualcosa
            che chi legge possiede già — il suo indirizzo, la sua rete, il
            marcatore del suo browser — mai un identificativo interno. */}
        <dl className="mt-7 border-t border-[var(--bordo)] pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dashed border-[var(--bordo)] pb-2.5">
            <dt className="mono text-[10.5px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
              {spiegazione.etichettaValore}
            </dt>
            <dd className="mono text-[13px] break-all">
              {esito.valore ?? "il tuo account"}
            </dd>
          </div>

          {causa === "sottorete" && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dashed border-[var(--bordo)] py-2.5">
              <dt className="mono text-[10.5px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
                Il tuo indirizzo
              </dt>
              <dd className="mono text-[13px] break-all">{ip}</dd>
            </div>
          )}

          {esito.motivo && (
            <div className="flex flex-col gap-1 border-b border-dashed border-[var(--bordo)] py-2.5">
              <dt className="mono text-[10.5px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
                Motivo
              </dt>
              <dd className="mono text-[13px] leading-[1.7] break-words">
                {esito.motivo}
              </dd>
            </div>
          )}

          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <dt className="mono text-[10.5px] tracking-[0.12em] text-[var(--testo-debole)] uppercase">
              Durata
            </dt>
            <dd className="mono text-[13px]">{quandoScade(esito.scadeIl)}</dd>
          </div>
        </dl>

        {ricorribile ? (
          <ModuloRicorso
            causa={causa}
            valore={esito.valore ?? ip}
            sottorete={sottorete(ip)}
          />
        ) : (
          <div className="mt-7 border-t border-[var(--bordo)] pt-6">
            <p className="mono text-[12.5px] leading-[1.8] text-[var(--testo-tenue)]">
              Se ritieni che sia un errore, scrivi al nostro bot su Telegram:
              una persona leggerà il messaggio e potrà riesaminare la
              decisione.
            </p>
            {/* Nessun link cliccabile verso il sito: da qui non si torna
                dentro. Il nome del bot è testo, e il contatto avviene su un
                canale che non passa da questo perimetro. */}
            <p className="mono mt-4 border border-[var(--bordo)] p-3 text-[13px] break-all">
              @{process.env.TELEGRAM_BOT_USERNAME ?? "phantomlab_bot"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
