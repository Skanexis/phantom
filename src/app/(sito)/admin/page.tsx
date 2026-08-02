import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { richiediStaff } from "@/lib/sessione";
import { contaEventiRecenti, segnala } from "@/lib/sorveglianza";
import { ipClient } from "@/lib/rete";
import {
  puoGestireOperazioni,
  puoModificareContenuti,
  puoVedereStatistiche,
} from "@/lib/permessi";
import { formattaPrezzo } from "@/lib/contenuti";
import { statoEffettivo, valoreMensileCentesimi } from "@/lib/abbonamenti";
import { calcolaCommissione } from "@/lib/scambio";
import { SchedeAdmin } from "@/components/schede-admin";
import { BadgeRuolo } from "@/components/badge-ruolo";
import { Etichetta } from "@/components/ui";
import { SezioneRichieste } from "./sezioni/richieste";
import { SezioneExchange } from "./sezioni/exchange";
import { SezioneSottoscrizioni } from "./sezioni/sottoscrizioni";
import { SezioneAbbonamenti } from "./sezioni/abbonamenti";
import { SezioneRuoli } from "./sezioni/ruoli";
import { SezioneSorveglianza } from "./sezioni/sorveglianza";
import {
  SezioneAutomazioni,
  SezioneContatti,
  SezioneFaq,
  SezioneServizi,
  SezioneTesti,
  SezioneVantaggi,
} from "./sezioni/contenuti";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pannello amministrativo — Phantom Lab",
};

