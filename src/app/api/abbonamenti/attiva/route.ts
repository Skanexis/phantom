import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { registraTentativo } from "@/lib/limite";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";
import { formattaPrezzo } from "@/lib/contenuti";
import { STATI_APERTI } from "@/lib/abbonamenti";
import { PREFISSO_ABBONAMENTO, codiceUnico } from "@/lib/codici";
import { riferimentoUtente } from "@/lib/utenti";

const schema = z.object({
  slug: z.string().trim().min(1).max(80),
});

/** Attivare un piano avvisa l'amministrazione: poche volte, non a raffica. */
const MAX_ATTIVAZIONI = 10;
const FINESTRA_MS = 10 * 60 * 1000;

export async function POST(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json(
      { errore: "Accedi tramite Telegram per attivare un abbonamento." },
      { status: 401 },
    );
  }

  const esito = registraTentativo(
    `abbonamenti:${sessione.utenteId}`,
    MAX_ATTIVAZIONI,
    FINESTRA_MS,
  );
  if (esito.superato) {
    return NextResponse.json(
      { errore: "Troppi tentativi. Riprova fra qualche minuto." },
      { status: 429, headers: { "Retry-After": String(esito.attesaSecondi) } },
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
      stato: { in: STATI_APERTI },
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

  // Con un piano diverso già attivo si passa dal cambio piano: due piani
  // attivi insieme non hanno significato e lascerebbero l'admin a decidere
  // quale fatturare.
  const altroAttivo = await prisma.abbonamentoUtente.findFirst({
    where: {
      utenteId: sessione.utenteId,
      stato: { in: STATI_APERTI },
    },
    include: { abbonamento: true },
  });
  if (altroAttivo) {
    return NextResponse.json(
      {
        errore:
          altroAttivo.stato === "IN_ATTESA"
            ? "Hai già una richiesta in attesa di conferma."
            : `Hai già il piano ${altroAttivo.abbonamento.nome}. Cambia piano dall'area personale.`,
        cambioPiano: altroAttivo.stato === "ATTIVO",
      },
      { status: 409 },
    );
  }

  const codice = await codiceUnico(PREFISSO_ABBONAMENTO, async (valore) =>
    Boolean(
      await prisma.abbonamentoUtente.findUnique({ where: { codice: valore } }),
    ),
  );

  const sottoscrizione = await prisma.abbonamentoUtente.create({
    data: {
      codice,
      utenteId: sessione.utenteId,
      abbonamentoId: piano.id,
      stato: "IN_ATTESA",
    },
  });

  const prezzo = formattaPrezzo(piano.prezzoCentesimi, piano.valuta);
  const utente = await prisma.utente.findUnique({
    where: { id: sessione.utenteId },
  });

  await notificaUtente({
    utenteId: sessione.utenteId,
    telegramId: sessione.telegramId,
    titolo: `Richiesta abbonamento ${codice}`,
    testo: `La tua richiesta per il piano ${piano.nome} (${codice}) è in attesa di conferma. Ti avviseremo appena sarà attivo.`,
    url: "/area-personale",
    messaggioTelegram: [
      `<b>Richiesta di attivazione ricevuta</b> · <code>${escapeHtml(codice)}</code>`,
      "",
      `Piano: <b>${escapeHtml(piano.nome)}</b>`,
      `Prezzo: ${escapeHtml(prezzo)} / ${escapeHtml(piano.periodo)}`,
      "",
      "Ti avviseremo appena l'abbonamento sarà attivo.",
    ].join("\n"),
  });

  await notificaAdmin(
    [
      `<b>Nuova richiesta di abbonamento</b> · <code>${escapeHtml(codice)}</code>`,
      "",
      `Piano: <b>${escapeHtml(piano.nome)}</b>`,
      `Prezzo: ${escapeHtml(prezzo)} / ${escapeHtml(piano.periodo)}`,
      `Cliente: ${escapeHtml(riferimentoUtente(utente))}`,
    ].join("\n"),
    { sottoscrizioneId: sottoscrizione.id, codice },
  );

  return NextResponse.json({ id: sottoscrizione.id, codice }, { status: 201 });
}
