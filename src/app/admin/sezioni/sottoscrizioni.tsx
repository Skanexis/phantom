import { BadgeStato } from "@/components/badge-stato";
import { FiltroAdmin } from "@/components/filtro-admin";
import { BloccoNuovo, bloccoAdmin } from "@/components/blocco-admin";
import { BottoneSalva, Campo, classiSelettore } from "@/components/campi-admin";
import { etichetteStatoAbbonamento } from "@/lib/telegram-bot";
import { riferimentoUtente } from "@/lib/utenti";
import { formattaPrezzo } from "@/lib/contenuti";
import {
  dataBreve,
  giorniAllaScadenza,
  statoEffettivo,
} from "@/lib/abbonamenti";
import {
  aggiornaStatoSottoscrizione,
  assegnaAbbonamento,
  prorogaSottoscrizione,
} from "../azioni";
import type { Abbonamento, Prisma } from "@/generated/prisma/client";

type SottoscrizioneCompleta = Prisma.AbbonamentoUtenteGetPayload<{
  include: { utente: true; abbonamento: true };
}>;

/** Etichetta di scadenza con il tono giusto: scaduto, in arrivo o normale. */
function Scadenza({ scadeIl }: { scadeIl: Date | null }) {
  if (!scadeIl) return null;

  const giorni = giorniAllaScadenza(scadeIl);
  if (giorni === null) return null;

  const colore =
    giorni < 0
      ? "text-[var(--allarme)]"
      : giorni <= 7
        ? "text-[var(--accento)]"
        : "text-[var(--testo-tenue)]";

  const testo =
    giorni < 0
      ? `Scaduto il ${dataBreve(scadeIl)}`
      : giorni === 0
        ? "Scade oggi"
        : `Rinnovo ${dataBreve(scadeIl)} · ${giorni}g`;

  return <span className={`mono text-[12px] ${colore}`}>{testo}</span>;
}

