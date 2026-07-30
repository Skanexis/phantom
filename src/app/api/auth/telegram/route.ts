import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificaInitData } from "@/lib/telegram-auth";
import { creaSessione, isAdminTelegramId } from "@/lib/sessione";

const schema = z.object({
  initData: z.string().optional(),
  /** Solo in sviluppo: richiede esplicitamente l'utente fittizio. */
  devLogin: z.boolean().optional(),
});

export async function POST(richiesta: Request) {
  const corpo = schema.safeParse(await richiesta.json().catch(() => ({})));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Dati non validi." }, { status: 400 });
  }

  const initData = corpo.data.initData ?? "";
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const utenteTelegram = verificaInitData(initData, token);

  // Il dev-login non scatta più da solo: senza richiesta esplicita una
  // visita da browser resta anonima invece di ricevere l'utente fittizio.
  const devLoginAttivo =
    corpo.data.devLogin === true &&
    process.env.ALLOW_DEV_LOGIN === "true" &&
    process.env.NODE_ENV !== "production";

  if (!utenteTelegram && !devLoginAttivo) {
    return NextResponse.json(
      { errore: "Autenticazione Telegram non valida." },
      { status: 401 },
    );
  }

  const dati = utenteTelegram ?? {
    id: 100000001,
    first_name: "Utente",
    last_name: "Demo",
    username: "utente_demo",
    language_code: "it",
  };

  const telegramId = String(dati.id);
  const ruolo = isAdminTelegramId(telegramId) ? "ADMIN" : "UTENTE";

  const utente = await prisma.utente.upsert({
    where: { telegramId },
    update: {
      username: dati.username ?? null,
      nome: dati.first_name ?? null,
      cognome: dati.last_name ?? null,
      linguaTelegram: dati.language_code ?? null,
      urlFoto: dati.photo_url ?? null,
    },
    create: {
      telegramId,
      username: dati.username ?? null,
      nome: dati.first_name ?? null,
      cognome: dati.last_name ?? null,
      linguaTelegram: dati.language_code ?? null,
      urlFoto: dati.photo_url ?? null,
      ruolo,
    },
  });

  await creaSessione({
    utenteId: utente.id,
    telegramId: utente.telegramId,
    ruolo: utente.ruolo,
  });

  return NextResponse.json({
    utente: {
      id: utente.id,
      nome: utente.nome,
      cognome: utente.cognome,
      username: utente.username,
      ruolo: utente.ruolo,
    },
  });
}
