import { prisma } from "@/lib/prisma";
import { inviaMessaggio } from "@/lib/telegram-bot";

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

  if (telegramId) {
    await inviaMessaggio(
      telegramId,
      messaggioTelegram ?? `<b>${escapeHtml(titolo)}</b>\n\n${escapeHtml(testo)}`,
    );
  }
}

export async function notificaAdmin(testo: string) {
  const chatAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (chatAdmin) await inviaMessaggio(chatAdmin, testo);
}

export function escapeHtml(valore: string) {
  return valore
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
