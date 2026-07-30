import { BadgeStato } from "@/components/badge-stato";
import { FiltroAdmin } from "@/components/filtro-admin";
import { bloccoAdmin } from "@/components/blocco-admin";
import {
  BottoneElimina,
  BottoneSalva,
  classiSelettore,
} from "@/components/campi-admin";
import { etichetteAmbito, etichetteStato } from "@/lib/telegram-bot";
import { aggiornaStatoRichiesta, eliminaRichiesta } from "../azioni";
import type { Prisma } from "@/generated/prisma/client";

type RichiestaConUtente = Prisma.RichiestaGetPayload<{
  include: { utente: true };
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
      voci={richieste.map((richiesta, indice) => ({
        id: richiesta.id,
        stato: richiesta.stato,
        ricerca: [
          richiesta.nomeContatto,
          richiesta.contatto,
          richiesta.messaggio,
          richiesta.utente?.username ?? "",
          etichetteAmbito[richiesta.ambito],
        ]
          .join(" ")
          .toLowerCase(),
        contenuto: (
          <article className={bloccoAdmin}>
            <div className="flex flex-col gap-3 border-b border-[var(--bordo)] pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex items-baseline gap-3">
                <span className="mono shrink-0 text-[11px] tracking-[0.12em] text-[var(--testo-debole)]">
                  {String(richieste.length - indice).padStart(3, "0")}
                </span>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] break-words">
                  {etichetteAmbito[richiesta.ambito]} · {richiesta.nomeContatto}
                </h3>
              </div>
              <div className="self-start sm:self-auto">
                <BadgeStato stato={richiesta.stato} />
              </div>
            </div>

            <dl className="mt-4 grid gap-1">
              {[
                ["Contatto", richiesta.contatto],
                ...(richiesta.budget ? [["Budget", richiesta.budget]] : []),
                ...(richiesta.utente
                  ? [
                      [
                        "Telegram",
                        richiesta.utente.username
                          ? `@${richiesta.utente.username}`
                          : richiesta.utente.telegramId,
                      ],
                    ]
                  : []),
                ["Data", richiesta.creatoIl.toLocaleString("it-IT")],
              ].map(([chiave, valore]) => (
                // Su mobile l'etichetta va sopra il valore: affiancata
                // lascerebbe ai contatti lunghi una colonna troppo stretta.
                <div
                  key={chiave}
                  className="flex flex-col gap-0.5 border-b border-dashed border-[var(--bordo)] py-1.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-2 sm:border-0 sm:py-0"
                >
                  <dt className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--testo-debole)] sm:w-24 sm:shrink-0">
                    {chiave}
                  </dt>
                  <dd className="mono text-[13px] break-words sm:text-[12px]">
                    {valore}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mono mt-4 whitespace-pre-line border-t border-dashed border-[var(--bordo)] pt-4 text-[13.5px] leading-[1.75] break-words sm:text-[12.5px]">
              {richiesta.messaggio}
            </p>

            {/* Su mobile i campi vanno in colonna e "Elimina" resta staccato
                in fondo: affiancato a "Aggiorna" finirebbe premuto per sbaglio. */}
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
                  {Object.entries(etichetteStato).map(([valore, etichetta]) => (
                    <option
                      key={valore}
                      value={valore}
                      className="bg-[var(--sfondo)]"
                    >
                      {etichetta}
                    </option>
                  ))}
                </select>
                <input
                  name="nota"
                  placeholder="Nota per il cliente (facoltativa)"
                  aria-label="Nota per il cliente"
                  className={`${classiSelettore} sm:min-w-40 sm:flex-1`}
                />
                <BottoneSalva testo="Aggiorna" />
              </form>

              <form
                action={eliminaRichiesta}
                className="border-t border-dashed border-[var(--bordo)] pt-4 sm:border-0 sm:pt-0"
              >
                <input type="hidden" name="id" value={richiesta.id} />
                <BottoneElimina />
              </form>
            </div>
          </article>
        ),
      }))}
    />
  );
}
