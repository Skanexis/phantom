import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import {
  eStaff,
  puoGestireOperazioni,
  puoModificareContenuti,
} from "@/lib/permessi";
import {
  NOME_COOKIE_SESSIONE as NOME_COOKIE,
  chiaveSegreta,
  verificaTokenSessione,
} from "@/lib/sessione-token";

export type { DatiSessione } from "@/lib/sessione-token";
import type { DatiSessione } from "@/lib/sessione-token";

const DURATA_SESSIONE_SECONDI = 60 * 60 * 24 * 30;

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
  return verificaTokenSessione(store.get(NOME_COOKIE)?.value);
}

export async function eliminaSessione() {
  const store = await cookies();
  store.delete(NOME_COOKIE);
}

/**
 * L'utente della sessione corrente, riletto dal database.
 *
 * Un account bloccato conta come non collegato, e la verifica sta qui e non
 * solo nel perimetro. Il perimetro decide su una copia in memoria degli
 * elenchi, che nell'istante fra l'avvio del processo e la prima
 * sincronizzazione è vuota: in quella finestra un bloccato passerebbe. Qui
 * invece la fonte è la riga stessa, cioè la verità, e nessuna finestra
 * esiste. È il motivo per cui i due controlli non sono una ripetizione: il
 * primo è veloce e vale per tutto il traffico, il secondo è autorevole e
 * vale dove si decidono i permessi.
 */
export async function utenteCorrente() {
  const sessione = await leggiSessione();
  if (!sessione) return null;

  const utente = await prisma.utente.findUnique({
    where: { id: sessione.utenteId },
  });

  if (!utente || utente.bloccato) return null;
  return utente;
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
