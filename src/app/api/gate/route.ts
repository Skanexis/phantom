import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DURATA_COOKIE_SECONDI,
  NOME_COOKIE_GATE,
  creaTokenGate,
  gateAttivo,
} from "@/lib/gate";
import { azzeraLimite, registraTentativo } from "@/lib/limite";
import { ipClient } from "@/lib/rete";
import { segnala } from "@/lib/sorveglianza";

const schema = z.object({ password: z.string().min(1).max(200) });

/**
 * Limite tentativi per IP: rallenta l'attacco a forza bruta sulla password
 * del cantiere. Il conteggio vive nel processo — con una sola istanza PM2
 * è la verità completa; con più worker andrebbe spostato su store condiviso.
 */
const MAX_TENTATIVI = 8;
const FINESTRA_MS = 10 * 60 * 1000;

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

  // L'IP arriva da ipClient, che legge l'ultimo hop invece del primo: la
  // prima voce di X-Forwarded-For la scrive il client, e bastava cambiarla
  // a ogni tentativo per avere un budget nuovo e provare le password senza
  // alcun limite.
  const ip = ipClient(richiesta.headers);
  const chiave = `gate:${ip}`;

  const esito = registraTentativo(chiave, MAX_TENTATIVI, FINESTRA_MS);
  if (esito.superato) {
    segnala({
      tipo: "frequenza",
      ip,
      metodo: "POST",
      percorso: "/api/gate",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: `oltre ${MAX_TENTATIVI} tentativi di password`,
    });
    return NextResponse.json(
      { errore: "Troppi tentativi. Riprova tra qualche minuto." },
      { status: 429, headers: { "Retry-After": String(esito.attesaSecondi) } },
    );
  }

  const corpo = schema.safeParse(await richiesta.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { errore: "Password non valida." },
      { status: 400 },
    );
  }

  if (!confrontoSicuro(corpo.data.password, attesa)) {
    // Una password sbagliata capita a chi la ricorda male; una serie di
    // password sbagliate è un'altra cosa, ed è il pannello a doverlo
    // mostrare. Dodici tentativi respinti mandano l'indirizzo in quarantena.
    segnala({
      tipo: "gate",
      ip,
      metodo: "POST",
      percorso: "/api/gate",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: "password del cantiere errata",
    });
    return NextResponse.json(
      { errore: "Password non valida." },
      { status: 401 },
    );
  }

  azzeraLimite(chiave);

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
