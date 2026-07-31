import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { richiediAdmin } from "@/lib/sessione";
import { formattaPrezzo } from "@/lib/contenuti";
import { statoEffettivo, valoreMensileCentesimi } from "@/lib/abbonamenti";
import { Navigazione } from "@/components/navigazione";
import { PiedePagina } from "@/components/piede-pagina";
import { SchedeAdmin } from "@/components/schede-admin";
import { Etichetta } from "@/components/ui";
import { SezioneRichieste } from "./sezioni/richieste";
import { SezioneSottoscrizioni } from "./sezioni/sottoscrizioni";
import { SezioneAbbonamenti } from "./sezioni/abbonamenti";
import {
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
  const admin = await richiediAdmin();

  if (!admin) {
    return (
      <div className="flex min-h-full flex-col">
        <Navigazione />
        <main className="colonne relative mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-24 sm:px-8">
          <div className="crocini relative max-w-md border border-[var(--bordo)] p-8 sm:p-10">
            <Etichetta className="text-[var(--allarme)]">
              Errore · 403 accesso negato
            </Etichetta>
            <h1 className="display mt-5 text-[32px]">Area riservata</h1>
            <p className="mono mt-4 text-[12.5px] leading-[1.7] text-[var(--testo-tenue)]">
              Questa sezione è accessibile solo agli amministratori.
            </p>
            <Link
              href="/"
              className="mono spinta mt-8 inline-block border border-[var(--bordo-pieno)] bg-[var(--bordo-pieno)] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--testo-inverso)]"
            >
              Torna alla home
            </Link>
          </div>
        </main>
        <PiedePagina />
      </div>
    );
  }

  const [
    abbonamenti,
    richieste,
    sottoscrizioni,
    contenuti,
    servizi,
    vantaggi,
    faq,
    contatti,
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
    prisma.abbonamentoUtente.findMany({
      orderBy: { creatoIl: "desc" },
      include: { utente: true, abbonamento: true },
      take: 100,
    }),
    prisma.contenutoSito.findMany({ orderBy: { chiave: "asc" } }),
    prisma.servizio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.vantaggio.findMany({ orderBy: { ordine: "asc" } }),
    prisma.faq.findMany({ orderBy: { ordine: "asc" } }),
    prisma.contatto.findMany({ orderBy: { ordine: "asc" } }),
  ]);

  const richiesteNuove = richieste.filter((r) => r.stato === "NUOVA").length;
  // Messaggi del cliente ancora da leggere: è la coda di risposte che il
  // pannello deve mettere in evidenza quanto le attivazioni.
  const messaggiDaLeggere = richieste.reduce(
    (totale, r) =>
      totale + r.messaggi.filter((m) => !m.daAdmin && !m.letto).length,
    0,
  );
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

  // Quel che richiede un intervento, in evidenza sopra tutto il resto.
  const daFare = richiesteNuove + attivazioniInAttesa + messaggiDaLeggere;

  return (
    <div className="flex min-h-full flex-col">
      <Navigazione />

      {/* Intestazione compatta su mobile: titolo e riepilogo occupavano
          quasi una schermata prima di arrivare alle schede, che sono ciò
          per cui il pannello si apre. */}
      <main className="colonne relative mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-8 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--bordo)] pb-4 sm:pb-6">
          <div>
            <Etichetta className="text-[var(--accento)]">
              Console · Amministrazione
            </Etichetta>
            <h1 className="display mt-2 text-[clamp(1.6rem,6vw,4rem)] sm:mt-4">
              Pannello
            </h1>
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
            costava mezza schermata prima delle schede. */}
        <div className="nascondi-barra -mx-4 flex overflow-x-auto border-b border-[var(--bordo)] px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:border-l sm:px-0">
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
              valore: String(attivi.length).padStart(2, "0"),
              etichetta: "Abbonati",
            },
            {
              valore: formattaPrezzo(ricorrenteCentesimi, "EUR"),
              etichetta: "Al mese",
            },
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
              // Nuove più risposte non lette: entrambe aspettano l'admin.
              contatore: richiesteNuove + messaggiDaLeggere,
            },
            {
              id: "sottoscrizioni",
              etichetta: "Sottoscrizioni",
              contatore: attivazioniInAttesa,
            },
            { id: "abbonamenti", etichetta: "Piani" },
            { id: "servizi", etichetta: "Servizi" },
            { id: "vantaggi", etichetta: "Vantaggi" },
            { id: "faq", etichetta: "FAQ" },
            { id: "contatti", etichetta: "Contatti" },
            { id: "testi", etichetta: "Testi" },
          ]}
        >
          {{
            richieste: <SezioneRichieste richieste={richieste} />,
            sottoscrizioni: (
              <SezioneSottoscrizioni
                sottoscrizioni={sottoscrizioni}
                piani={abbonamenti}
              />
            ),
            abbonamenti: (
              <SezioneAbbonamenti
                piani={abbonamenti}
                sottoscrizioniPerPiano={sottoscrizioniPerPiano}
              />
            ),
            servizi: <SezioneServizi servizi={servizi} />,
            vantaggi: <SezioneVantaggi vantaggi={vantaggi} />,
            faq: <SezioneFaq faq={faq} />,
            contatti: <SezioneContatti contatti={contatti} />,
            testi: <SezioneTesti contenuti={contenuti} />,
          }}
        </SchedeAdmin>
      </main>

      <PiedePagina />
    </div>
  );
}
