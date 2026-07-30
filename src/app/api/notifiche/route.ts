import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";

export async function GET() {
  const sessione = await leggiSessione();
  if (!sessione) return NextResponse.json({ notifiche: [], nonLette: 0 });

  const [notifiche, nonLette] = await Promise.all([
    prisma.notifica.findMany({
      where: { utenteId: sessione.utenteId },
      orderBy: { creatoIl: "desc" },
      take: 20,
    }),
    prisma.notifica.count({
      where: { utenteId: sessione.utenteId, letta: false },
    }),
  ]);

  return NextResponse.json({ notifiche, nonLette });
}

const schema = z.object({
  id: z.string().optional(),
  tutte: z.boolean().optional(),
});

export async function PATCH(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const corpo = schema.safeParse(await richiesta.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Dati non validi." }, { status: 400 });
  }

  // Il filtro su utenteId impedisce di segnare come lette notifiche altrui.
  await prisma.notifica.updateMany({
    where: {
      utenteId: sessione.utenteId,
      ...(corpo.data.tutte ? {} : { id: corpo.data.id }),
    },
    data: { letta: true },
  });

  const nonLette = await prisma.notifica.count({
    where: { utenteId: sessione.utenteId, letta: false },
  });

  return NextResponse.json({ nonLette });
}
