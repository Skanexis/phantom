import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inviaMessaggio } from "@/lib/telegram-bot";
import { confermaToken } from "@/lib/collegamento";
import { segnala } from "@/lib/sorveglianza";
import { ipClient } from "@/lib/rete";
import { escapeHtml } from "@/lib/notifiche";
import {
  LUNGHEZZA_MASSIMA,
  inviaMessaggioUtente,
  richiestaPerRispostaTelegram,
} from "@/lib/messaggi";

/**
 * Confronto a tempo costante: un `!==` si ferma al primo carattere diverso,
 * e la differenza di tempo misurabile permette di ricostruire il segreto
 * un carattere alla volta.
 */
function confrontoSicuro(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

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
  /**
   * Il segreto è obbligatorio, senza eccezioni.
   *
   * Prima il controllo viveva dentro `if (segretoAtteso)`: con la variabile
   * non impostata spariva del tutto e la rotta accettava qualunque corpo
   * JSON da chiunque. Questa è la rotta più delicata del progetto — da qui
   * si conferma un token di collegamento e si scrive nelle conversazioni —
   * quindi un aggiornamento inventato permetteva di associare il proprio
   * Telegram a un token altrui e di entrare nel suo account.
   *
   * Una variabile dimenticata non deve tradursi in una porta aperta: se
   * manca, la rotta si chiude invece di aprirsi.
   */
  const segretoAtteso = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!segretoAtteso) {
    console.error(
      "[webhook] TELEGRAM_WEBHOOK_SECRET non impostato: rotta disattivata.",
    );
    return NextResponse.json({ errore: "Non disponibile." }, { status: 503 });
  }

  const segretoRicevuto = richiesta.headers.get(
    "x-telegram-bot-api-secret-token",
  );
  if (!segretoRicevuto || !confrontoSicuro(segretoRicevuto, segretoAtteso)) {
    // Telegram manda sempre il segreto giusto: qui arriva solo chi ha
    // trovato l'indirizzo del webhook e sta provando a inventarsi un
    // aggiornamento. Vale la pena vederlo nel pannello.
    segnala({
      tipo: "webhook",
      ip: ipClient(richiesta.headers),
      metodo: "POST",
      percorso: "/api/telegram/webhook",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: segretoRicevuto
        ? "segreto del webhook errato"
        : "segreto del webhook assente",
    });
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
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
      "Comandi disponibili:\n/start — presentazione e collegamento account\n/aiuto — questo messaggio\n\nScrivi un messaggio normale per parlare con noi della tua richiesta aperta.",
    );
  } else if (mittente?.id) {
    // Messaggio libero: è una risposta del cliente. Finisce nella
    // conversazione della sua pratica, dove l'amministrazione la vede.
    await instradaRisposta(String(mittente.id), String(chatId), testo);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Collega un messaggio ricevuto dal bot alla richiesta giusta.
 *
 * Il cliente scrive senza indicare la pratica: prendo l'ultima ancora
 * aperta, che è quasi sempre quella di cui sta parlando. Se scrive un
 * codice all'inizio del messaggio ("R-4F2A ...") vince quello.
 */
async function instradaRisposta(
  telegramId: string,
  chatId: string,
  testo: string,
) {
  const utente = await prisma.utente.findUnique({ where: { telegramId } });
  if (!utente) {
    await inviaMessaggio(
      chatId,
      "<b>Account non collegato</b>\n\nApri il sito e collega il tuo account per scriverci da qui.",
    );
    return;
  }

  const codice = testo.match(/^([RS]-[A-Z0-9]{4,5})\b[\s,:.-]*/i);
  let richiesta = null;
  let corpo = testo;

  if (codice) {
    richiesta = await prisma.richiesta.findFirst({
      where: { codice: codice[1].toUpperCase(), utenteId: utente.id },
    });
    // Il codice è un riferimento, non parte del messaggio: se identifica
    // davvero una pratica lo tolgo dal testo.
    if (richiesta) corpo = testo.slice(codice[0].length).trim() || testo;
  }

  richiesta ??= await richiestaPerRispostaTelegram(utente.id);

  if (!richiesta) {
    await inviaMessaggio(
      chatId,
      "<b>Nessuna richiesta aperta</b>\n\nNon abbiamo pratiche aperte a tuo nome. Invia una richiesta dal sito e potrai scriverci da qui.",
    );
    return;
  }

  const messaggio = await inviaMessaggioUtente({
    richiestaId: richiesta.id,
    utenteId: utente.id,
    testo: corpo.slice(0, LUNGHEZZA_MASSIMA),
    daTelegram: true,
  });

  if (messaggio) {
    await inviaMessaggio(
      chatId,
      `<b>Messaggio ricevuto</b> · <code>${escapeHtml(richiesta.codice ?? "")}</code>\n\nTi rispondiamo al più presto.`,
    );
  }
}
