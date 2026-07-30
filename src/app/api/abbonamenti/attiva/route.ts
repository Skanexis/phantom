import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";
import { formattaPrezzo } from "@/lib/contenuti";

const schema = z.object({
  slug: z.string().trim().min(1).max(80),
});

export async function POST(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json(
      { errore: "Accedi tramite Telegram per attivare un abbonamento." },
      { status: 401 },
    );
  }

  const corpo = schema.safeParse(await richiesta.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Piano non valido." }, { status: 400 });
  }

  const piano = await prisma.abbonamento.findFirst({
    where: { slug: corpo.data.slug, attivo: true },
  });
  if (!piano) {
    return NextResponse.json(
      { errore: "Piano non disponibile." },
      { status: 404 },
    );
  }

  // Un utente non può avere due sottoscrizioni aperte sullo stesso piano.
  const esistente = await prisma.abbonamentoUtente.findFirst({
    where: {
      utenteId: sessione.utenteId,
      abbonamentoId: piano.id,
      stato: { in: ["IN_ATTESA", "ATTIVO"] },
    },
  });
  if (esistente) {
    return NextResponse.json(
      {
        errore:
          esistente.stato === "ATTIVO"
            ? "Questo abbonamento è già attivo."
            : "Hai già una richiesta in attesa per questo piano.",
      },
      { status: 409 },
    );
  }

  const sottoscrizione = await prisma.abbonamentoUtente.create({
    data: {
      utenteId: sessione.utenteId,
      abbonamentoId: piano.id,
      stato: "IN_ATTESA",
    },
  });

  const prezzo = formattaPrezzo(piano.prezzoCentesimi, piano.valuta);

  await notificaUtente({
    utenteId: sessione.utenteId,
    telegramId: sessione.telegramId,
    titolo: "Richiesta di attivazione ricevuta",
    testo: `La tua richiesta per il piano ${piano.nome} è in attesa di conferma. Ti avviseremo appena sarà attivo.`,
    url: "/area-personale",
    messaggioTelegram: `<b>Richiesta di attivazione ricevuta</b>\n\nPiano: <b>${escapeHtml(piano.nome)}</b>\nPrezzo: ${escapeHtml(prezzo)} / ${escapeHtml(piano.periodo)}\n\nTi avviseremo appena l'abbonamento sarà attivo.`,
  });

  await notificaAdmin(
    `<b>Nuova richiesta di abbonamento</b>\n\nPiano: ${escapeHtml(piano.nome)}\nPrezzo: ${escapeHtml(prezzo)}\nTelegram ID: ${escapeHtml(sessione.telegramId)}`,
  );

  return NextResponse.json({ id: sottoscrizione.id }, { status: 201 });
}
