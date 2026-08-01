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
