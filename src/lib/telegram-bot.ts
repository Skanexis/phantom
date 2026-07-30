const API_BASE = "https://api.telegram.org";

/**
 * Invia un messaggio via bot. Non solleva eccezioni: una notifica fallita
 * non deve mai far fallire l'operazione applicativa che l'ha generata.
 */
export async function inviaMessaggio(chatId: string, testo: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const risposta = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: testo,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return risposta.ok;
  } catch {
    return false;
  }
}

export const etichetteAmbito: Record<string, string> = {
  SITO_WEB: "Sito web",
  APPLICAZIONE: "Applicazione",
  AUTOMAZIONE: "Automazione dei processi",
};

export const etichetteStato: Record<string, string> = {
  NUOVA: "Nuova",
  IN_LAVORAZIONE: "In lavorazione",
  IN_ATTESA_CLIENTE: "In attesa del cliente",
  COMPLETATA: "Completata",
  ANNULLATA: "Annullata",
};

export const etichetteStatoAbbonamento: Record<string, string> = {
  IN_ATTESA: "In attesa di attivazione",
  ATTIVO: "Attivo",
  SOSPESO: "Sospeso",
  SCADUTO: "Scaduto",
  ANNULLATO: "Annullato",
};