export default async function PannelloAdmin() {
  const admin = await richiediStaff();

  if (!admin) {
    // Chi arriva qui senza diritti è, quasi sempre, qualcuno che ha
    // tirato a indovinare l'indirizzo del pannello. Il tentativo va nel
    // giornale di sorveglianza: preso da solo non significa nulla, ripetuto
    // è il preludio a tutto il resto.
    const intestazioni = await headers();
    segnala({
      tipo: "accesso",
      ip: ipClient(intestazioni),
      metodo: "GET",
      percorso: "/admin",
      agente: intestazioni.get("user-agent"),
      dettaglio: "pannello amministrativo senza permessi",
    });

    return (
      <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-24 sm:px-8">
        <div className="crocini relative max-w-md border border-[var(--bordo)] p-8 sm:p-10">
          <Etichetta className="text-[var(--allarme)]">
            Errore · 403 accesso negato
          </Etichetta>
          <h1 className="display mt-5 text-[32px]">Area riservata</h1>
          <p className="mono mt-4 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
            Questa sezione è accessibile solo allo staff.
          </p>
          <Link
            href="/"
            className="mono spinta mt-8 inline-block border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)]"
          >
            Torna alla home
          </Link>
        </div>
      </main>
    );
  }

  // Tre livelli di accesso: il contenuto del sito solo a DEVELOPER, le
  // operazioni (stati, proroghe, assegnazioni) ad ADMIN e DEVELOPER, le
  // cifre di incasso allo stesso gruppo — SUPPORTO vede e risponde soltanto.
  const gestisceContenuti = puoModificareContenuti(admin.ruolo);
  const gestisceOperazioni = puoGestireOperazioni(admin.ruolo);
  const vedeStatistiche = puoVedereStatistiche(admin.ruolo);

  // La sorveglianza è riservata a DEVELOPER: contiene indirizzi IP e
  // user-agent dei visitatori, che non servono a chi risponde ai clienti.
  const eventiSicurezza = gestisceContenuti ? contaEventiRecenti() : 0;

  const [
    abbonamenti,
    richieste,
    richiesteExchange,
    exchangeNuove,
    richiesteNuove,
    messaggiDaLeggere,
    importiExchangeConclusi,
    sottoscrizioni,
    contenuti,
    servizi,
    vantaggi,
    automazioni,
    faq,
    contatti,
    staff,
  ] = await Promise.all([
    prisma.abbonamento.findMany({
      orderBy: { ordine: "asc" },
      include: { funzionalita: { orderBy: { ordine: "asc" } } },
    }),
    prisma.richiesta.findMany({
      orderBy: { creatoIl: "desc" },
      include: { utente: true, messaggi: { orderBy: { creatoIl: "asc" } } },
      take: 50,
    }),
    /**
     * L'elenco degli scambi mostrato nel pannello, limitato come gli altri.
     *
     * Prima questa query non aveva `take`, e portava con sé utente e
     * conversazione completa di ogni scambio mai registrato: serviva solo
     * per due numeri in cima alla pagina, ma il costo cresceva con lo
     * storico e non con quello che si vede. Con qualche centinaio di
     * pratiche significa trascinare a ogni apertura del pannello migliaia
     * di righe di messaggi che nessuno guarda.
     *
     * I due numeri ora arrivano dalle due query qui sotto, che leggono
     * quello che serve e nient'altro.
     */
    prisma.richiesta.findMany({
      where: { ambito: "EXCHANGE" },
      orderBy: { creatoIl: "desc" },
      include: { utente: true, messaggi: { orderBy: { creatoIl: "asc" } } },
      take: 50,
    }),
    // Conteggio sul database: non serve portare in memoria le righe per
    // contarle.
    prisma.richiesta.count({ where: { ambito: "EXCHANGE", stato: "NUOVA" } }),
    /**
     * Le due code che il pannello mette in cima, contate sul database.
     *
     * Prima si ricavavano filtrando l'elenco già caricato, che si ferma
     * alle 50 pratiche più recenti: superata quella soglia i numeri
     * iniziavano a mentire per difetto, e proprio nel verso peggiore —
     * una richiesta nuova o un messaggio senza risposta più in basso
     * nell'elenco semplicemente non venivano contati, quindi nessuno
     * sapeva di doverli guardare. Con qualche centinaio di pratiche il
     * cruscotto avrebbe detto "tutto in ordine" con del lavoro arretrato.
     *
     * Entrambe le query usano indici già presenti nello schema
     * (`@@index([stato, creatoIl])` e `@@index([letto, daAdmin])`).
     */
    prisma.richiesta.count({ where: { stato: "NUOVA" } }),
    prisma.messaggio.count({ where: { daAdmin: false, letto: false } }),
    /**
     * Soli importi degli scambi conclusi, per la somma delle commissioni.
     *
     * Non si usa `aggregate({ _sum })` perché la commissione si arrotonda
     * per singola operazione: sommare prima e applicare la percentuale
     * dopo darebbe un totale diverso di qualche centesimo per riga, e su
     * una cifra di incasso una differenza inventata dall'arrotondamento
     * non è accettabile. Questa resta senza limite di proposito — è il
     * totale di sempre — ma legge una sola colonna di interi, senza join
     * né messaggi: il peso è una frazione di quello di prima.
     */
    prisma.richiesta.findMany({
      where: { ambito: "EXCHANGE", stato: "COMPLETATA" },
      select: { importoCentesimi: true },
    }),
    prisma.abbonamentoUtente.findMany({
      orderBy: { creatoIl: "desc" },
      include: { utente: true, abbonamento: true },
      take: 100,
    }),
    prisma.contenutoSito.findMany({ orderBy: { chiave: "asc" } }),
    prisma.servizio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.vantaggio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.automazione.findMany({ orderBy: { ordine: "asc" } }),
    prisma.faq.findMany({ orderBy: { ordine: "asc" } }),
    prisma.contatto.findMany({ orderBy: { ordine: "asc" } }),
    // Solo lo staff attuale: la tabella utenti può avere migliaia di righe,
    // ma chi ha un ruolo oltre UTENTE è sempre una manciata.
    prisma.utente.findMany({
      where: { ruolo: { in: ["SUPPORTO", "ADMIN", "DEVELOPER"] } },
      orderBy: [{ ruolo: "desc" }, { creatoIl: "asc" }],
    }),
  ]);

  const attivazioniInAttesa = sottoscrizioni.filter(
    (s) => s.stato === "IN_ATTESA",
  ).length;

  // Lo stato effettivo tiene conto delle scadenze passate: senza, il ricavo
  // ricorrente conterebbe anche abbonamenti finiti mesi fa.
  const attivi = sottoscrizioni.filter((s) => statoEffettivo(s) === "ATTIVO");
  const ricorrenteCentesimi = attivi.reduce(
    (totale, s) => totale + valoreMensileCentesimi(s.abbonamento),
    0,
  );

  const sottoscrizioniPerPiano = attivi.reduce<Record<string, number>>(
    (mappa, s) => {
      mappa[s.abbonamentoId] = (mappa[s.abbonamentoId] ?? 0) + 1;
      return mappa;
    },
    {},
  );

  const commissioneExchangeCentesimi = importiExchangeConclusi.reduce(
    (totale, r) =>
      totale + calcolaCommissione(r.importoCentesimi ?? 0).commissioneCentesimi,
    0,
  );

  // Quel che richiede un intervento, in evidenza sopra tutto il resto.
  const daFare =
    richiesteNuove + attivazioniInAttesa + messaggiDaLeggere + exchangeNuove;

  return (
    // Intestazione compatta su mobile: titolo e riepilogo occupavano
    // quasi una schermata prima di arrivare alle schede, che sono ciò
    // per cui il pannello si apre.
    <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-8 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--bordo)] pb-4 sm:pb-6">
          <div>
            <Etichetta className="text-[var(--accento)]">
              Console · Amministrazione
            </Etichetta>
            <div className="mt-2 flex flex-wrap items-center gap-3 sm:mt-4">
              <h1 className="display text-[clamp(1.6rem,6vw,4rem)]">
                Pannello
              </h1>
              <BadgeRuolo ruolo={admin.ruolo} />
            </div>
            <p
              className={`mono mt-2 text-[12px] sm:mt-3 ${
                daFare > 0
                  ? "text-[var(--accento)]"
                  : "text-[var(--testo-tenue)]"
              }`}
            >
              {daFare > 0
                ? `${daFare} ${daFare === 1 ? "voce richiede" : "voci richiedono"} attenzione`
                : "Tutto in ordine, niente in sospeso"}
            </p>
          </div>
          <Link
            href="/"
            className="mono spinta flex min-h-11 items-center border border-[var(--bordo)] px-4 text-[11px] tracking-[0.12em] uppercase max-sm:hidden"
          >
            Vedi il sito →
          </Link>
        </div>

        {/* Su mobile una riga sola di numeri compatti: la griglia 2×2
            costava mezza schermata prima delle schede. Le cifre di incasso
            compaiono solo per chi vede le statistiche: il supporto lavora
            sulle code, non sui guadagni. */}
        <div
          className={`nascondi-barra -mx-4 flex overflow-x-auto border-b border-[var(--bordo)] px-4 sm:mx-0 sm:grid sm:border-l sm:px-0 ${
            vedeStatistiche ? "sm:grid-cols-7" : "sm:grid-cols-5"
          }`}
        >
          {[
            {
              valore: String(richiesteNuove).padStart(2, "0"),
              etichetta: "Da lavorare",
              acceso: richiesteNuove > 0,
            },
            {
              valore: String(attivazioniInAttesa).padStart(2, "0"),
              etichetta: "Attivazioni",
              acceso: attivazioniInAttesa > 0,
            },
            {
              valore: String(messaggiDaLeggere).padStart(2, "0"),
              etichetta: "Messaggi",
              acceso: messaggiDaLeggere > 0,
            },
            {
              valore: String(exchangeNuove).padStart(2, "0"),
              etichetta: "Exchange",
              acceso: exchangeNuove > 0,
            },
            {
              valore: String(attivi.length).padStart(2, "0"),
              etichetta: "Abbonati",
            },
            ...(vedeStatistiche
              ? [
                  {
                    valore: formattaPrezzo(ricorrenteCentesimi, "EUR"),
                    etichetta: "Al mese",
                  },
                  {
                    valore: formattaPrezzo(commissioneExchangeCentesimi, "EUR"),
                    etichetta: "Commissioni",
                  },
                ]
              : []),
          ].map((dato) => (
            <div
              key={dato.etichetta}
              className="shrink-0 border-r border-[var(--bordo)] py-3 pr-5 pl-0 first:pl-0 sm:p-5"
            >
              <span
                className={`display block text-[20px] sm:text-[34px] ${
                  dato.acceso ? "text-[var(--accento)]" : ""
                }`}
              >
                {dato.valore}
              </span>
              <Etichetta className="mt-0.5 block sm:mt-1">
                {dato.etichetta}
              </Etichetta>
            </div>
          ))}
        </div>

        <SchedeAdmin
          schede={[
            {
              id: "richieste",
              etichetta: "Richieste",
              // Nuove più risposte non lette: entrambe aspettano lo staff.
              contatore: richiesteNuove + messaggiDaLeggere,
            },
            {
              id: "sottoscrizioni",
              etichetta: "Sottoscrizioni",
              contatore: attivazioniInAttesa,
            },
            {
              id: "exchange",
              etichetta: "Exchange",
              contatore: exchangeNuove,
            },
            // Il contenuto del sito (piani, testi, vetrina) e la gestione
            // dei ruoli restano riservati a chi ha ruolo DEVELOPER: ADMIN e
            // SUPPORTO non vedono queste schede, non solo non possono
            // salvarle.
            ...(gestisceContenuti
              ? [
                  {
                    id: "sorveglianza",
                    etichetta: "Sorveglianza",
                    // Il contatore porta in cima quello che il pannello non
                    // può dire da fermo: se sta succedendo qualcosa adesso,
                    // si vede dalla barra senza aprire la scheda.
                    contatore: eventiSicurezza,
                  },
                  { id: "ruoli", etichetta: "Ruoli" },
                  { id: "abbonamenti", etichetta: "Piani" },
                  { id: "servizi", etichetta: "Servizi" },
                  { id: "vantaggi", etichetta: "Vantaggi" },
                  { id: "automazioni", etichetta: "Automazioni" },
                  { id: "faq", etichetta: "FAQ" },
                  { id: "contatti", etichetta: "Contatti" },
                  { id: "testi", etichetta: "Testi" },
                ]
              : []),
          ]}
        >
          {{
            richieste: (
              <SezioneRichieste
                richieste={richieste}
                puoGestire={gestisceOperazioni}
              />
            ),
            exchange: (
              <SezioneExchange
                richieste={richiesteExchange}
                puoGestire={gestisceOperazioni}
                puoVedereStatistiche={vedeStatistiche}
              />
            ),
            sottoscrizioni: (
              <SezioneSottoscrizioni
                sottoscrizioni={sottoscrizioni}
                piani={abbonamenti}
                puoGestire={gestisceOperazioni}
              />
            ),
            ...(gestisceContenuti
              ? {
                  sorveglianza: <SezioneSorveglianza />,
                  ruoli: <SezioneRuoli staff={staff} />,
                  abbonamenti: (
                    <SezioneAbbonamenti
                      piani={abbonamenti}
                      sottoscrizioniPerPiano={sottoscrizioniPerPiano}
                    />
                  ),
                  servizi: <SezioneServizi servizi={servizi} />,
                  vantaggi: <SezioneVantaggi vantaggi={vantaggi} />,
                  automazioni: (
                    <SezioneAutomazioni automazioni={automazioni} />
                  ),
                  faq: <SezioneFaq faq={faq} />,
                  contatti: <SezioneContatti contatti={contatti} />,
                  testi: <SezioneTesti contenuti={contenuti} />,
                }
              : {}),
          }}
        </SchedeAdmin>
    </main>
  );
}
