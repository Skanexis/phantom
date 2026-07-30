import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
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
      creatoIl: messaggio.creatoIl.toISOString(),
    })),
  });
}

const schema = z.object({
  richiestaId: z.string().trim().min(1).max(64),
  testo: z.string().trim().min(1).max(LUNGHEZZA_MASSIMA),
});

export async function POST(richiestaHttp: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
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
