import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { sogliaConservazioneNotifiche } from "@/lib/notifiche";

const PAGINA = 20;

export async function GET(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) return NextResponse.json({ notifiche: [], nonLette: 0 });

  // "prima" è l'id dell'ultima notifica già mostrata: la pagina successiva
  // riparte da lì invece che dall'inizio, così "Carica altre" non ripete
  // le stesse righe se nel frattempo ne arriva una nuova.
  const cursore = new URL(richiesta.url).searchParams.get("prima");

  const [notifiche, nonLette] = await Promise.all([
    prisma.notifica.findMany({
      where: {
        utenteId: sessione.utenteId,
        creatoIl: { gte: sogliaConservazioneNotifiche() },
      },
      orderBy: { creatoIl: "desc" },
      take: PAGINA,
      ...(cursore ? { cursor: { id: cursore }, skip: 1 } : {}),
    }),
    prisma.notifica.count({
      where: {
        utenteId: sessione.utenteId,
        letta: false,
        creatoIl: { gte: sogliaConservazioneNotifiche() },
      },
    }),
  ]);

  return NextResponse.json({
    notifiche,
    nonLette,
    altreDisponibili: notifiche.length === PAGINA,
  });
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
    where: {
      utenteId: sessione.utenteId,
      letta: false,
      creatoIl: { gte: sogliaConservazioneNotifiche() },
    },
  });

  return NextResponse.json({ nonLette });
}
