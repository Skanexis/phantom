import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { CANALE_ADMIN, pubblica } from "@/lib/eventi";

const schema = z.object({
  richiestaId: z.string().trim().min(1).max(64),
});

/**
 * Segnala che qualcuno sta scrivendo in una conversazione.
 *
 * Non tocca il database: è un segnale effimero che vive solo nel flusso
 * SSE, e se va perso non cambia nulla di sostanziale.
 */
export async function POST(richiestaHttp: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const corpo = schema.safeParse(await richiestaHttp.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Dati non validi." }, { status: 400 });
  }

  const daAdmin = sessione.ruolo === "ADMIN";

  // L'admin scrive in qualsiasi pratica; il cliente solo nelle proprie:
  // senza il vincolo si potrebbe sondare l'esistenza di richieste altrui.
  const richiesta = await prisma.richiesta.findFirst({
    where: {
      id: corpo.data.richiestaId,
      ...(daAdmin ? {} : { utenteId: sessione.utenteId }),
    },
    select: { id: true, utenteId: true },
  });
  if (!richiesta) {
    return NextResponse.json({ errore: "Non trovata." }, { status: 404 });
  }

  pubblica({
    tipo: "scrittura",
    destinatario: daAdmin ? (richiesta.utenteId ?? "") : CANALE_ADMIN,
    dati: { richiestaId: richiesta.id, daAdmin },
  });

  return NextResponse.json({ ok: true });
}
