import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { etichetteAmbito } from "@/lib/telegram-bot";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";
import { PREFISSO_RICHIESTA, codiceUnico } from "@/lib/codici";
import { riferimentoUtente } from "@/lib/utenti";

const schema = z.object({
  ambito: z.enum(["SITO_WEB", "APPLICAZIONE", "AUTOMAZIONE"]),
  nomeContatto: z.string().trim().min(2).max(80),
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

  const utente = await prisma.utente.findUnique({
    where: { id: sessione.utenteId },
  });

  // Il recapito viene dal profilo Telegram: chiederlo di nuovo nel modulo
  // significava farsi dettare un dato che il sistema ha già, con il rischio
  // di un username scritto male.
  const contatto = riferimentoUtente(utente);

  const codice = await codiceUnico(PREFISSO_RICHIESTA, async (valore) =>
    Boolean(await prisma.richiesta.findUnique({ where: { codice: valore } })),
  );

  const richiesta = await prisma.richiesta.create({
    data: {
      codice,
      ambito: dati.ambito,
      nomeContatto: dati.nomeContatto,
      contatto,
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
    titolo: `Richiesta ${codice} ricevuta`,
    testo: `La tua richiesta ${codice} (${etichetta}) è stata inviata ed è in lavorazione.`,
    url: "/area-personale",
    messaggioTelegram: [
      `<b>Richiesta ricevuta</b> · <code>${escapeHtml(codice)}</code>`,
      "",
      `Grazie ${escapeHtml(dati.nomeContatto)}! Abbiamo preso in carico la tua richiesta per <b>${escapeHtml(etichetta)}</b>.`,
      "",
      `Conserva il codice <b>${escapeHtml(codice)}</b>: lo usiamo in ogni comunicazione su questo progetto.`,
      "",
      "<i>Puoi rispondere direttamente a questo messaggio per scriverci.</i>",
    ].join("\n"),
  });

  await notificaAdmin(
    [
      `<b>Nuova richiesta</b> · <code>${escapeHtml(codice)}</code>`,
      "",
      `Ambito: <b>${escapeHtml(etichetta)}</b>`,
      `Nome: ${escapeHtml(dati.nomeContatto)}`,
      `Cliente: ${escapeHtml(contatto)}`,
      `Budget: ${escapeHtml(dati.budget || "non indicato")}`,
      "",
      escapeHtml(dati.messaggio),
    ].join("\n"),
    { richiestaId: richiesta.id, codice },
  );

  return NextResponse.json({ id: richiesta.id, codice }, { status: 201 });
}
