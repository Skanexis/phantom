import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isAdminTelegramId } from "@/lib/sessione";

/** Durata di validità di un token di collegamento. */
const VALIDITA_MINUTI = 10;

/**
 * Token per il deep link del bot: solo caratteri ammessi da Telegram
 * nel parametro start (A-Z, a-z, 0-9, _ e -), massimo 64 caratteri.
 */
export function generaToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function creaTokenCollegamento() {
  const token = generaToken();

  await prisma.tokenCollegamento.create({
    data: {
      token,
      scadeIl: new Date(Date.now() + VALIDITA_MINUTI * 60 * 1000),
    },
  });

  // Pulizia opportunistica dei token scaduti, così la tabella non cresce.
  await prisma.tokenCollegamento
    .deleteMany({ where: { scadeIl: { lt: new Date() } } })
    .catch(() => undefined);

  return token;
}

/**
 * Conferma il token dal lato bot: associa l'utente Telegram che ha
 * premuto Avvia. Restituisce false se il token è ignoto, scaduto o già usato.
 */
export async function confermaToken({
  token,
  telegramId,
  nome,
  cognome,
  username,
  linguaTelegram,
}: {
  token: string;
  telegramId: string;
  nome?: string | null;
  cognome?: string | null;
  username?: string | null;
  linguaTelegram?: string | null;
}) {
  const riga = await prisma.tokenCollegamento.findUnique({ where: { token } });

  if (!riga || riga.usato || riga.confermato) return null;
  if (riga.scadeIl < new Date()) return null;

  // Stesso Telegram ID => stesso account, che arrivi da Mini App o da browser.
  const utente = await prisma.utente.upsert({
    where: { telegramId },
    update: {
      nome: nome ?? undefined,
      cognome: cognome ?? undefined,
      username: username ?? undefined,
      linguaTelegram: linguaTelegram ?? undefined,
    },
    create: {
      telegramId,
      nome: nome ?? null,
      cognome: cognome ?? null,
      username: username ?? null,
      linguaTelegram: linguaTelegram ?? null,
      ruolo: isAdminTelegramId(telegramId) ? "ADMIN" : "UTENTE",
    },
  });

  await prisma.tokenCollegamento.update({
    where: { token },
    data: { confermato: true, utenteId: utente.id },
  });

  return utente;
}

/**
 * Consuma il token dal lato browser. Il token è monouso: la marcatura
 * avviene con updateMany su usato=false, così due richieste concorrenti
 * non possono entrambe creare una sessione.
 */
export async function consumaToken(token: string) {
  const riga = await prisma.tokenCollegamento.findUnique({
    where: { token },
    include: { utente: true },
  });

  if (!riga || riga.usato || !riga.confermato || !riga.utente) return null;
  if (riga.scadeIl < new Date()) return null;

  const esito = await prisma.tokenCollegamento.updateMany({
    where: { token, usato: false },
    data: { usato: true },
  });

  if (esito.count === 0) return null;
  return riga.utente;
}

function nomeBot() {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
}

/** URL del bot con il token in deep link. */
export function urlBot(token: string) {
  const bot = nomeBot();
  if (!bot) return null;
  return `https://t.me/${bot}?start=${token}`;
}

/**
 * Stesso collegamento in schema nativo.
 *
 * `https://t.me/...` è una pagina web: il browser la tratta come una
 * navigazione qualsiasi e sostituisce la scheda corrente, che poi t.me
 * reindirizza verso l'app. Con `tg://` il browser passa il collegamento
 * direttamente al sistema operativo: Telegram si apre sopra e la pagina
 * resta dov'è, in attesa della conferma.
 */
export function urlBotNativo(token: string) {
  const bot = nomeBot();
  if (!bot) return null;
  return `tg://resolve?domain=${bot}&start=${token}`;
}
