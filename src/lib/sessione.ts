import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import {
  eStaff,
  puoGestireOperazioni,
  puoModificareContenuti,
} from "@/lib/permessi";
import type { Ruolo } from "@/generated/prisma/client";

const NOME_COOKIE = "phantomlab_sessione";
const DURATA_SESSIONE_SECONDI = 60 * 60 * 24 * 30;

export type DatiSessione = {
  utenteId: string;
  telegramId: string;
  ruolo: Ruolo;
};

function chiaveSegreta() {
  const segreto = process.env.AUTH_SECRET;
  if (!segreto || segreto.length < 16) {
    throw new Error("AUTH_SECRET mancante o troppo corto.");
  }
  return new TextEncoder().encode(segreto);
}

export async function creaSessione(dati: DatiSessione) {
  const token = await new SignJWT({ ...dati })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURATA_SESSIONE_SECONDI}s`)
    .sign(chiaveSegreta());

  const store = await cookies();
  store.set(NOME_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURATA_SESSIONE_SECONDI,
  });
}

export async function leggiSessione(): Promise<DatiSessione | null> {
  const store = await cookies();
  const token = store.get(NOME_COOKIE)?.value;
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

export async function eliminaSessione() {
  const store = await cookies();
  store.delete(NOME_COOKIE);
}

export async function utenteCorrente() {
  const sessione = await leggiSessione();
  if (!sessione) return null;
  return prisma.utente.findUnique({ where: { id: sessione.utenteId } });
}

/** Qualunque membro dello staff: SUPPORTO, ADMIN o DEVELOPER. */
export async function richiediStaff() {
  const utente = await utenteCorrente();
  if (!utente || !eStaff(utente.ruolo)) return null;
  return utente;
}

/** Chi può cambiare stati, prorogare, assegnare: ADMIN o DEVELOPER. */
export async function richiediOperatore() {
  const utente = await utenteCorrente();
  if (!utente || !puoGestireOperazioni(utente.ruolo)) return null;
  return utente;
}

/** Solo chi può modificare il contenuto del sito: DEVELOPER. */
export async function richiediSviluppatore() {
  const utente = await utenteCorrente();
  if (!utente || !puoModificareContenuti(utente.ruolo)) return null;
  return utente;
}

export function isAdminTelegramId(telegramId: string) {
  return (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((valore) => valore.trim())
    .filter(Boolean)
    .includes(telegramId);
}
