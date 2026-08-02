import { BloccoNuovo, VoceRichiudibile } from "@/components/blocco-admin";
import {
  AreaTesto,
  BottoneElimina,
  BottoneSalva,
  Campo,
  Spunta,
  classiSelettore,
} from "@/components/campi-admin";
import { Etichetta } from "@/components/ui";
import { formattaPrezzo } from "@/lib/contenuti";
import {
  aggiornaAbbonamento,
  aggiungiFunzionalita,
  creaAbbonamento,
  eliminaAbbonamento,
  eliminaFunzionalita,
} from "../azioni";
import type { Prisma } from "@/generated/prisma/client";

type PianoConFunzioni = Prisma.AbbonamentoGetPayload<{
  include: { funzionalita: true };
}>;

export function SezioneAbbonamenti({
  piani,
  sottoscrizioniPerPiano,
}: {
  piani: PianoConFunzioni[];
  /** Quante sottoscrizioni attive ha ogni piano: guida la scelta dell'admin. */
  sottoscrizioniPerPiano: Record<string, number>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {piani.map((piano) => {
        const attive = sottoscrizioniPerPiano[piano.id] ?? 0;

        return (
          <VoceRichiudibile
            key={piano.id}
            titolo={piano.nome}
            sottotitolo={`${formattaPrezzo(piano.prezzoCentesimi, piano.valuta)}/${piano.periodo} · ${attive} ${attive === 1 ? "attivo" : "attivi"}`}
            accessorio={
              <span
                className={`mono border px-2 py-1 text-[10px] uppercase tracking-[0.1em] ${
                  piano.attivo
                    ? "border-[var(--ok)] text-[var(--ok)]"
                    : "border-[var(--bordo)] text-[var(--testo-debole)]"
                }`}
              >
                {piano.attivo ? "Online" : "Bozza"}
              </span>
            }
          >
            <form action={aggiornaAbbonamento} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={piano.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  etichetta="Nome"
                  nome="nome"
                  valore={piano.nome}
                  richiesto
                />
                <Campo
                  etichetta="Prezzo (€)"
                  nome="prezzo"
                  tipo="number"
                  step="0.01"
                  valore={(piano.prezzoCentesimi / 100).toString()}
                />
              </div>

              <Campo
                etichetta="Sottotitolo"
                nome="sottotitolo"
                valore={piano.sottotitolo}
              />
              <AreaTesto
                etichetta="Descrizione"
                nome="descrizione"
                valore={piano.descrizione}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  etichetta="Periodo (mese, anno…)"
                  nome="periodo"
                  valore={piano.periodo}
                />
                <Campo
                  etichetta="Ordine"
                  nome="ordine"
                  tipo="number"
                  valore={piano.ordine.toString()}
                />
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
                <div className="flex gap-4">
                  <Spunta
                    etichetta="Attivo"
                    nome="attivo"
                    attivo={piano.attivo}
                  />
                  <Spunta
                    etichetta="Evidenza"
                    nome="inEvidenza"
                    attivo={piano.inEvidenza}
                  />
                </div>
                <div className="w-full sm:ml-auto sm:w-auto">
                  <BottoneSalva />
                </div>
              </div>
            </form>

            <div className="mt-6 border-t border-[var(--bordo)] pt-4">
              <Etichetta>Funzionalità incluse</Etichetta>
              <ul className="mt-3">
                {piano.funzionalita.map((funzione) => (
                  <li
                    key={funzione.id}
                    className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--bordo)] py-2"
                  >
                    <span className="mono text-[12px]">
                      <span className="text-[var(--accento)]">+ </span>
                      {funzione.testo}
                    </span>
                    <form action={eliminaFunzionalita}>
                      <input type="hidden" name="id" value={funzione.id} />
                      <button
                        type="submit"
                        aria-label={`Rimuovi ${funzione.testo}`}
                        className="mono flex h-10 w-10 items-center justify-center text-[15px] text-[var(--testo-debole)] transition-colors hover:text-[var(--allarme)]"
                      >
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>

              <form
                action={aggiungiFunzionalita}
                className="mt-4 flex flex-col gap-2 sm:flex-row"
              >
                <input type="hidden" name="abbonamentoId" value={piano.id} />
                <input
                  name="testo"
                  required
                  placeholder="Nuova funzionalità"
                  aria-label="Nuova funzionalità"
                  className={`${classiSelettore} sm:flex-1`}
                />
                <BottoneSalva testo="Aggiungi" />
              </form>
            </div>

            <form
              action={eliminaAbbonamento}
              className="mt-5 border-t border-dashed border-[var(--bordo)] pt-4"
            >
              <input type="hidden" name="id" value={piano.id} />
              <BottoneElimina
                testo={attive > 0 ? "Disattiva piano" : "Elimina piano"}
              />
              {attive > 0 && (
                <p className="mono mt-2 text-[11px] leading-[1.6] text-[var(--testo-debole)]">
                  Ha {attive} sottoscrizioni collegate: viene disattivato, non
                  eliminato, per non perdere lo storico.
                </p>
              )}
            </form>
          </VoceRichiudibile>
        );
      })}

      <BloccoNuovo etichetta="Nuovo piano">
        <form action={creaAbbonamento} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etichetta="Nome"
              nome="nome"
              richiesto
              placeholder="Es. Catalogo Pro"
            />
            <Campo
              etichetta="Prezzo (€)"
              nome="prezzo"
              tipo="number"
              step="0.01"
              valore="0"
            />
          </div>
          <AreaTesto etichetta="Descrizione" nome="descrizione" />
          <p className="mono text-[11px] text-[var(--testo-debole)]">
            Il piano viene creato disattivato: attivalo quando è pronto.
          </p>
          <div>
            <BottoneSalva testo="Crea piano" />
          </div>
        </form>
      </BloccoNuovo>
    </div>
  );
}
