import { prisma } from "@/lib/prisma";
import { inviaMessaggio } from "@/lib/telegram-bot";
import { CANALE_ADMIN, pubblica } from "@/lib/eventi";

/** Oltre questa soglia le notifiche non compaiono più nell'interfaccia:
 * restano nel database (nessuna cancellazione automatica), condivisa fra
 * l'API di paginazione e il primo caricamento lato server. */
export const GIORNI_CONSERVAZIONE_NOTIFICHE = 45;

export function sogliaConservazioneNotifiche() {
  return new Date(
    Date.now() - GIORNI_CONSERVAZIONE_NOTIFICHE * 24 * 60 * 60 * 1000,
  );
}

/**
 * Crea la notifica in-app e prova a inoltrarla su Telegram.
 * L'invio Telegram non deve mai far fallire l'operazione chiamante.
 */
export async function notificaUtente({
  utenteId,
  telegramId,
  titolo,
  testo,
  url,
  messaggioTelegram,
}: {
  utenteId: string;
  telegramId?: string | null;
  titolo: string;
  testo: string;
  url?: string;
  messaggioTelegram?: string;
}) {
  await prisma.notifica.create({
    data: { utenteId, titolo, testo, url: url ?? null },
  });

  // Il conteggio viaggia con l'evento: il client aggiorna il badge senza
  // dover interrogare di nuovo il server.
  const nonLette = await prisma.notifica.count({
    where: { utenteId, letta: false },
  });

  pubblica({
    tipo: "notifica",
    destinatario: utenteId,
    dati: { nonLette, titolo, testo },
  });

  if (telegramId) {
    await inviaMessaggio(
      telegramId,
      messaggioTelegram ??
        `<b>${escapeHtml(titolo)}</b>\n\n${escapeHtml(testo)}`,
    );
  }
}

export async function notificaAdmin(
  testo: string,
  dati?: Record<string, unknown>,
) {
  // Anche il pannello admin aperto in una scheda riceve l'aggiornamento.
  pubblica({ tipo: "notifica", destinatario: CANALE_ADMIN, dati: dati ?? {} });

  const chatAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (chatAdmin) await inviaMessaggio(chatAdmin, testo);
}

export function escapeHtml(valore: string) {
  return valore
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
