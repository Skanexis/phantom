import { prisma } from "@/lib/prisma";
import { inviaMessaggio } from "@/lib/telegram-bot";
import { escapeHtml } from "@/lib/notifiche";
import { CANALE_ADMIN, pubblica } from "@/lib/eventi";
import { linkRichiesta } from "@/lib/richieste";

/** Lunghezza massima di un messaggio, condivisa fra API e interfaccia. */
export const LUNGHEZZA_MASSIMA = 2000;

/** Stati in cui una richiesta accetta ancora messaggi. */
const STATI_APERTI = ["NUOVA", "IN_LAVORAZIONE", "IN_ATTESA_CLIENTE"] as const;

/**
 * Richiesta a cui associare un messaggio arrivato dal bot, dove l'utente
 * non indica a quale pratica si riferisce: prendo l'ultima ancora aperta,
 * che è quasi sempre quella di cui sta parlando.
 */
export async function richiestaPerRispostaTelegram(utenteId: string) {
  return prisma.richiesta.findFirst({
    where: { utenteId, stato: { in: [...STATI_APERTI] } },
    orderBy: { aggiornatoIl: "desc" },
  });
}

/**
 * Scrive un messaggio dell'amministrazione e avvisa il cliente.
 *
 * Il messaggio resta sul sito; su Telegram parte un avviso con l'anteprima
 * e il codice della pratica, così il cliente può rispondere da lì oppure
 * aprire l'area personale.
 */
export async function inviaMessaggioAdmin({
  richiestaId,
  testo,
  soloSulSito = false,
}: {
  richiestaId: string;
  testo: string;
  /** Vero per non inoltrare nulla al bot: solo notifica in-app. */
  soloSulSito?: boolean;
}) {
  const richiesta = await prisma.richiesta.findUnique({
    where: { id: richiestaId },
    include: { utente: true },
  });
  if (!richiesta) return null;

  const messaggio = await prisma.messaggio.create({
    data: { richiestaId, testo, daAdmin: true },
  });

  if (richiesta.utenteId) {
    // La notifica in-app alimenta il badge; l'evento la consegna subito
    // alle schede aperte.
    await prisma.notifica.create({
      data: {
        utenteId: richiesta.utenteId,
        titolo: `Nuovo messaggio · ${richiesta.codice ?? "richiesta"}`,
        testo: testo.slice(0, 160),
        url: linkRichiesta(richiesta.codice),
      },
    });

    const nonLette = await prisma.notifica.count({
      where: { utenteId: richiesta.utenteId, letta: false },
    });

    pubblica({
      tipo: "messaggio",
      destinatario: richiesta.utenteId,
      dati: {
        nonLette,
        richiestaId,
        messaggio: {
          id: messaggio.id,
          testo: messaggio.testo,
          daAdmin: true,
          creatoIl: messaggio.creatoIl.toISOString(),
        },
      },
    });
  }

  if (!soloSulSito && richiesta.utente?.telegramId) {
    await inviaMessaggio(
      richiesta.utente.telegramId,
      `<b>Nuovo messaggio</b> · ${escapeHtml(richiesta.codice ?? "")}\n\n${escapeHtml(testo)}\n\n<i>Rispondi a questo messaggio per scriverci, oppure apri l'area personale sul sito.</i>`,
    );
  }

  return messaggio;
}

/**
 * Scrive un messaggio del cliente e avvisa l'amministrazione.
 * Usata sia dal sito sia dal webhook del bot.
 */
export async function inviaMessaggioUtente({
  richiestaId,
  utenteId,
  testo,
  daTelegram = false,
}: {
  richiestaId: string;
  utenteId: string;
  testo: string;
  daTelegram?: boolean;
}) {
  const richiesta = await prisma.richiesta.findFirst({
    // Il vincolo sull'utente impedisce di scrivere nella pratica altrui
    // passando un id indovinato.
    where: { id: richiestaId, utenteId },
    include: { utente: true },
  });
  if (!richiesta) return null;

  const messaggio = await prisma.messaggio.create({
    data: { richiestaId, testo, daAdmin: false, daTelegram },
  });

  // Tocco la richiesta: l'ordinamento per aggiornatoIl porta in cima le
  // conversazioni vive, ed è quello che sceglie la pratica per le risposte
  // dal bot.
  await prisma.richiesta.update({
    where: { id: richiestaId },
    data: { aggiornatoIl: new Date() },
  });

  const autore = richiesta.utente?.username
    ? `@${richiesta.utente.username}`
    : (richiesta.utente?.telegramId ?? "cliente");

  pubblica({
    tipo: "messaggio",
    destinatario: CANALE_ADMIN,
    dati: {
      richiestaId,
      codice: richiesta.codice,
      messaggio: {
        id: messaggio.id,
        testo: messaggio.testo,
        daAdmin: false,
        creatoIl: messaggio.creatoIl.toISOString(),
      },
    },
  });

  const chatAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (chatAdmin) {
    await inviaMessaggio(
      chatAdmin,
      `<b>Risposta cliente</b> · ${escapeHtml(richiesta.codice ?? "")}\n\nDa: ${escapeHtml(autore)}\n\n${escapeHtml(testo)}`,
    );
  }

  return messaggio;
}

/** Segna come letti i messaggi della controparte su una richiesta. */
export async function segnaMessaggiLetti({
  richiestaId,
  daAdmin,
}: {
  richiestaId: string;
  /** Vero per segnare letti i messaggi scritti dall'admin (lato cliente). */
  daAdmin: boolean;
}) {
  const esito = await prisma.messaggio.updateMany({
    where: { richiestaId, daAdmin, letto: false },
    data: { letto: true },
  });

  // Niente da segnalare se non è cambiato nulla: evita di svegliare i
  // client a ogni apertura della stessa conversazione già letta.
  if (esito.count === 0) return;

  const richiesta = await prisma.richiesta.findUnique({
    where: { id: richiestaId },
    select: { utenteId: true },
  });

  // La conferma va a chi ha scritto i messaggi appena letti.
  pubblica({
    tipo: "letto",
    destinatario: daAdmin ? CANALE_ADMIN : (richiesta?.utenteId ?? ""),
    dati: { richiestaId, daAdmin },
  });
}
