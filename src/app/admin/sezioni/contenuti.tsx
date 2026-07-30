import { BloccoNuovo, VoceRichiudibile } from "@/components/blocco-admin";
import {
  AreaTesto,
  BottoneElimina,
  BottoneSalva,
  Campo,
  SelettoreIcona,
  Spunta,
  classiSelettore,
} from "@/components/campi-admin";
import {
  aggiornaContenuto,
  eliminaContatto,
  eliminaFaq,
  eliminaServizio,
  eliminaVantaggio,
  salvaContatto,
  salvaFaq,
  salvaServizio,
  salvaVantaggio,
} from "../azioni";
import type {
  Contatto,
  ContenutoSito,
  Faq,
  Servizio,
  Vantaggio,
} from "@/generated/prisma/client";

/** Indicatore online/nascosto, uguale per tutte le liste di contenuto. */
function Stato({ attivo }: { attivo: boolean }) {
  return (
    <span
      className={`mono border px-2 py-1 text-[10px] uppercase tracking-[0.1em] ${
        attivo
          ? "border-[var(--ok)] text-[var(--ok)]"
          : "border-[var(--bordo)] text-[var(--testo-debole)]"
      }`}
    >
      {attivo ? "Online" : "Nascosto"}
    </span>
  );
}

/** Riga comune a servizi e vantaggi: stessa forma, azioni diverse. */
function CampiOrdineEStato({
  attivo,
  ordine,
  nomeSpunta = "attivo",
  etichettaSpunta = "Attivo",
}: {
  attivo: boolean;
  ordine: number;
  nomeSpunta?: string;
  etichettaSpunta?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
      <div className="w-full sm:w-24">
        <Campo
          etichetta="Ordine"
          nome="ordine"
          tipo="number"
          valore={ordine.toString()}
        />
      </div>
      <Spunta etichetta={etichettaSpunta} nome={nomeSpunta} attivo={attivo} />
      <div className="w-full sm:ml-auto sm:w-auto">
        <BottoneSalva />
      </div>
    </div>
  );
}

