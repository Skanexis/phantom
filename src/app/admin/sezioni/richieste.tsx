import { BadgeStato } from "@/components/badge-stato";
import { FiltroAdmin } from "@/components/filtro-admin";
import { SchedaRichiesta } from "@/components/scheda-richiesta";
import {
  BottoneElimina,
  BottoneSalva,
  classiSelettore,
} from "@/components/campi-admin";
import { ConversazioneAdmin } from "@/components/conversazione-admin";
import { CodiceCopiabile } from "@/components/dettagli";
import { etichetteAmbito, etichetteStato } from "@/lib/telegram-bot";
import { riferimentoUtente } from "@/lib/utenti";
import { tempoRelativo } from "@/lib/tempo";
import {
  aggiornaStatoRichiesta,
  eliminaRichiesta,
  inviaMessaggioAlCliente,
} from "../azioni";
import type { Prisma } from "@/generated/prisma/client";

type RichiestaConUtente = Prisma.RichiestaGetPayload<{
  include: { utente: true; messaggi: true };
}>;

export function SezioneRichieste({
  richieste,
}: {
  richieste: RichiestaConUtente[];
}) {
  if (richieste.length === 0) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
        Nessuna richiesta ricevuta.
      </p>
    );
  }

  return (
    <FiltroAdmin
      segnaposto="Cerca per nome, contatto o testo…"
      vuoto="Nessuna richiesta corrisponde ai filtri."
      stati={Object.entries(etichetteStato).map(([valore, etichetta]) => ({
        valore,
        etichetta,
      }))}
      voci={richieste.map((richiesta) => {
        const cliente = riferimentoUtente(richiesta.utente);
        const daLeggere = richiesta.messaggi.filter(
          (m) => !m.daAdmin && !m.letto,
        ).length;

        return {
          id: richiesta.id,
          stato: richiesta.stato,
          ricerca: [
            richiesta.codice ?? "",
            richiesta.nomeContatto,
            richiesta.contatto,
            richiesta.messaggio,
            richiesta.utente?.username ?? "",
            etichetteAmbito[richiesta.ambito],
          ]
            .join(" ")
            .toLowerCase(),
          contenuto: (
            /* Chiusa mostra una riga sola: con venti richieste aperte tutte
               insieme il pannello diventava chilometri di modulo da scorrere
               per arrivare a quella che serve. */
            <SchedaRichiesta
              titolo={`${etichetteAmbito[richiesta.ambito]} · ${richiesta.nomeContatto}`}
              sottotitolo={`${cliente} · ${tempoRelativo(richiesta.creatoIl)}`}
              daLeggere={daLeggere}
              stato={<BadgeStato stato={richiesta.stato} />}
              intestazione={
                richiesta.codice ? (
                  <CodiceCopiabile
                    codice={richiesta.codice}
                    className="shrink-0 text-[12px] font-bold tracking-[0.08em] text-[var(--accento)]"
                  />
                ) : null
              }
            >
              <dl className="grid gap-1">
                {[
                  ["Cliente", cliente],
                  ...(richiesta.budget ? [["Budget", richiesta.budget]] : []),
                  ["Data", richiesta.creatoIl.toLocaleString("it-IT")],
                ].map(([chiave, valore]) => (
                  // Su mobile l'etichetta va sopra il valore: affiancata
                  // lascerebbe ai contatti lunghi una colonna troppo stretta.
                  <div
                    key={chiave}
                    className="flex flex-col gap-0.5 border-b border-dashed border-[var(--bordo)] py-1.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-2 sm:border-0 sm:py-0"
                  >
                    <dt className="mono text-[10px] tracking-[0.12em] text-[var(--testo-debole)] uppercase sm:w-24 sm:shrink-0">
                      {chiave}
                    </dt>
                    <dd className="mono text-[13px] break-words sm:text-[12px]">
                      {valore}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mono mt-4 border-t border-dashed border-[var(--bordo)] pt-4 text-[13.5px] leading-[1.75] break-words whitespace-pre-line sm:text-[12.5px]">
                {richiesta.messaggio}
              </p>

              {/* Su mobile i campi vanno in colonna e "Elimina" resta
                  staccato in fondo: affiancato a "Aggiorna" finirebbe
                  premuto per sbaglio. */}
              <div className="mt-5 flex flex-col gap-4">
                <form
                  action={aggiornaStatoRichiesta}
                  className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end"
                >
                  <input type="hidden" name="id" value={richiesta.id} />
                  <select
                    name="stato"
                    defaultValue={richiesta.stato}
                    aria-label="Stato della richiesta"
                    className={`${classiSelettore} sm:w-auto`}
                  >
                    {Object.entries(etichetteStato).map(
                      ([valore, etichetta]) => (
                        <option
                          key={valore}
                          value={valore}
                          className="bg-[var(--sfondo)]"
                        >
                          {etichetta}
                        </option>
                      ),
                    )}
                  </select>
                  <input
                    name="nota"
                    placeholder="Nota per il cliente (facoltativa)"
                    aria-label="Nota per il cliente"
                    className={`${classiSelettore} sm:min-w-40 sm:flex-1`}
                  />
                  <BottoneSalva testo="Aggiorna" conferma="Stato aggiornato" />
                </form>

                {/* Chi annulla deve sapere che al cliente resta solo la
                    notifica: la nota diventa l'unica spiegazione. */}
                <p className="mono text-[11px] leading-[1.6] text-[var(--testo-debole)]">
                  Annullando, la richiesta sparisce dall&apos;area personale del
                  cliente e resta solo la notifica: scrivi il motivo nella nota.
                  Qui la pratica rimane e lo stato si può ripristinare.
                </p>

                <form
                  action={eliminaRichiesta}
                  className="border-t border-dashed border-[var(--bordo)] pt-4 sm:border-0 sm:pt-0"
                >
                  <input type="hidden" name="id" value={richiesta.id} />
                  <BottoneElimina />
                </form>
              </div>

              <ConversazioneAdmin
                richiestaId={richiesta.id}
                codice={richiesta.codice}
                cliente={cliente}
                invia={inviaMessaggioAlCliente}
                messaggiIniziali={richiesta.messaggi.map((messaggio) => ({
                  id: messaggio.id,
                  testo: messaggio.testo,
                  daAdmin: messaggio.daAdmin,
                  letto: messaggio.letto,
                  creatoIl: messaggio.creatoIl.toISOString(),
                }))}
              />
            </SchedaRichiesta>
          ),
        };
      })}
    />
  );
}
