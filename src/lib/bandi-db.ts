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
import { applicaElenchi, type VoceElenco } from "@/lib/bandi";
import type { TipoBando } from "@/generated/prisma/client";

/**
 * Legge bandi attivi, eccezioni e account bloccati, e sostituisce la copia
 * in memoria.
 *
 * I bandi scaduti non vengono cancellati dal database: restano come storico
 * di ciò che è stato deciso — un elenco di provvedimenti che si cancella da
 * solo non è uno storico — e sono semplicemente esclusi da questa lettura.
 */
export async function sincronizzaBandi(): Promise<boolean> {
  try {
    const adesso = new Date();
    const nonScaduto = { OR: [{ scadeIl: null }, { scadeIl: { gt: adesso } }] };

    const [bandi, eccezioni, bloccati] = await Promise.all([
      prisma.bando.findMany({
        where: nonScaduto,
        select: { tipo: true, valore: true, motivo: true, scadeIl: true },
      }),
      prisma.eccezioneRete.findMany({
        where: nonScaduto,
        select: { ip: true },
      }),
      prisma.utente.findMany({
        where: { bloccato: true },
        select: { id: true, motivoBlocco: true },
      }),
    ]);

    const perTipo = (tipo: TipoBando): VoceElenco[] =>
      bandi
        .filter((voce) => voce.tipo === tipo)
        .map((voce) => ({
          valore: voce.valore,
          motivo: voce.motivo,
          scadeIl: voce.scadeIl ? voce.scadeIl.getTime() : null,
        }));

    applicaElenchi({
      ip: perTipo("IP"),
      sottoreti: perTipo("SOTTORETE"),
      dispositivi: perTipo("DISPOSITIVO"),
      account: bloccati.map((utente) => ({
        valore: utente.id,
        motivo: utente.motivoBlocco ?? "",
        scadeIl: null,
      })),
      eccezioni: eccezioni.map((voce) => voce.ip),
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
