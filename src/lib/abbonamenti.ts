import type {
  Abbonamento,
  AbbonamentoUtente,
  StatoAbbonamentoUtente,
} from "@/generated/prisma/client";

/**
 * Logica condivisa fra area personale, pannello admin e API: la scadenza
 * di un abbonamento va calcolata e interpretata sempre allo stesso modo,
 * altrimenti utente e amministratore vedono due verità diverse.
 */

const GIORNO_MS = 24 * 60 * 60 * 1000;

/** Giorni entro cui un rinnovo è considerato "in arrivo". */
export const SOGLIA_IN_SCADENZA_GIORNI = 7;

/**
 * Durata di un ciclo a partire dal campo `periodo` del piano, che è testo
 * libero editabile da admin: accetto le forme che compaiono davvero nel
 * pannello e ricado sul mese, il caso di gran lunga più comune.
 */
export function scadenzaDaPeriodo(periodo: string, inizio = new Date()) {
  const normalizzato = periodo.trim().toLowerCase();
  const scadenza = new Date(inizio);

  if (/^(anno|anni|annuale|year|yearly)$/.test(normalizzato)) {
    scadenza.setFullYear(scadenza.getFullYear() + 1);
    return scadenza;
  }
  if (/^(settimana|settimanale|week|weekly)$/.test(normalizzato)) {
    scadenza.setDate(scadenza.getDate() + 7);
    return scadenza;
  }
  if (/^(trimestre|trimestrale|quarter)$/.test(normalizzato)) {
    scadenza.setMonth(scadenza.getMonth() + 3);
    return scadenza;
  }
  if (/^(semestre|semestrale)$/.test(normalizzato)) {
    scadenza.setMonth(scadenza.getMonth() + 6);
    return scadenza;
  }

  // Mese di calendario, non 30 giorni fissi: chi attiva il 31 gennaio si
  // aspetta il rinnovo a fine febbraio, non il 2 marzo.
  scadenza.setMonth(scadenza.getMonth() + 1);
  return scadenza;
}

/** Giorni interi che mancano alla scadenza; negativo se già passata. */
export function giorniAllaScadenza(scadeIl: Date | null, ora = new Date()) {
  if (!scadeIl) return null;
  return Math.ceil((scadeIl.getTime() - ora.getTime()) / GIORNO_MS);
}

type Sottoscrizione = Pick<AbbonamentoUtente, "stato" | "scadeIl">;

/**
 * Stato reale al momento della lettura. Senza processo pianificato, un
 * ATTIVO con `scadeIl` nel passato resterebbe ATTIVO in eterno: qui viene
 * mostrato come SCADUTO, e le azioni admin allineano poi il database.
 */
export function statoEffettivo(
  sottoscrizione: Sottoscrizione,
  ora = new Date(),
): StatoAbbonamentoUtente {
  if (
    sottoscrizione.stato === "ATTIVO" &&
    sottoscrizione.scadeIl &&
    sottoscrizione.scadeIl.getTime() <= ora.getTime()
  ) {
    return "SCADUTO";
  }
  return sottoscrizione.stato;
}

/** Vero se attivo e con il rinnovo entro la soglia: da segnalare all'utente. */
export function inScadenza(sottoscrizione: Sottoscrizione, ora = new Date()) {
  if (statoEffettivo(sottoscrizione, ora) !== "ATTIVO") return false;
  const giorni = giorniAllaScadenza(sottoscrizione.scadeIl, ora);
  return giorni !== null && giorni <= SOGLIA_IN_SCADENZA_GIORNI;
}

/** Stati che occupano uno "slot": impediscono una seconda richiesta uguale. */
export const STATI_APERTI: StatoAbbonamentoUtente[] = ["IN_ATTESA", "ATTIVO"];

/** Stati mostrati nell'area personale, compresi quelli da rinnovare. */
export const STATI_VISIBILI: StatoAbbonamentoUtente[] = [
  "IN_ATTESA",
  "ATTIVO",
  "SOSPESO",
  "SCADUTO",
];

type PianoPrezzo = Pick<Abbonamento, "prezzoCentesimi" | "valuta" | "periodo">;

/** Ricavo mensile equivalente, per il riepilogo del pannello admin. */
export function valoreMensileCentesimi(piano: PianoPrezzo) {
  const normalizzato = piano.periodo.trim().toLowerCase();
  if (/^(anno|anni|annuale|year|yearly)$/.test(normalizzato)) {
    return Math.round(piano.prezzoCentesimi / 12);
  }
  if (/^(settimana|settimanale|week|weekly)$/.test(normalizzato)) {
    return Math.round((piano.prezzoCentesimi * 52) / 12);
  }
  if (/^(trimestre|trimestrale|quarter)$/.test(normalizzato)) {
    return Math.round(piano.prezzoCentesimi / 3);
  }
  if (/^(semestre|semestrale)$/.test(normalizzato)) {
    return Math.round(piano.prezzoCentesimi / 6);
  }
  return piano.prezzoCentesimi;
}

/** Data leggibile e compatta, coerente in tutta l'interfaccia. */
export function dataBreve(data: Date | string | null) {
  if (!data) return null;
  const valore = typeof data === "string" ? new Date(data) : data;
  return valore.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
