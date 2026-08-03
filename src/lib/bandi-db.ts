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
 * Ogni quanto rileggere gli elenchi dal database.
 *
 * Erano venti secondi, cioè tre interrogazioni ogni venti secondi per
 * sempre, e quasi tutte per scoprire che non era cambiato niente.
 *
 * Il punto è che questa lettura non è il modo in cui un bando entra in
 * vigore: chi lo crea aggiorna la propria copia in memoria all'istante
 * (`aggiungiLocale` in azioni.ts), e PM2 avvia una sola istanza in fork
 * (vedi `instances: 1` in ecosystem.config.js). Con un processo solo, quel
 * processo è già allineato nel momento in cui decide. Questa
 * sincronizzazione serve a due casi soli: il riavvio, e le modifiche fatte
 * fuori dall'applicazione — direttamente a database, o da un altro
 * processo.
 *
 * ATTENZIONE, condizione di reversibilità: passando a più istanze PM2
 * questo valore va riportato a venti secondi. Con più worker un bando
 * deciso su uno impiegherebbe fino a cinque minuti a raggiungere gli
 * altri, e in quella finestra il bloccato continuerebbe a passare da
 * qualche parte. È la stessa avvertenza che vale per il bus degli eventi.
 */
const INTERVALLO_SINCRONIZZAZIONE_MS = 5 * 60 * 1000;

let ultimaSincronizzazione = 0;

/**
 * Come `sincronizzaBandi`, ma decide da sé se è il momento.
 *
 * La chiama il timer di sistema, che batte ogni venti secondi per altre
 * ragioni (avvisi, scarico del registro): invece di dare a quel timer una
 * cadenza diversa per ogni compito, ogni compito sa quando gli tocca. È lo
 * stesso schema di `potaRegistro`.
 */
export async function sincronizzaBandiSePassatoIlTempo(): Promise<boolean> {
  const adesso = Date.now();
  if (adesso - ultimaSincronizzazione < INTERVALLO_SINCRONIZZAZIONE_MS) {
    return false;
  }
  ultimaSincronizzazione = adesso;
  return sincronizzaBandi();
}

/**
 * Legge bandi attivi, eccezioni e account bloccati, e sostituisce la copia
 * in memoria.
 *
 * I bandi scaduti non vengono cancellati dal database: restano come storico
 * di ciò che è stato deciso — un elenco di provvedimenti che si cancella da
 * solo non è uno storico — e sono semplicemente esclusi da questa lettura.
 */
export async function sincronizzaBandi(): Promise<boolean> {
  // Anche quando la chiama l'avvio: il primo giro periodico non deve
  // ripetere il lavoro appena fatto.
  ultimaSincronizzazione = Date.now();

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
