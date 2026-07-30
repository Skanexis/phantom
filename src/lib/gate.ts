import { SignJWT, jwtVerify } from "jose";

/**
 * "Modalità cantiere": il sito resta chiuso al pubblico e mostra una pagina
 * di attesa. Chi conosce la password entra e riceve un cookie firmato.
 */

export const NOME_COOKIE_GATE = "phantomlab_accesso";
const DURATA_GIORNI = 30;

export function gateAttivo() {
  return process.env.SITO_CHIUSO === "true";
}

function chiave() {
  // Riuso AUTH_SECRET: è già obbligatorio e sufficientemente lungo.
  const segreto = process.env.AUTH_SECRET;
  if (!segreto || segreto.length < 16) {
    throw new Error("AUTH_SECRET mancante o troppo corto.");
  }
  return new TextEncoder().encode(segreto);
}

export async function creaTokenGate() {
  return new SignJWT({ gate: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURATA_GIORNI}d`)
    .sign(chiave());
}

export async function verificaTokenGate(token: string | undefined) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, chiave());
    return payload.gate === true;
  } catch {
    return false;
  }
}

export const DURATA_COOKIE_SECONDI = DURATA_GIORNI * 24 * 60 * 60;
