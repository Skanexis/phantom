/**
 * Primitive del cookie di sessione, senza dipendenze dal database.
 *
 * Vivevano dentro sessione.ts, che importa Prisma. Il proxy ha bisogno di
 * riconoscere lo staff — per non chiudere fuori chi deve intervenire — ma
 * trascinarsi dietro il client del database a ogni richiesta, solo per
 * leggere un token firmato, sarebbe sproporzionato. Qui c'è il minimo:
 * il nome del cookie, la chiave e la verifica della firma.
 *
 * Il nome del cookie sta in un posto solo: scritto due volte, il giorno in
 * cui cambia si scopre l'altra copia dagli utenti disconnessi.
 */
import { jwtVerify } from "jose";
import type { Ruolo } from "@/generated/prisma/client";

export const NOME_COOKIE_SESSIONE = "phantomlab_sessione";

export type DatiSessione = {
  utenteId: string;
  telegramId: string;
  ruolo: Ruolo;
};

export function chiaveSegreta() {
  const segreto = process.env.AUTH_SECRET;
  if (!segreto || segreto.length < 16) {
    throw new Error("AUTH_SECRET mancante o troppo corto.");
  }
  return new TextEncoder().encode(segreto);
}

/**
 * Verifica un token di sessione e ne restituisce il contenuto.
 *
 * Il ruolo qui dentro è quello del momento in cui il token è stato
 * firmato, non quello attuale: per decidere cosa una persona può fare si
 * rilegge sempre dal database (vedi `utenteCorrente`). Va bene solo per
 * decisioni che sbagliare costa poco, come non applicare una quarantena.
 */
export async function verificaTokenSessione(
  token: string | undefined,
): Promise<DatiSessione | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, chiaveSegreta());
    return {
      utenteId: String(payload.utenteId),
      telegramId: String(payload.telegramId),
      ruolo: payload.ruolo as Ruolo,
    };
  } catch {
    return null;
  }
}
