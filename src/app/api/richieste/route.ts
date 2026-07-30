import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { etichetteAmbito } from "@/lib/telegram-bot";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";

const schema = z.object({
  ambito: z.enum(["SITO_WEB", "APPLICAZIONE", "AUTOMAZIONE"]),
  nomeContatto: z.string().trim().min(2).max(80),
  contatto: z.string().trim().min(3).max(120),
  budget: z.string().trim().max(60).optional(),
  messaggio: z.string().trim().min(10).max(2000),
});

export async function POST(richiestaHttp: Request) {
  // Login obbligatorio: la richiesta deve essere sempre riconducibile
  // a un account, così l'utente può seguirne lo stato.
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json(
      { errore: "Collega il tuo account Telegram per inviare la richiesta." },
      { status: 401 },
    );
  }

  const corpo = await richiestaHttp.json().catch(() => null);
  const risultato = schema.safeParse(corpo);

  if (!risultato.success) {
    return NextResponse.json(
      { errore: "Controlla i campi del modulo e riprova." },
      { status: 400 },
    );
  }

  const dati = risultato.data;

  const richiesta = await prisma.richiesta.create({
    data: {
      ambito: dati.ambito,
      nomeContatto: dati.nomeContatto,
      contatto: dati.contatto,
      budget: dati.budget || null,
      messaggio: dati.messaggio,
      utenteId: sessione.utenteId,
      storico: {
        create: { stato: "NUOVA", nota: "Richiesta inviata dal cliente." },
      },
    },
  });

  const etichetta = etichetteAmbito[dati.ambito] ?? dati.ambito;

  await notificaUtente({
    utenteId: sessione.utenteId,
    telegramId: sessione.telegramId,
    titolo: "Richiesta ricevuta",
    testo: `La tua richiesta (${etichetta}) è stata inviata ed è in lavorazione.`,
    url: "/area-personale",
    messaggioTelegram: `<b>Richiesta ricevuta</b>\n\nGrazie ${escapeHtml(dati.nomeContatto)}! La tua richiesta per <b>${escapeHtml(etichetta)}</b> è stata presa in carico.\n\nTi ricontatteremo al più presto.`,
  });

  await notificaAdmin(
    `<b>Nuova richiesta</b>\n\nAmbito: ${escapeHtml(etichetta)}\nNome: ${escapeHtml(dati.nomeContatto)}\nContatto: ${escapeHtml(dati.contatto)}\nBudget: ${escapeHtml(dati.budget || "non indicato")}\n\n${escapeHtml(dati.messaggio)}`,
  );

  return NextResponse.json({ id: richiesta.id }, { status: 201 });
}
