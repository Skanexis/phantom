import { NextResponse } from "next/server";
import { inviaMessaggio } from "@/lib/telegram-bot";
import { confermaToken } from "@/lib/collegamento";
import { escapeHtml } from "@/lib/notifiche";

type Aggiornamento = {
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
};

export async function POST(richiesta: Request) {
  const segretoAtteso = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (segretoAtteso) {
    const segretoRicevuto = richiesta.headers.get(
      "x-telegram-bot-api-secret-token",
    );
    if (segretoRicevuto !== segretoAtteso) {
      return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
    }
  }

  const aggiornamento = (await richiesta
    .json()
    .catch(() => null)) as Aggiornamento | null;

  const messaggio = aggiornamento?.message;
  const chatId = messaggio?.chat?.id;
  const testo = messaggio?.text?.trim();
  const mittente = messaggio?.from;

  if (!chatId || !testo) {
    return NextResponse.json({ ok: true });
  }

  if (testo.startsWith("/start")) {
    // /start <token> arriva dal deep link generato dal sito.
    const parametro = testo.slice("/start".length).trim();

    if (parametro && mittente?.id) {
      const utente = await confermaToken({
        token: parametro,
        telegramId: String(mittente.id),
        nome: mittente.first_name,
        cognome: mittente.last_name,
        username: mittente.username,
        linguaTelegram: mittente.language_code,
      });

      if (utente) {
        await inviaMessaggio(
          String(chatId),
          `<b>Account collegato</b>\n\nCiao ${escapeHtml(utente.nome ?? "")}! Il tuo account è stato collegato al sito.\n\nTorna sulla pagina aperta nel browser: l'accesso è già attivo.`,
        );
      } else {
        await inviaMessaggio(
          String(chatId),
          "<b>Link scaduto</b>\n\nQuesto link di accesso non è più valido. Torna sul sito e richiedi un nuovo collegamento.",
        );
      }

      return NextResponse.json({ ok: true });
    }

    await inviaMessaggio(
      String(chatId),
      "<b>Benvenuto in Phantom Lab</b>\n\nSviluppiamo siti, applicazioni, automazioni e bot Telegram su misura.\n\nApri la Mini App per scoprire gli abbonamenti e inviare una richiesta.",
    );
  } else if (testo.startsWith("/aiuto")) {
    await inviaMessaggio(
      String(chatId),
      "Comandi disponibili:\n/start — presentazione e collegamento account\n/aiuto — questo messaggio\n\nPer richieste e abbonamenti usa la Mini App.",
    );
  }

  return NextResponse.json({ ok: true });
}
