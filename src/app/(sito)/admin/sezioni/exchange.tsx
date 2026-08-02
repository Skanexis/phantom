import { FiltroAdmin } from "@/components/filtro-admin";
import { Icona } from "@/components/icone";
import { Etichetta } from "@/components/ui";
import { etichetteStato } from "@/lib/telegram-bot";
import {
  CRIPTOVALUTE,
  calcolaCommissione,
  formattaEuro,
} from "@/lib/scambio";
import { vocePerRichiesta, type RichiestaConUtente } from "./richieste";

/** Tessera numerica coerente con la striscia in cima al pannello: stesso
 * peso tipografico, così le due letture di dati restano intercambiabili. */
function Tessera({
  valore,
  etichetta,
  accesa = false,
}: {
  valore: string;
  etichetta: string;
  accesa?: boolean;
}) {
  return (
    <div className="border border-[var(--bordo)] p-4 sm:p-5">
      <span
        className={`display block text-[22px] sm:text-[30px] ${
          accesa ? "text-[var(--accento)]" : ""
        }`}
      >
        {valore}
      </span>
      <Etichetta className="mt-1 block">{etichetta}</Etichetta>
    </div>
  );
}

const STATI_CHIUSI = new Set(["COMPLETATA", "ANNULLATA"]);

export function SezioneExchange({
  richieste,
  puoGestire = true,
  puoVedereStatistiche = true,
}: {
  richieste: RichiestaConUtente[];
  /** SUPPORTO vede e risponde, ma non cambia stato né elimina. */
  puoGestire?: boolean;
  /** Cifre di incasso e volumi: fuori portata per chi fa solo supporto. */
  puoVedereStatistiche?: boolean;
}) {
  const completate = richieste.filter((r) => r.stato === "COMPLETATA");
  const inCorso = richieste.filter((r) => !STATI_CHIUSI.has(r.stato));

  const volumeCompletatoCentesimi = completate.reduce(
    (t, r) => t + (r.importoCentesimi ?? 0),
    0,
  );
  const commissioneCompletataCentesimi = completate.reduce(
    (t, r) => t + calcolaCommissione(r.importoCentesimi ?? 0).commissioneCentesimi,
    0,
  );
  const volumeInCorsoCentesimi = inCorso.reduce(
    (t, r) => t + (r.importoCentesimi ?? 0),
    0,
  );

  const perCripto = CRIPTOVALUTE.map((voce) => {
    const suo = richieste.filter((r) => r.criptovaluta === voce.valore);
    return {
      ...voce,
      conteggio: suo.length,
      volumeCentesimi: suo.reduce((t, r) => t + (r.importoCentesimi ?? 0), 0),
    };
  });
  const volumeMassimoCripto = Math.max(
    1,
    ...perCripto.map((v) => v.volumeCentesimi),
  );

  if (richieste.length === 0) {
    return (
      <p className="mono border border-[var(--bordo)] p-5 text-[12.5px] text-[var(--testo-tenue)]">
        Nessuna richiesta di cambio ricevuta.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {puoVedereStatistiche && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tessera
              valore={formattaEuro(commissioneCompletataCentesimi)}
              etichetta="Commissioni incassate"
              accesa
            />
            <Tessera
              valore={formattaEuro(volumeCompletatoCentesimi)}
              etichetta="Volume completato"
            />
            <Tessera
              valore={formattaEuro(volumeInCorsoCentesimi)}
              etichetta="Volume in corso"
            />
            <Tessera
              valore={String(richieste.length)}
              etichetta="Richieste totali"
            />
          </div>

          {/* Barre proporzionali: dire "60% BTC" richiede un calcolo, vedere
              due barre di lunghezza diversa no. */}
          <div className="border border-[var(--bordo)] divide-y divide-[var(--bordo)]">
            {perCripto.map((voce) => (
              <div key={voce.valore} className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="mono flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em]">
                    <Icona
                      nome="cripto"
                      className="h-4 w-4 text-[var(--accento)]"
                    />
                    {voce.valore}
                    <span className="font-normal normal-case text-[var(--testo-debole)]">
                      {voce.etichetta}
                    </span>
                  </span>
                  <span className="mono text-[12px]">
                    {formattaEuro(voce.volumeCentesimi)}
                    <span className="ml-1.5 text-[var(--testo-debole)]">
                      · {voce.conteggio}{" "}
                      {voce.conteggio === 1 ? "richiesta" : "richieste"}
                    </span>
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 w-full bg-[var(--bordo)]">
                  <div
                    className="h-full bg-[var(--accento)]"
                    style={{
                      width: `${Math.max(3, (voce.volumeCentesimi / volumeMassimoCripto) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <FiltroAdmin
        segnaposto="Cerca per cliente o codice…"
        vuoto="Nessuna richiesta di cambio corrisponde ai filtri."
        stati={Object.entries(etichetteStato).map(([valore, etichetta]) => ({
          valore,
          etichetta,
        }))}
        voci={richieste.map((richiesta) => vocePerRichiesta(richiesta, puoGestire))}
      />
    </div>
  );
}
