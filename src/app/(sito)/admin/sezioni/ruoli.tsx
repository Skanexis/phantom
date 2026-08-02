import { BloccoNuovo } from "@/components/blocco-admin";
import { BadgeRuolo } from "@/components/badge-ruolo";
import {
  BottoneElimina,
  BottoneSalva,
  Campo,
  classiSelettore,
} from "@/components/campi-admin";
import { Etichetta } from "@/components/ui";
import { riferimentoUtente } from "@/lib/utenti";
import { impostaRuoloUtente } from "../azioni";
import type { Utente } from "@/generated/prisma/client";

const OPZIONI_RUOLO = [
  { valore: "SUPPORTO", etichetta: "Supporto" },
  { valore: "ADMIN", etichetta: "Admin" },
  { valore: "UTENTE", etichetta: "Utente (rimuove l'accesso staff)" },
] as const;

export function SezioneRuoli({ staff }: { staff: Utente[] }) {
  return (
    <div className="flex flex-col gap-6">
      <BloccoNuovo etichetta="Cambia il ruolo di un utente">
        <form action={impostaRuoloUtente} className="flex flex-col gap-4">
          <Campo
            etichetta="Utente (@username o ID Telegram)"
            nome="utente"
            richiesto
            placeholder="@mario o 123456789"
          />
          <label className="flex flex-col gap-2">
            <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--testo-tenue)] sm:text-[10px]">
              Nuovo ruolo
            </span>
            <select
              name="ruolo"
              className={classiSelettore}
              required
              defaultValue="SUPPORTO"
            >
              {OPZIONI_RUOLO.map((opzione) => (
                <option
                  key={opzione.valore}
                  value={opzione.valore}
                  className="bg-[var(--sfondo)]"
                >
                  {opzione.etichetta}
                </option>
              ))}
            </select>
          </label>
          <p className="mono text-[11px] leading-[1.6] text-[var(--testo-debole)]">
            Developer non è tra le opzioni: si assegna solo dalla console del
            server, mai da qui. Un utente con quel ruolo non compare neanche
            fra quelli modificabili sotto.
          </p>
          <div>
            <BottoneSalva testo="Applica ruolo" conferma="Ruolo aggiornato" />
          </div>
        </form>
      </BloccoNuovo>

      <div>
        <Etichetta className="block pb-3">Staff attuale</Etichetta>
        {staff.length === 0 ? (
          <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
            Nessun membro dello staff oltre a te.
          </p>
        ) : (
          <div className="border border-[var(--bordo)] divide-y divide-[var(--bordo)]">
            {staff.map((utente) => (
              <div
                key={utente.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold tracking-[-0.01em]">
                    {riferimentoUtente(utente)}
                  </p>
                  {utente.nome && (
                    <p className="mono mt-0.5 text-[11px] text-[var(--testo-debole)]">
                      {utente.nome}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <BadgeRuolo ruolo={utente.ruolo} />
                  {utente.ruolo === "DEVELOPER" ? (
                    <span className="mono text-[10.5px] text-[var(--testo-debole)]">
                      Gestito da console
                    </span>
                  ) : (
                    <form action={impostaRuoloUtente}>
                      <input type="hidden" name="utente" value={utente.telegramId} />
                      <input type="hidden" name="ruolo" value="UTENTE" />
                      <BottoneElimina testo="Rimuovi ruolo" />
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
