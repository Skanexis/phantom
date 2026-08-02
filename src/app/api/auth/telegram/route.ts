import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificaInitData } from "@/lib/telegram-auth";
import { creaSessione, isAdminTelegramId } from "@/lib/sessione";
import { registraTentativo } from "@/lib/limite";
import { ipClient } from "@/lib/rete";
import { segnala } from "@/lib/sorveglianza";

const schema = z.object({
  initData: z.string().optional(),
  /** Solo in sviluppo: richiede esplicitamente l'utente fittizio. */
  devLogin: z.boolean().optional(),
});

/**
 * Ogni chiamata verifica una firma HMAC e, se valida, tocca il database.
 * Un initData non valido costa poco, ma ripetuto costa: il limite per IP
 * chiude la porta a chi prova a indovinare la firma o a far lavorare il
 * server a vuoto. Un accesso vero passa di qui una volta per sessione.
 */
const MAX_ACCESSI = 20;
const FINESTRA_MS = 10 * 60 * 1000;

export async function POST(richiesta: Request) {
  const ip = ipClient(richiesta.headers);

  const esito = registraTentativo(`telegram:${ip}`, MAX_ACCESSI, FINESTRA_MS);
  if (esito.superato) {
    segnala({
      tipo: "frequenza",
      ip,
      metodo: "POST",
      percorso: "/api/auth/telegram",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: `oltre ${MAX_ACCESSI} tentativi di accesso`,
    });
    return NextResponse.json(
      { errore: "Troppi tentativi. Riprova fra qualche minuto." },
      { status: 429, headers: { "Retry-After": String(esito.attesaSecondi) } },
    );
  }

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
    // Firma HMAC non valida. Un utente vero non ci finisce mai: initData
    // lo costruisce Telegram. Qui arriva chi prova a dichiarare un
    // identificativo altrui senza avere il token del bot.
    segnala({
      tipo: "accesso",
      ip,
      metodo: "POST",
      percorso: "/api/auth/telegram",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: initData
        ? "firma initData non valida"
        : "accesso Telegram senza initData",
    });
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
