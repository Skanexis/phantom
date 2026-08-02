import type { Ruolo } from "@/generated/prisma/client";

/**
 * Tre livelli di accesso allo staff, dal più al meno ampio:
 * DEVELOPER (tutto, incluso il contenuto del sito) > ADMIN (tutto tranne
 * il contenuto) > SUPPORTO (solo conversazioni, nessuna modifica di stato).
 *
 * DEVELOPER si assegna solo da console (scripts/imposta-ruolo.ts): nessuna
 * rotta del sito deve poterlo impostare.
 */

export function eStaff(ruolo: Ruolo) {
  return ruolo === "SUPPORTO" || ruolo === "ADMIN" || ruolo === "DEVELOPER";
}

/** Prezzi, piani, servizi, vantaggi, automazioni, FAQ, contatti, testi. */
export function puoModificareContenuti(ruolo: Ruolo) {
  return ruolo === "DEVELOPER";
}

/** Stato di richieste/sottoscrizioni, proroghe, assegnazioni, eliminazioni. */
export function puoGestireOperazioni(ruolo: Ruolo) {
  return ruolo === "ADMIN" || ruolo === "DEVELOPER";
}

/** Statistiche finanziarie e volumi: fuori portata per chi fa solo supporto. */
export function puoVedereStatistiche(ruolo: Ruolo) {
  return ruolo === "ADMIN" || ruolo === "DEVELOPER";
}

/**
 * Anagrafica dei clienti: chi sono, cosa hanno attivo, cosa hanno chiesto.
 * Aperta a tutto lo staff — è esattamente il contesto che serve a SUPPORTO
 * per rispondere a una domanda senza dover chiedere a un admin.
 */
export function puoVedereUtenti(ruolo: Ruolo) {
  return eStaff(ruolo);
}

/**
 * Segnalare un account a chi può agire. È il potere che si dà a SUPPORTO al
 * posto del blocco: vede il problema per primo, ma la decisione resta a chi
 * ha il mandato di prenderla.
 */
export function puoSegnalareUtenti(ruolo: Ruolo) {
  return eStaff(ruolo);
}

/** Bloccare e sbloccare un account: ADMIN e DEVELOPER. */
export function puoBloccareAccount(ruolo: Ruolo) {
  return ruolo === "ADMIN" || ruolo === "DEVELOPER";
}

/**
 * Escludere un indirizzo o un dispositivo dal perimetro. Solo DEVELOPER:
 * colpisce chi non ha un account, quindi può prendere dentro persone che
 * non c'entrano nulla — un IP condiviso è un ufficio intero.
 */
export function puoBandireRete(ruolo: Ruolo) {
  return ruolo === "DEVELOPER";
}
