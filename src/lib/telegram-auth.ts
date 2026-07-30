import crypto from "node:crypto";

export type UtenteTelegram = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

const MAX_ETA_INITDATA_SECONDI = 60 * 60 * 24;

/**
 * Verifica la firma di initData secondo l'algoritmo ufficiale Telegram.
 * Senza questo controllo chiunque potrebbe dichiarare un Telegram ID arbitrario.
 */
export function verificaInitData(
  initData: string,
  botToken: string,
): UtenteTelegram | null {
  if (!initData || !botToken) return null;

  const parametri = new URLSearchParams(initData);
  const hashRicevuto = parametri.get("hash");
  if (!hashRicevuto) return null;

  parametri.delete("hash");
  const stringaControllo = [...parametri.entries()]
    .map(([chiave, valore]) => `${chiave}=${valore}`)
    .sort()
    .join("\n");

  const chiaveSegreta = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hashCalcolato = crypto
    .createHmac("sha256", chiaveSegreta)
    .update(stringaControllo)
    .digest("hex");

  const atteso = Buffer.from(hashCalcolato, "hex");
  const ricevuto = Buffer.from(hashRicevuto, "hex");
  if (atteso.length !== ricevuto.length) return null;
  if (!crypto.timingSafeEqual(atteso, ricevuto)) return null;

  const authDate = Number(parametri.get("auth_date"));
  if (!Number.isFinite(authDate)) return null;
  const etaSecondi = Math.floor(Date.now() / 1000) - authDate;
  if (etaSecondi > MAX_ETA_INITDATA_SECONDI) return null;

  const utenteGrezzo = parametri.get("user");
  if (!utenteGrezzo) return null;

  try {
    const utente = JSON.parse(utenteGrezzo) as UtenteTelegram;
    return typeof utente?.id === "number" ? utente : null;
  } catch {
    return null;
  }
}
