/**
 * Archivio duraturo del registro: scrittura a lotti e potatura per età.
 *
 * Sta a parte da `sorveglianza.ts` per la stessa ragione per cui esistono
 * `allerta.ts` e `bandi-db.ts`: quel modulo lo importa il middleware, e
 * trascinarci dentro Prisma significherebbe caricare il client del database
 * su ogni singola richiesta del sito. Qui invece si può, perché questo
 * codice non gira mai dentro una richiesta dell'utente — lo chiama il
 * compito periodico di `src/instrumentation.ts`.
 *
 * La regola che non va infranta: nulla di ciò che sta qui dentro deve poter
 * rallentare una richiesta. Se il database è lento, si accumula in coda; se
 * è irraggiungibile, le righe tornano in coda e si riprova al giro dopo; se
 * la coda si riempie, si scarta e si dichiara. In nessuno di questi casi
 * qualcuno aspetta.
 */

import { prisma } from "@/lib/prisma";
import { prelevaDaCoda, rimettiInCoda } from "@/lib/sorveglianza";
import { sottorete } from "@/lib/rete";

/** Un anno, come richiesto: è la finestra dell'archivio. */
export const GIORNI_CONSERVAZIONE = 365;

/**
 * Righe per lotto. Un `createMany` è una sola istruzione, quindi il numero
 * conta poco per il numero di viaggi e molto per la dimensione del pacchetto:
 * cinquecento righe da qualche centinaio di byte stanno abbondantemente
 * sotto qualunque limite, e tengono corta la transazione.
 */
const LOTTO = 500;

/** Quanti lotti al massimo per giro: oltre, si continua al giro dopo. */
const LOTTI_PER_GIRO = 6;

/** Righe cancellate per volta dalla potatura. */
const POTATURA_PER_VOLTA = 20_000;

/** La potatura non ha bisogno di girare più di una volta ogni ora. */
const INTERVALLO_POTATURA_MS = 60 * 60 * 1000;

let ultimaPotatura = 0;

/**
 * Svuota la coda nell'archivio. Restituisce quante righe ha scritto.
 *
 * Non solleva mai: gira dentro un timer di sistema, e un'eccezione qui
 * significherebbe un rifiuto non gestito che in Node può abbattere il
 * processo — cioè l'archivio che spegne il sito.
 */
export async function scaricaRegistro(): Promise<number> {
  let scritte = 0;

  for (let giro = 0; giro < LOTTI_PER_GIRO; giro += 1) {
    const righe = prelevaDaCoda(LOTTO);
    if (righe.length === 0) break;

    try {
      await prisma.registroRichiesta.createMany({
        data: righe.map((riga) => ({
          quando: new Date(riga.quando),
          livello: riga.livello,
          metodo: riga.metodo,
          percorso: riga.percorso,
          ip: riga.ip,
          // Calcolata qui e non nel perimetro: è lavoro che serve solo
          // all'archivio, e il percorso caldo non deve pagarlo.
          sottorete: sottorete(riga.ip),
          paese: riga.paese,
          utenteId: riga.utenteId,
          telegramId: riga.telegramId,
          ruolo: riga.ruolo,
          dispositivo: riga.dispositivo,
          agente: riga.agente,
          esito: riga.esito,
          stato: riga.stato,
          tipo: riga.tipo ?? null,
          motivi: riga.motivi.length > 0 ? riga.motivi.join(" · ") : null,
          durataMs: riga.durataMs,
        })),
      });
      scritte += righe.length;
    } catch (eccezione) {
      // Le righe tornano da dove sono venute: un guasto momentaneo non deve
      // aprire un buco nell'archivio. Se il guasto dura, sarà la coda a
      // riempirsi e a dichiarare le perdite — visibile, invece che silenzioso.
      rimettiInCoda(righe);
      console.error("[registro] scrittura fallita:", eccezione);
      break;
    }
  }

  return scritte;
}

/**
 * Cancella le righe più vecchie della finestra di conservazione.
 *
 * A porzioni e con SQL diretto invece che con `deleteMany`, che non accetta
 * un limite: su un archivio di milioni di righe una sola cancellazione
 * aprirebbe una transazione enorme e terrebbe la tabella occupata proprio
 * mentre il sito ci sta scrivendo dentro. Venti mila righe per volta, una
 * volta l'ora, smaltiscono comodamente una giornata di traffico.
 */
export async function potaRegistro(): Promise<number> {
  const adesso = Date.now();
  if (adesso - ultimaPotatura < INTERVALLO_POTATURA_MS) return 0;
  ultimaPotatura = adesso;

  const soglia = new Date(
    adesso - GIORNI_CONSERVAZIONE * 24 * 60 * 60 * 1000,
  );

  try {
    // `ctid` è l'identificatore fisico di riga di PostgreSQL: la sottoquery
    // sceglie le righe con l'indice su `quando`, e la cancellazione le
    // raggiunge senza doverle ricercare una seconda volta.
    return await prisma.$executeRaw`
      DELETE FROM "RegistroRichiesta"
      WHERE ctid IN (
        SELECT ctid FROM "RegistroRichiesta"
        WHERE "quando" < ${soglia}
        LIMIT ${POTATURA_PER_VOLTA}
      )
    `;
  } catch (eccezione) {
    console.error("[registro] potatura fallita:", eccezione);
    return 0;
  }
}