export function SezioneSottoscrizioni({
  sottoscrizioni,
  piani,
}: {
  sottoscrizioni: SottoscrizioneCompleta[];
  piani: Abbonamento[];
}) {
  const assegnazione = (
    <BloccoNuovo etichetta="Assegna un piano a un utente">
      <form action={assegnaAbbonamento} className="flex flex-col gap-4">
        <Campo
          etichetta="Utente (@username o ID Telegram)"
          nome="utente"
          richiesto
          placeholder="@mario o 123456789"
        />
        <label className="flex flex-col gap-2">
          <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--testo-tenue)] sm:text-[10px]">
            Piano
          </span>
          <select name="abbonamentoId" className={classiSelettore} required>
            {piani.map((piano) => (
              <option
                key={piano.id}
                value={piano.id}
                className="bg-[var(--sfondo)]"
              >
                {piano.nome} ·{" "}
                {formattaPrezzo(piano.prezzoCentesimi, piano.valuta)}/
                {piano.periodo}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etichetta="Scadenza (vuoto = un ciclo del piano)"
          nome="scadeIl"
          tipo="date"
        />
        <p className="mono text-[11px] leading-[1.6] text-[var(--testo-debole)]">
          Il piano parte subito come attivo e l&apos;utente riceve la notifica
          su Telegram. Eventuali piani aperti vengono annullati.
        </p>
        <div>
          <BottoneSalva testo="Assegna piano" />
        </div>
      </form>
    </BloccoNuovo>
  );

  if (sottoscrizioni.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {assegnazione}
        <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
          Nessuna sottoscrizione registrata.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {assegnazione}

      <FiltroAdmin
        segnaposto="Cerca per utente o piano…"
        vuoto="Nessuna sottoscrizione corrisponde ai filtri."
        stati={Object.entries(etichetteStatoAbbonamento).map(
          ([valore, etichetta]) => ({ valore, etichetta }),
        )}
        voci={sottoscrizioni.map((sottoscrizione) => {
          // Filtri e badge usano lo stato reale: un ATTIVO con la data
          // passata è scaduto, anche se il database non è ancora allineato.
          const stato = statoEffettivo(sottoscrizione);
          // Username seguito dall'ID: gli username cambiano, l'ID no.
          const utente = riferimentoUtente(sottoscrizione.utente);

          return {
            id: sottoscrizione.id,
            stato,
            ricerca: [
              sottoscrizione.codice ?? "",
              utente,
              sottoscrizione.utente.nome ?? "",
              sottoscrizione.abbonamento.nome,
              sottoscrizione.note ?? "",
            ]
              .join(" ")
              .toLowerCase(),
            contenuto: (
              <article className={bloccoAdmin}>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex items-baseline gap-3">
                    {sottoscrizione.codice && (
                      <span className="mono shrink-0 text-[12px] font-bold tracking-[0.08em] text-[var(--accento)]">
                        {sottoscrizione.codice}
                      </span>
                    )}
                    <h3 className="text-[17px] font-semibold tracking-[-0.01em] break-words">
                      {sottoscrizione.abbonamento.nome}
                    </h3>
                  </div>
                  <div className="self-start sm:self-auto">
                    <BadgeStato stato={stato} tipo="abbonamento" />
                  </div>
                </div>

                {/* In colonna su mobile: i dati separati da "·" su una riga
                    sola diventano illeggibili quando vanno a capo. */}
                <dl className="mono mt-3 flex flex-col gap-1 text-[13px] text-[var(--testo-tenue)] sm:mt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:text-[12px]">
                  <dd className="break-words text-[var(--testo)]">{utente}</dd>
                  <dd className="hidden sm:block" aria-hidden="true">
                    ·
                  </dd>
                  <dd>
                    {formattaPrezzo(
                      sottoscrizione.abbonamento.prezzoCentesimi,
                      sottoscrizione.abbonamento.valuta,
                    )}
                    /{sottoscrizione.abbonamento.periodo}
                  </dd>
                  <dd className="hidden sm:block" aria-hidden="true">
                    ·
                  </dd>
                  <dd>
                    <Scadenza scadeIl={sottoscrizione.scadeIl} />
                  </dd>
                </dl>

                {sottoscrizione.note && (
                  <p className="mono mt-2 border-l-2 border-[var(--accento)] pl-3 text-[11.5px] leading-[1.6] text-[var(--testo-tenue)]">
                    {sottoscrizione.note}
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-3">
                  <form
                    action={aggiornaStatoSottoscrizione}
                    className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end"
                  >
                    <input type="hidden" name="id" value={sottoscrizione.id} />
                    <select
                      name="stato"
                      defaultValue={sottoscrizione.stato}
                      aria-label="Stato della sottoscrizione"
                      className={`${classiSelettore} sm:w-auto`}
                    >
                      {Object.entries(etichetteStatoAbbonamento).map(
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
                    <label className="flex flex-col gap-1.5 sm:w-44">
                      <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--testo-debole)]">
                        Scadenza
                      </span>
                      <input
                        type="date"
                        name="scadeIl"
                        defaultValue={
                          sottoscrizione.scadeIl
                            ? sottoscrizione.scadeIl.toISOString().slice(0, 10)
                            : ""
                        }
                        aria-label="Data di scadenza"
                        className={classiSelettore}
                      />
                    </label>
                    <BottoneSalva testo="Aggiorna" />
                  </form>

                  <form
                    action={prorogaSottoscrizione}
                    className="border-t border-dashed border-[var(--bordo)] pt-3"
                  >
                    <input type="hidden" name="id" value={sottoscrizione.id} />
                    <button
                      type="submit"
                      className="mono spinta min-h-11 w-full border border-[var(--accento)] px-4 py-2.5 text-[12px] uppercase tracking-[0.12em] text-[var(--accento)] sm:w-auto sm:text-[11px]"
                    >
                      + Rinnova di un ciclo
                    </button>
                  </form>
                </div>
              </article>
            ),
          };
        })}
      />
    </div>
  );
}
