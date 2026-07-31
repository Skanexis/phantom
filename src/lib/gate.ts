import { SignJWT, jwtVerify } from "jose";

/**
 * "Modalità cantiere": il sito resta chiuso al pubblico e mostra una pagina
 * di attesa. Chi conosce la password entra e riceve un cookie firmato.
 */

export const NOME_COOKIE_GATE = "phantomlab_accesso";
const DURATA_GIORNI = 30;

/**
 * Il confronto è tollerante di proposito.
 *
 * Con `=== "true"` bastava una maiuscola, un apice non rimosso da dotenv
 * o uno spazio a fine riga per far risultare il gate spento: il sito
 * restava aperto al pubblico senza alcun errore visibile, ed è il tipo di
 * sbaglio che si nota solo quando è tardi.
 *
 * In caso di dubbio si sceglie il lato sicuro: qualsiasi valore che non
 * sia chiaramente "spento" tiene il sito chiuso.
 */
export function gateAttivo() {
  const grezzo = process.env.SITO_CHIUSO;
  if (grezzo === undefined) return false;

  const valore = grezzo.trim().replace(/^["']|["']$/g, "").toLowerCase();

  // Vuoto: variabile presente ma non valorizzata, la tratto come assente.
  if (valore === "") return false;

  return !["false", "0", "no", "off"].includes(valore);
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
