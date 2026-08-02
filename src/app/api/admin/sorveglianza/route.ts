import { NextResponse } from "next/server";
import { richiediSviluppatore } from "@/lib/sessione";
import { istantanea } from "@/lib/sorveglianza";
import { statoFlussi } from "@/lib/limite";
import { prisma } from "@/lib/prisma";

/**
 * Quadro della sorveglianza per il pannello.
 *
 * Riservata a DEVELOPER e non allo staff in generale: qui dentro ci sono
 * indirizzi IP e user-agent dei visitatori, cioè dati personali che non
 * servono a chi risponde ai clienti. Meno persone li vedono, meglio è.
 *
 * Runtime Node esplicito: legge lo stato condiviso su globalThis, che
 * esiste solo qui e non nella sandbox edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Il carico applicativo si legge dal database, e il pannello si aggiorna
 * ogni cinque secondi: senza memoria, il solo fatto di guardare i numeri
 * genererebbe cinque interrogazioni ogni cinque secondi per ogni scheda
 * aperta. Sono cifre che cambiano lentamente — quanti abbonati, quante
 * pratiche aperte — e mezzo minuto di ritardo non toglie nulla, mentre
 * toglie del tutto il rischio che il monitoraggio pesi più di ciò che
 * monitora.
 */
const VALIDITA_CARICO_MS = 30_000;

type Carico = {
  utenti: number;
  abbonatiAttivi: number;
  attivazioniInAttesa: number;
  richiesteAperte: number;
  messaggiDaLeggere: number;
  letturaMs: number;
  erroreDatabase: string | null;
};

let caricoInCache: { dati: Carico; scadenza: number } | null = null;

async function leggiCarico(): Promise<Carico> {
  const adesso = Date.now();
  if (caricoInCache && caricoInCache.scadenza > adesso) {
    return caricoInCache.dati;
  }

  const inizio = Date.now();

  try {
    // Conteggi, non righe: al database costano un indice, e la risposta
    // resta della stessa dimensione con dieci utenti o con diecimila.
    const [
      utenti,
      abbonatiAttivi,
      attivazioniInAttesa,
      richiesteAperte,
      messaggiDaLeggere,
    ] = await Promise.all([
      prisma.utente.count(),
      prisma.abbonamentoUtente.count({ where: { stato: "ATTIVO" } }),
      prisma.abbonamentoUtente.count({ where: { stato: "IN_ATTESA" } }),
      prisma.richiesta.count({
        where: { stato: { in: ["NUOVA", "IN_LAVORAZIONE", "IN_ATTESA_CLIENTE"] } },
      }),
      prisma.messaggio.count({ where: { daAdmin: false, letto: false } }),
    ]);

    const dati: Carico = {
      utenti,
      abbonatiAttivi,
      attivazioniInAttesa,
      richiesteAperte,
      messaggiDaLeggere,
      // Il tempo della lettura è la sonda sul database: se sale, il
      // problema è lì e non nel traffico in ingresso.
      letturaMs: Date.now() - inizio,
      erroreDatabase: null,
    };

    caricoInCache = { dati, scadenza: adesso + VALIDITA_CARICO_MS };
    return dati;
  } catch (eccezione) {
    // Il database irraggiungibile non deve far sparire il pannello: è
    // proprio il momento in cui serve guardarlo. Si restituisce l'ultimo
    // valore noto, marcato come tale.
    const messaggio =
      eccezione instanceof Error ? eccezione.message : String(eccezione);

    return {
      ...(caricoInCache?.dati ?? {
        utenti: 0,
        abbonatiAttivi: 0,
        attivazioniInAttesa: 0,
        richiesteAperte: 0,
        messaggiDaLeggere: 0,
      }),
      letturaMs: Date.now() - inizio,
      erroreDatabase: messaggio.slice(0, 200),
    };
  }
}

export async function GET() {
  const sviluppatore = await richiediSviluppatore();
  if (!sviluppatore) {
    // 404 e non 403: a chi non ha i permessi questa rotta non deve nemmeno
    // risultare esistente.
    return NextResponse.json({ errore: "Non trovato." }, { status: 404 });
  }

  const memoria = process.memoryUsage();

  return NextResponse.json({
    ...istantanea(),
    flussi: statoFlussi(),
    carico: await leggiCarico(),
    processo: {
      pid: process.pid,
      node: process.version,
      attivoDaSecondi: Math.round(process.uptime()),
      memoriaMb: Math.round(memoria.rss / 1024 / 1024),
      heapUsatoMb: Math.round(memoria.heapUsed / 1024 / 1024),
      heapTotaleMb: Math.round(memoria.heapTotal / 1024 / 1024),
    },
  });
}
