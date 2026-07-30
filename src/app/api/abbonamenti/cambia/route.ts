import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { escapeHtml, notificaAdmin, notificaUtente } from "@/lib/notifiche";
import { formattaPrezzo } from "@/lib/contenuti";
import { statoEffettivo } from "@/lib/abbonamenti";
import { PREFISSO_ABBONAMENTO, codiceUnico } from "@/lib/codici";
import { riferimentoUtente } from "@/lib/utenti";

const schema = z.object({
  /** Sottoscrizione da sostituire. */
  sottoscrizioneId: z.string().trim().min(1).max(64),
  /** Piano di destinazione. */
  slug: z.string().trim().min(1).max(80),
});

/**
 * Cambio di piano richiesto dall'utente: crea una sottoscrizione IN_ATTESA
 * sul nuovo piano e annulla quella precedente solo quando l'admin conferma.
 * Fino ad allora il piano vecchio resta attivo, così il cliente non perde
 * il servizio mentre aspetta.
 */
export async function POST(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return NextResponse.json(
      { errore: "Accedi tramite Telegram per cambiare piano." },
      { status: 401 },
    );
  }

  const corpo = schema.safeParse(await richiesta.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Dati non validi." }, { status: 400 });
  }

  const attuale = await prisma.abbonamentoUtente.findFirst({
    where: {
      id: corpo.data.sottoscrizioneId,
      // Il vincolo sull'utente impedisce di toccare la sottoscrizione altrui
      // passando un id indovinato.
      utenteId: sessione.utenteId,
    },
    include: { abbonamento: true },
  });

  if (!attuale) {
    return NextResponse.json(
      { errore: "Abbonamento non trovato." },
      { status: 404 },
    );
  }

  const nuovo = await prisma.abbonamento.findFirst({
    where: { slug: corpo.data.slug, attivo: true },
  });
  if (!nuovo) {
    return NextResponse.json(
      { errore: "Piano non disponibile." },
      { status: 404 },
    );
  }

  if (nuovo.id === attuale.abbonamentoId) {
    return NextResponse.json(
      { errore: "È il piano che hai già." },
      { status: 409 },
    );
  }

  // Una sola richiesta di cambio alla volta, altrimenti l'admin riceve
  // code di attivazioni contraddittorie sullo stesso utente.
  const giaInAttesa = await prisma.abbonamentoUtente.findFirst({
    where: {
      utenteId: sessione.utenteId,
      stato: "IN_ATTESA",
    },
  });
  if (giaInAttesa) {
    return NextResponse.json(
      { errore: "Hai già una richiesta in attesa di conferma." },
      { status: 409 },
    );
  }

  const codice = await codiceUnico(PREFISSO_ABBONAMENTO, async (valore) =>
    Boolean(
      await prisma.abbonamentoUtente.findUnique({ where: { codice: valore } }),
    ),
  );

  const nuovaSottoscrizione = await prisma.abbonamentoUtente.create({
    data: {
      codice,
      utenteId: sessione.utenteId,
      abbonamentoId: nuovo.id,
      stato: "IN_ATTESA",
      // La nota lega le due sottoscrizioni: l'admin, confermando, sa quale
      // piano chiudere. Il campo è già previsto dallo schema.
      note: `Cambio da ${attuale.abbonamento.nome} (${attuale.id})`,
    },
  });

  const prezzo = formattaPrezzo(nuovo.prezzoCentesimi, nuovo.valuta);
  const statoAttuale = statoEffettivo(attuale);

  await notificaUtente({
    utenteId: sessione.utenteId,
    telegramId: sessione.telegramId,
    titolo: "Richiesta di cambio piano ricevuta",
    testo: `Hai chiesto di passare da ${attuale.abbonamento.nome} a ${nuovo.nome}. Il piano attuale resta attivo finché non confermiamo il nuovo.`,
    url: "/area-personale",
    messaggioTelegram: `<b>Richiesta di cambio piano</b>\n\nDa: ${escapeHtml(attuale.abbonamento.nome)}\nA: <b>${escapeHtml(nuovo.nome)}</b>\nPrezzo: ${escapeHtml(prezzo)} / ${escapeHtml(nuovo.periodo)}\n\nIl piano attuale resta attivo fino alla conferma.`,
  });

  const utente = await prisma.utente.findUnique({
    where: { id: sessione.utenteId },
  });

  await notificaAdmin(
    [
      `<b>Richiesta di cambio piano</b> · <code>${escapeHtml(codice)}</code>`,
      "",
      `Cliente: ${escapeHtml(riferimentoUtente(utente))}`,
      `Da: ${escapeHtml(attuale.abbonamento.nome)} (${escapeHtml(statoAttuale)})`,
      `A: <b>${escapeHtml(nuovo.nome)}</b>`,
      `Prezzo: ${escapeHtml(prezzo)} / ${escapeHtml(nuovo.periodo)}`,
    ].join("\n"),
    { sottoscrizioneId: nuovaSottoscrizione.id, codice },
  );

  return NextResponse.json({ id: nuovaSottoscrizione.id }, { status: 201 });
}
