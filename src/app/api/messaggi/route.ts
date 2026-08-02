import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { registraTentativo } from "@/lib/limite";
import { segnala } from "@/lib/sorveglianza";
import { ipClient } from "@/lib/rete";
import {
  LUNGHEZZA_MASSIMA,
  inviaMessaggioUtente,
  segnaMessaggiLetti,
} from "@/lib/messaggi";

/** Conversazione di una richiesta del cliente collegato. */
export async function GET(richiestaHttp: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const url = new URL(richiestaHttp.url);
  const richiestaId = url.searchParams.get("richiesta");
  if (!richiestaId) {
    return NextResponse.json(
      { errore: "Richiesta mancante." },
      { status: 400 },
    );
  }

  const richiesta = await prisma.richiesta.findFirst({
    where: { id: richiestaId, utenteId: sessione.utenteId },
    include: { messaggi: { orderBy: { creatoIl: "asc" } } },
  });
  if (!richiesta) {
    return NextResponse.json({ errore: "Non trovata." }, { status: 404 });
  }

  // Aprire la conversazione vale come lettura dei messaggi dell'admin.
  await segnaMessaggiLetti({ richiestaId, daAdmin: true });

  return NextResponse.json({
    messaggi: richiesta.messaggi.map((messaggio) => ({
      id: messaggio.id,
      testo: messaggio.testo,
      daAdmin: messaggio.daAdmin,
      letto: messaggio.letto,
      creatoIl: messaggio.creatoIl.toISOString(),
    })),
  });
}

const schema = z.object({
  richiestaId: z.string().trim().min(1).max(64),
  testo: z.string().trim().min(1).max(LUNGHEZZA_MASSIMA),
});

/**
 * Ogni messaggio inoltra un avviso alla chat dell'amministrazione: senza
 * tetto, una conversazione aperta diventa un canale per inondarla. Il
 * limite è largo abbastanza da non disturbare chi scrive davvero, anche
 * spezzando il discorso in più righe brevi.
 */
const MAX_MESSAGGI = 20;
const FINESTRA_MS = 60_000;

export async function POST(richiestaHttp: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const esito = registraTentativo(
    `messaggi:${sessione.utenteId}`,
    MAX_MESSAGGI,
    FINESTRA_MS,
  );
  if (esito.superato) {
    segnala({
      tipo: "frequenza_utente",
      ip: ipClient(richiestaHttp.headers),
      metodo: "POST",
      percorso: "/api/messaggi",
      agente: richiestaHttp.headers.get("user-agent"),
      dettaglio: `utente ${sessione.utenteId}: oltre ${MAX_MESSAGGI} messaggi al minuto`,
    });
    return NextResponse.json(
      { errore: "Stai scrivendo troppo in fretta. Aspetta qualche secondo." },
      { status: 429, headers: { "Retry-After": String(esito.attesaSecondi) } },
    );
  }

  const corpo = schema.safeParse(await richiestaHttp.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { errore: "Messaggio non valido." },
      { status: 400 },
    );
  }

  const messaggio = await inviaMessaggioUtente({
    richiestaId: corpo.data.richiestaId,
    utenteId: sessione.utenteId,
    testo: corpo.data.testo,
  });

  if (!messaggio) {
    return NextResponse.json(
      { errore: "Richiesta non trovata." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      messaggio: {
        id: messaggio.id,
        testo: messaggio.testo,
        daAdmin: false,
        creatoIl: messaggio.creatoIl.toISOString(),
      },
    },
    { status: 201 },
  );
}
