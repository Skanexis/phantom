import type { StatoRichiesta } from "@/generated/prisma/client";

/**
 * Come leggere lo stato di una richiesta, allo stesso modo ovunque.
 */

/** Lavorazione in corso: sono le richieste che meritano attenzione. */
export const STATI_ATTIVI: StatoRichiesta[] = [
  "NUOVA",
  "IN_LAVORAZIONE",
  "IN_ATTESA_CLIENTE",
];

/**
 * Stati visibili nell'area personale.
 *
 * ANNULLATA è esclusa di proposito: una richiesta rifiutata sparisce dal
 * cabinet del cliente e resta soltanto la notifica che spiega il motivo.
 * Nel pannello admin continua a esistere, così un rifiuto per errore si
 * può correggere rimettendo lo stato precedente.
 */
export const STATI_VISIBILI_CLIENTE: StatoRichiesta[] = [
  ...STATI_ATTIVI,
  "COMPLETATA",
];

/** Vero se la pratica è ancora aperta. */
export function inLavorazione(stato: StatoRichiesta) {
  return STATI_ATTIVI.includes(stato);
}

/**
 * Vero quando la palla è al cliente: è l'unico stato in cui l'attesa
 * dipende da lui, e va segnalato più forte degli altri.
 */
export function attendeIlCliente(stato: StatoRichiesta) {
  return stato === "IN_ATTESA_CLIENTE";
}

/** Link diretto alla scheda Richieste dell'area personale, con la pratica
 * già in evidenza: usato nelle notifiche così un tocco porta dritto lì
 * invece di lasciare che sia il cliente a ritrovarla nell'elenco. */
export function linkRichiesta(codice: string | null) {
  if (!codice) return "/area-personale?scheda=richieste";
  return `/area-personale?scheda=richieste&richiesta=${encodeURIComponent(codice)}`;
}

/** Giorni interi trascorsi da una data. */
export function giorniDa(data: Date, ora = new Date()) {
  return Math.floor((ora.getTime() - data.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Da quanto tempo non si muove nulla, in forma leggibile.
 * Serve a distinguere a colpo d'occhio una pratica di ieri da una ferma
 * da mesi, che nel solo elenco cronologico si somigliano.
 */
export function quandoAggiornata(data: Date, ora = new Date()) {
  const giorni = giorniDa(data, ora);
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "ieri";
  if (giorni < 30) return `${giorni} giorni fa`;
  const mesi = Math.floor(giorni / 30);
  if (mesi === 1) return "un mese fa";
  if (mesi < 12) return `${mesi} mesi fa`;
  const anni = Math.floor(mesi / 12);
  return anni === 1 ? "un anno fa" : `${anni} anni fa`;
}
