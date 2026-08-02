/**
 * Riallineamento degli elenchi di esclusione dal database.
 *
 * Sta a parte da `bandi.ts` per la stessa ragione per cui `allerta.ts` sta
 * a parte da `sorveglianza.ts`: quel modulo lo importa il middleware, e
 * trascinarci dentro Prisma significherebbe caricare il client del
 * database su ogni singola richiesta del sito, comprese quelle che il
 * perimetro respinge in un microsecondo.
 */

import { prisma } from "@/lib/prisma";
import { applicaElenchi } from "@/lib/bandi";

/**
 * Legge bandi attivi e account bloccati e sostituisce la copia in memoria.
 *
 * I bandi scaduti non vengono cancellati dal database: restano come storico
 * di ciò che è stato deciso — un elenco di provvedimenti che si cancella da
 * solo non è uno storico — e sono semplicemente esclusi da questa lettura.
 */
export async function sincronizzaBandi(): Promise<boolean> {
  try {
    const adesso = new Date();

    const [bandi, bloccati] = await Promise.all([
      prisma.bando.findMany({
        where: { OR: [{ scadeIl: null }, { scadeIl: { gt: adesso } }] },
        select: { tipo: true, valore: true },
      }),
      prisma.utente.findMany({
        where: { bloccato: true },
        select: { id: true },
      }),
    ]);

    applicaElenchi({
      ip: bandi.filter((b) => b.tipo === "IP").map((b) => b.valore),
      dispositivi: bandi
        .filter((b) => b.tipo === "DISPOSITIVO")
        .map((b) => b.valore),
      account: bloccati.map((utente) => utente.id),
    });

    return true;
  } catch (eccezione) {
    // Si tiene la copia precedente invece di svuotarla: un guasto alla
    // lettura non deve trasformarsi in un condono generale, che è
    // esattamente ciò che accadrebbe azzerando gli elenchi.
    console.error("[bandi] sincronizzazione fallita:", eccezione);
    return false;
  }
}
