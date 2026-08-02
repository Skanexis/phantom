import { NextResponse } from "next/server";
import { z } from "zod";
import {
  creaTokenCollegamento,
  consumaToken,
  urlBot,
  urlBotNativo,
} from "@/lib/collegamento";
import { creaSessione } from "@/lib/sessione";
import { registraTentativo } from "@/lib/limite";
import { ipClient } from "@/lib/rete";
import { segnala } from "@/lib/sorveglianza";

/**
 * Il collegamento parte da chi non è ancora autenticato, quindi il limite
 * può appoggiarsi solo all'IP. Ogni chiamata scrive una riga in
 * TokenCollegamento: senza tetto, un ciclo la fa crescere all'infinito.
 */
const MAX_TOKEN = 15;
const FINESTRA_MS = 10 * 60 * 1000;

/** Avvia il collegamento: restituisce token e link al bot. */
export async function POST(richiesta: Request) {
  const esito = registraTentativo(
    `collega:${ipClient(richiesta.headers)}`,
    MAX_TOKEN,
    FINESTRA_MS,
  );
  if (esito.superato) {
    segnala({
      tipo: "frequenza",
      ip: ipClient(richiesta.headers),
      metodo: "POST",
      percorso: "/api/auth/collega",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: `oltre ${MAX_TOKEN} token di collegamento richiesti`,
    });
    return NextResponse.json(
      { errore: "Troppi tentativi di accesso. Riprova fra qualche minuto." },
      { status: 429, headers: { "Retry-After": String(esito.attesaSecondi) } },
    );
  }

  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) {
    return NextResponse.json(
      { errore: "Bot non configurato. Imposta TELEGRAM_BOT_USERNAME." },
      { status: 503 },
    );
  }

  const token = await creaTokenCollegamento();

  // Due varianti dello stesso collegamento: quella nativa apre l'app senza
  // toccare la scheda, quella https serve come ripiego dove tg:// non è
  // gestito (desktop senza Telegram installato, browser che la bloccano).
  return NextResponse.json({
    token,
    url: urlBot(token),
    urlNativo: urlBotNativo(token),
  });
}

const schema = z.object({ token: z.string().min(10).max(128) });

/**
 * Verifica lo stato del collegamento. Quando il bot ha confermato,
 * consuma il token e apre la sessione nel browser.
 */
export async function PUT(richiesta: Request) {
  const corpo = schema.safeParse(await richiesta.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Token non valido." }, { status: 400 });
  }

  const utente = await consumaToken(corpo.data.token);
  if (!utente) {
    return NextResponse.json({ stato: "in_attesa" });
  }

  await creaSessione({
    utenteId: utente.id,
    telegramId: utente.telegramId,
    ruolo: utente.ruolo,
  });

  return NextResponse.json({
    stato: "collegato",
    utente: {
      id: utente.id,
      nome: utente.nome,
      cognome: utente.cognome,
      username: utente.username,
      ruolo: utente.ruolo,
    },
  });
}
