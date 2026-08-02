/**
 * Elenchi di esclusione consultati dal perimetro.
 *
 * Il modulo non importa Prisma, ed è il punto centrale del suo disegno: il
 * middleware deve poter rispondere "questa richiesta entra o no" senza
 * toccare il database. Un `SELECT` per richiesta trasformerebbe il blocco
 * in un moltiplicatore del danno — chi è bandito continua a bussare, e ogni
 * colpo costerebbe una interrogazione — cioè esattamente il contrario di
 * quello che un blocco deve fare.
 *
 * La verità sta a database; qui c'è una copia in memoria che un compito
 * periodico riallinea (vedi `bandi-db.ts` e `instrumentation.ts`), e che le
 * azioni del pannello aggiornano subito, senza aspettare il giro
 * successivo. Il ritardo massimo fra una decisione e la sua applicazione su
 * un altro processo è quindi un giro di sincronizzazione, non l'infinito.
 *
 * Come per la sorveglianza, lo stato vive su globalThis: perimetro e rotte
 * finiscono in bundle distinti, e due `new Set()` a livello di modulo
 * sarebbero due insiemi diversi — con il pannello che mostra un blocco
 * attivo mentre il perimetro non ne sa nulla.
 */

export const NOME_COOKIE_DISPOSITIVO = "phantomlab_dispositivo";

/** Un anno: il marcatore deve sopravvivere alle visite occasionali. */
export const DURATA_COOKIE_DISPOSITIVO = 60 * 60 * 24 * 365;

export type Elenchi = {
  ip: Set<string>;
  dispositivi: Set<string>;
  account: Set<string>;
  /** Quando è stata riallineata l'ultima volta. */
  aggiornatoIl: number;
};

function elenchi(): Elenchi {
  const globale = globalThis as unknown as { __bandi?: Elenchi };

  globale.__bandi ??= {
    ip: new Set(),
    dispositivi: new Set(),
    account: new Set(),
    aggiornatoIl: 0,
  };

  return globale.__bandi;
}

/**
 * Sostituisce gli elenchi con quelli appena letti dal database.
 *
 * Sostituzione e non fusione: un bando revocato deve sparire, e un insieme
 * a cui si aggiunge soltanto non dimentica mai nulla — il blocco
 * diventerebbe irrevocabile fino al riavvio del processo.
 */
export function applicaElenchi(dati: {
  ip: string[];
  dispositivi: string[];
  account: string[];
}) {
  const stato = elenchi();
  stato.ip = new Set(dati.ip);
  stato.dispositivi = new Set(dati.dispositivi);
  stato.account = new Set(dati.account);
  stato.aggiornatoIl = Date.now();
}

/**
 * Aggiunge una voce senza aspettare la sincronizzazione: chi blocca deve
 * vedere l'effetto adesso, non fra venti secondi.
 */
export function aggiungiLocale(
  tipo: "ip" | "dispositivi" | "account",
  valore: string,
) {
  elenchi()[tipo].add(valore);
}

export function togliLocale(
  tipo: "ip" | "dispositivi" | "account",
  valore: string,
) {
  elenchi()[tipo].delete(valore);
}

export type EsitoEsclusione = {
  bloccato: boolean;
  /** Quale elenco ha risposto: serve a scegliere cosa dire in schermata. */
  causa: "ip" | "dispositivo" | "account" | null;
};

const LIBERO: EsitoEsclusione = { bloccato: false, causa: null };

/**
 * Verifica in tre insiemi. L'ordine non è indifferente: il blocco
 * dell'account è il più specifico e il più motivato, quindi vince sugli
 * altri quando valgono insieme — è quello di cui la persona ha diritto di
 * sapere, mentre "il tuo indirizzo è escluso" a un cliente bloccato per il
 * suo comportamento sarebbe una spiegazione sbagliata.
 */
export function valutaEsclusione(dati: {
  ip: string;
  dispositivo?: string | null;
  utenteId?: string | null;
}): EsitoEsclusione {
  const stato = elenchi();

  if (dati.utenteId && stato.account.has(dati.utenteId)) {
    return { bloccato: true, causa: "account" };
  }
  if (stato.ip.has(dati.ip)) return { bloccato: true, causa: "ip" };
  if (dati.dispositivo && stato.dispositivi.has(dati.dispositivo)) {
    return { bloccato: true, causa: "dispositivo" };
  }

  return LIBERO;
}

/** Quadro per il pannello: quante esclusioni sono in vigore e da quando. */
export function statoElenchi() {
  const stato = elenchi();
  return {
    ip: stato.ip.size,
    dispositivi: stato.dispositivi.size,
    account: stato.account.size,
    aggiornatoIl: stato.aggiornatoIl,
  };
}

/**
 * Identificativo del dispositivo.
 *
 * Va detto senza giri di parole, perché il nome può ingannare: non è
 * un'impronta dell'hardware, e nessun sito può ricavarne una. È un numero
 * casuale che il server deposita nel browser alla prima visita e ritrova
 * alle successive. Regge il cambio di rete, di indirizzo IP e di account —
 * che è ciò che serve contro chi si ricrea un profilo — e non regge la
 * navigazione in incognito né la cancellazione dei dati del sito.
 *
 * Serve ad alzare il costo di ricominciare da capo, non a rendere la cosa
 * impossibile: chi vuole aggirarlo ci riesce, ma deve accorgersene e fare
 * un passo in più ogni volta.
 */
export function nuovoIdentificativoDispositivo(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Forma attesa: solo esadecimale, lunghezza fissa. Il valore arriva da un
 *  cookie, cioè da fuori, e finisce in una pagina e in un indice. */
export function identificativoValido(valore: string | undefined): boolean {
  return typeof valore === "string" && /^[0-9a-f]{32}$/.test(valore);
}
