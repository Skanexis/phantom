import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DURATA_COOKIE_SECONDI,
  NOME_COOKIE_GATE,
  creaTokenGate,
  gateAttivo,
} from "@/lib/gate";

const schema = z.object({ password: z.string().min(1).max(200) });

/**
 * Limite tentativi in memoria, per IP. Sufficiente a rallentare un attacco
 * a forza bruta su una singola istanza; con più istanze serve uno store condiviso.
 */
const tentativi = new Map<string, { conteggio: number; scadenza: number }>();
const MAX_TENTATIVI = 8;
const FINESTRA_MS = 10 * 60 * 1000;

function troppiTentativi(ip: string) {
  const adesso = Date.now();
  const voce = tentativi.get(ip);

  if (!voce || voce.scadenza < adesso) {
    tentativi.set(ip, { conteggio: 1, scadenza: adesso + FINESTRA_MS });
    return false;
  }

  voce.conteggio += 1;
  return voce.conteggio > MAX_TENTATIVI;
}

function confrontoSicuro(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export async function POST(richiesta: Request) {
  if (!gateAttivo()) {
    return NextResponse.json({ ok: true });
  }

  const attesa = process.env.SITO_PASSWORD;
  if (!attesa) {
    return NextResponse.json(
      { errore: "Accesso non configurato." },
      { status: 503 },
    );
  }

  const ip =
    richiesta.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    richiesta.headers.get("x-real-ip") ||
    "sconosciuto";

  if (troppiTentativi(ip)) {
    return NextResponse.json(
      { errore: "Troppi tentativi. Riprova tra qualche minuto." },
      { status: 429 },
    );
  }

  const corpo = schema.safeParse(await richiesta.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ errore: "Password non valida." }, { status: 400 });
  }

  if (!confrontoSicuro(corpo.data.password, attesa)) {
    return NextResponse.json({ errore: "Password non valida." }, { status: 401 });
  }

  tentativi.delete(ip);

  const risposta = NextResponse.json({ ok: true });
  risposta.cookies.set(NOME_COOKIE_GATE, await creaTokenGate(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURATA_COOKIE_SECONDI,
  });

  return risposta;
}

/** Esce dalla modalità riservata su questo dispositivo. */
export async function DELETE() {
  const risposta = NextResponse.json({ ok: true });
  risposta.cookies.delete(NOME_COOKIE_GATE);
  return risposta;
}
