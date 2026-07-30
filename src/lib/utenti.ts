type DatiUtente = {
  username?: string | null;
  telegramId?: string | null;
  nome?: string | null;
} | null;

/**
 * Riferimento leggibile a un utente: "@mario (123456789)".
 *
 * Lo username è quello che l'amministratore riconosce a colpo d'occhio,
 * l'ID fra parentesi resta l'identificatore stabile — gli username su
 * Telegram si cambiano, e senza ID una vecchia richiesta diventerebbe
 * irrintracciabile.
 */
export function riferimentoUtente(utente: DatiUtente) {
  if (!utente) return "utente sconosciuto";

  const id = utente.telegramId ?? "";
  if (utente.username) {
    return id ? `@${utente.username} (${id})` : `@${utente.username}`;
  }
  if (utente.nome) return id ? `${utente.nome} (${id})` : utente.nome;
  return id || "utente sconosciuto";
}