export function SezioneServizi({ servizi }: { servizi: Servizio[] }) {
  return (
    <div className="flex flex-col gap-3">
      {servizi.map((servizio) => (
        <VoceRichiudibile
          key={servizio.id}
          titolo={servizio.titolo}
          sottotitolo={servizio.descrizione}
          accessorio={<Stato attivo={servizio.attivo} />}
        >
          <form action={salvaServizio} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={servizio.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etichetta="Titolo"
                nome="titolo"
                valore={servizio.titolo}
                richiesto
              />
              <SelettoreIcona nome="icona" valore={servizio.icona} />
            </div>
            <AreaTesto
              etichetta="Descrizione"
              nome="descrizione"
              valore={servizio.descrizione}
            />
            <CampiOrdineEStato
              attivo={servizio.attivo}
              ordine={servizio.ordine}
            />
          </form>
          <form
            action={eliminaServizio}
            className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4"
          >
            <input type="hidden" name="id" value={servizio.id} />
            <BottoneElimina />
          </form>
        </VoceRichiudibile>
      ))}

      <BloccoNuovo etichetta="Nuovo servizio">
        <form action={salvaServizio} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etichetta="Titolo" nome="titolo" richiesto />
            <SelettoreIcona nome="icona" valore="code" />
          </div>
          <AreaTesto etichetta="Descrizione" nome="descrizione" />
          <div>
            <BottoneSalva testo="Aggiungi servizio" />
          </div>
        </form>
      </BloccoNuovo>
    </div>
  );
}

export function SezioneVantaggi({ vantaggi }: { vantaggi: Vantaggio[] }) {
  return (
    <div className="flex flex-col gap-3">
      {vantaggi.map((vantaggio) => (
        <VoceRichiudibile
          key={vantaggio.id}
          titolo={vantaggio.titolo}
          sottotitolo={vantaggio.descrizione}
          accessorio={<Stato attivo={vantaggio.attivo} />}
        >
          <form action={salvaVantaggio} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={vantaggio.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etichetta="Titolo"
                nome="titolo"
                valore={vantaggio.titolo}
                richiesto
              />
              <SelettoreIcona nome="icona" valore={vantaggio.icona} />
            </div>
            <AreaTesto
              etichetta="Descrizione"
              nome="descrizione"
              valore={vantaggio.descrizione}
            />
            <CampiOrdineEStato
              attivo={vantaggio.attivo}
              ordine={vantaggio.ordine}
            />
          </form>
          <form
            action={eliminaVantaggio}
            className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4"
          >
            <input type="hidden" name="id" value={vantaggio.id} />
            <BottoneElimina />
          </form>
        </VoceRichiudibile>
      ))}

      <BloccoNuovo etichetta="Nuovo vantaggio">
        <form action={salvaVantaggio} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etichetta="Titolo" nome="titolo" richiesto />
            <SelettoreIcona nome="icona" valore="spark" />
          </div>
          <AreaTesto etichetta="Descrizione" nome="descrizione" />
          <div>
            <BottoneSalva testo="Aggiungi vantaggio" />
          </div>
        </form>
      </BloccoNuovo>
    </div>
  );
}

export function SezioneFaq({ faq }: { faq: Faq[] }) {
  return (
    <div className="flex flex-col gap-3">
      {faq.map((voce) => (
        <VoceRichiudibile
          key={voce.id}
          titolo={voce.domanda}
          sottotitolo={voce.risposta}
          accessorio={<Stato attivo={voce.attiva} />}
        >
          <form action={salvaFaq} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={voce.id} />
            <Campo
              etichetta="Domanda"
              nome="domanda"
              valore={voce.domanda}
              richiesto
            />
            <AreaTesto
              etichetta="Risposta"
              nome="risposta"
              valore={voce.risposta}
              righe={3}
            />
            <CampiOrdineEStato
              attivo={voce.attiva}
              ordine={voce.ordine}
              nomeSpunta="attiva"
              etichettaSpunta="Attiva"
            />
          </form>
          <form
            action={eliminaFaq}
            className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4"
          >
            <input type="hidden" name="id" value={voce.id} />
            <BottoneElimina />
          </form>
        </VoceRichiudibile>
      ))}

      <BloccoNuovo etichetta="Nuova domanda">
        <form action={salvaFaq} className="flex flex-col gap-4">
          <Campo etichetta="Domanda" nome="domanda" richiesto />
          <AreaTesto etichetta="Risposta" nome="risposta" righe={3} />
          <div>
            <BottoneSalva testo="Aggiungi FAQ" />
          </div>
        </form>
      </BloccoNuovo>
    </div>
  );
}

export function SezioneContatti({ contatti }: { contatti: Contatto[] }) {
  return (
    <div className="flex flex-col gap-3">
      {contatti.map((contatto) => (
        <VoceRichiudibile
          key={contatto.id}
          titolo={contatto.etichetta}
          sottotitolo={contatto.valore}
          accessorio={<Stato attivo={contatto.attivo} />}
        >
          <form action={salvaContatto} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={contatto.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etichetta="Etichetta"
                nome="etichetta"
                valore={contatto.etichetta}
                richiesto
              />
              <Campo
                etichetta="Valore"
                nome="valore"
                valore={contatto.valore}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etichetta="URL" nome="url" valore={contatto.url} />
              <SelettoreIcona nome="icona" valore={contatto.icona} />
            </div>
            <CampiOrdineEStato
              attivo={contatto.attivo}
              ordine={contatto.ordine}
            />
          </form>
          <form
            action={eliminaContatto}
            className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4"
          >
            <input type="hidden" name="id" value={contatto.id} />
            <BottoneElimina />
          </form>
        </VoceRichiudibile>
      ))}

      <BloccoNuovo etichetta="Nuovo contatto">
        <form action={salvaContatto} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etichetta="Etichetta" nome="etichetta" richiesto />
            <Campo etichetta="Valore" nome="valore" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etichetta="URL" nome="url" />
            <SelettoreIcona nome="icona" valore="link" />
          </div>
          <div>
            <BottoneSalva testo="Aggiungi contatto" />
          </div>
        </form>
      </BloccoNuovo>
    </div>
  );
}

export function SezioneTesti({ contenuti }: { contenuti: ContenutoSito[] }) {
  // Raggruppati per area: l'elenco piatto di chiavi tecniche non dice
  // all'admin quale testo appartiene a quale parte del sito.
  const gruppi = contenuti.reduce<Record<string, ContenutoSito[]>>(
    (mappa, contenuto) => {
      (mappa[contenuto.gruppo] ??= []).push(contenuto);
      return mappa;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(gruppi).map(([gruppo, voci]) => (
        <VoceRichiudibile
          key={gruppo}
          titolo={gruppo}
          sottotitolo={`${voci.length} ${voci.length === 1 ? "testo" : "testi"}`}
        >
          <div className="flex flex-col gap-4">
            {voci.map((contenuto) => (
              <form
                key={contenuto.chiave}
                action={aggiornaContenuto}
                className="flex flex-col gap-2.5 border-b border-dashed border-[var(--bordo)] pb-4 last:border-0 last:pb-0"
              >
                <input type="hidden" name="chiave" value={contenuto.chiave} />
                <span className="mono text-[11px] tracking-[0.08em] text-[var(--accento)]">
                  {contenuto.chiave}
                </span>
                <textarea
                  name="valore"
                  rows={2}
                  defaultValue={contenuto.valore}
                  aria-label={contenuto.chiave}
                  className={`${classiSelettore} resize-none leading-[1.65]`}
                />
                <div className="self-start">
                  <BottoneSalva />
                </div>
              </form>
            ))}
          </div>
        </VoceRichiudibile>
      ))}
    </div>
  );
}
