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
 * finiscono in bundle distinti, e due `new Map()` a livello di modulo
 * sarebbero due mappe diverse — con il pannello che mostra un blocco attivo
 * mentre il perimetro non ne sa nulla.
 *
 * Mappe e non insiemi: la schermata di blocco deve poter dire *cosa* è
 * stato bandito, *perché* e *fino a quando*, e deve poterlo fare senza
 * interrogare il database — cioè proprio sulla richiesta di chi sta
 * bussando da bloccato, che è la meno meritevole di una query. Il costo di
 * una lettura è lo stesso di un insieme.
 */

import { sottoretiDi } from "@/lib/rete";

export const NOME_COOKIE_DISPOSITIVO = "phantomlab_dispositivo";

/** Un anno: il marcatore deve sopravvivere alle visite occasionali. */
export const DURATA_COOKIE_DISPOSITIVO = 60 * 60 * 24 * 365;

/** Ciò che si sa di un provvedimento senza andare a database. */
export type DettaglioBando = {
  motivo: string;
  /** Millisecondi epoch, o null per un provvedimento permanente. */
  scadeIl: number | null;
};

export type Elenchi = {
  ip: Map<string, DettaglioBando>;
  /** CIDR già normalizzati: vedi `valutaEsclusione` per il perché. */
  sottoreti: Map<string, DettaglioBando>;
  dispositivi: Map<string, DettaglioBando>;
  account: Map<string, DettaglioBando>;
  /**
   * Indirizzi esentati dal bando della propria sottorete.
   *
   * Bandire una rete è uno strumento grosso: ferma l'attacco, e insieme
   * chiude fuori tutti gli altri che stanno dietro quegli indirizzi. Questo
   * elenco è il modo di correggere il singolo caso senza revocare il
   * provvedimento — è la risposta che uno sviluppatore dà a un ricorso
   * accolto.
   *
   * Vale **solo** contro il bando di sottorete, non contro quello del
   * singolo indirizzo: se qualcuno ha bandito esattamente questo indirizzo,
   * lo ha fatto guardandolo, e un'eccezione che lo scavalcasse in silenzio
   * renderebbe il provvedimento inaffidabile senza dirlo a nessuno.
   */
  eccezioni: Set<string>;
  /** Quando è stata riallineata l'ultima volta. */
  aggiornatoIl: number;
};

function elenchi(): Elenchi {
  const globale = globalThis as unknown as { __bandi?: Elenchi };

  globale.__bandi ??= {
    ip: new Map(),
    sottoreti: new Map(),
    dispositivi: new Map(),
    account: new Map(),
    eccezioni: new Set(),
    aggiornatoIl: 0,
  };

  return globale.__bandi;
}

export type VoceElenco = { valore: string } & DettaglioBando;

/**
 * Sostituisce gli elenchi con quelli appena letti dal database.
 *
 * Sostituzione e non fusione: un bando revocato deve sparire, e una mappa a
 * cui si aggiunge soltanto non dimentica mai nulla — il blocco diventerebbe
 * irrevocabile fino al riavvio del processo.
 */
export function applicaElenchi(dati: {
  ip: VoceElenco[];
  sottoreti: VoceElenco[];
  dispositivi: VoceElenco[];
  account: VoceElenco[];
  eccezioni: string[];
}) {
  const stato = elenchi();
  const mappa = (voci: VoceElenco[]) =>
    new Map(
      voci.map((voce) => [
        voce.valore,
        { motivo: voce.motivo, scadeIl: voce.scadeIl },
      ]),
    );

  stato.ip = mappa(dati.ip);
  stato.sottoreti = mappa(dati.sottoreti);
  stato.dispositivi = mappa(dati.dispositivi);
  stato.account = mappa(dati.account);
  stato.eccezioni = new Set(dati.eccezioni);
  stato.aggiornatoIl = Date.now();
}

/** Le famiglie di elenco, come si chiamano dentro `Elenchi`. */
export type FamigliaBando = "ip" | "sottoreti" | "dispositivi" | "account";

/**
 * Aggiunge una voce senza aspettare la sincronizzazione: chi blocca deve
 * vedere l'effetto adesso, non fra venti secondi.
 */
export function aggiungiLocale(
  tipo: FamigliaBando,
  valore: string,
  dettaglio: DettaglioBando = { motivo: "", scadeIl: null },
) {
  elenchi()[tipo].set(valore, dettaglio);
}

export function togliLocale(tipo: FamigliaBando, valore: string) {
  elenchi()[tipo].delete(valore);
}

export function aggiungiEccezioneLocale(ip: string) {
  elenchi().eccezioni.add(ip);
}

export function togliEccezioneLocale(ip: string) {
  elenchi().eccezioni.delete(ip);
}

/**
 * Risposta di un'azione del pannello.
 *
 * Esiste perché il silenzio è la peggiore delle risposte: le azioni di
 * esclusione uscivano con un `return` muto su ogni controllo fallito — forma
 * dell'indirizzo, tipo sconosciuto, valore vuoto — e chi premeva il pulsante
 * vedeva la pagina ricaricarsi identica. Un bando che non è stato creato e
 * un bando creato si presentavano allo stesso modo, e l'unico modo di
 * scoprire la differenza era aspettare che non funzionasse.
 */
export type EsitoAzione = { ok: boolean; messaggio: string };

export type CausaEsclusione = "ip" | "sottorete" | "dispositivo" | "account";

export type EsitoEsclusione = {
  bloccato: boolean;
  /** Quale elenco ha risposto: serve a scegliere cosa dire in schermata. */
  causa: CausaEsclusione | null;
  /**
   * Il valore che ha fatto scattare il blocco: l'indirizzo, la rete, il
   * marcatore. Null per l'account, dove il valore sarebbe l'identificativo
   * interno — un dato che non serve a chi legge e che non ha motivo di
   * uscire dal server.
   */
  valore: string | null;
  motivo: string;
  scadeIl: number | null;
};

const LIBERO: EsitoEsclusione = {
  bloccato: false,
  causa: null,
  valore: null,
  motivo: "",
  scadeIl: null,
};

/**
 * Verifica in quattro elenchi. L'ordine non è indifferente: il blocco
 * dell'account è il più specifico e il più motivato, quindi vince sugli
 * altri quando valgono insieme — è quello di cui la persona ha diritto di
 * sapere, mentre "il tuo indirizzo è escluso" a un cliente bloccato per il
 * suo comportamento sarebbe una spiegazione sbagliata. Fra indirizzo e
 * sottorete vince l'indirizzo, per la stessa ragione: è la decisione presa
 * su quel singolo caso, non quella presa sulla rete che lo contiene.
 *
 * La sottorete si verifica calcolando le reti dell'indirizzo in arrivo e
 * cercandole nella mappa — non scorrendo i provvedimenti per vedere quale
 * contiene l'indirizzo. La differenza non è di stile: questa funzione gira
 * su ogni richiesta del sito, e la seconda forma costerebbe quanto il
 * numero di bandi in vigore, cioè diventerebbe più lenta man mano che si
 * bandisce di più. Ciò che la rende possibile è che i prefissi ammessi sono
 * un elenco chiuso e il bando si conserva già normalizzato: due letture da
 * una mappa, sempre, qualunque sia la dimensione dell'elenco.
 */
export function valutaEsclusione(dati: {
  ip: string;
  dispositivo?: string | null;
  utenteId?: string | null;
}): EsitoEsclusione {
  const stato = elenchi();

  if (dati.utenteId) {
    const conto = stato.account.get(dati.utenteId);
    if (conto) {
      return {
        bloccato: true,
        causa: "account",
        valore: null,
        motivo: conto.motivo,
        scadeIl: conto.scadeIl,
      };
    }
  }

  const indirizzo = stato.ip.get(dati.ip);
  if (indirizzo) {
    return {
      bloccato: true,
      causa: "ip",
      valore: dati.ip,
      motivo: indirizzo.motivo,
      scadeIl: indirizzo.scadeIl,
    };
  }

  // Salta il calcolo quando non c'è nessuna rete bandita: è il caso normale,
  // e `sottoretiDi` costa comunque qualcosa su ogni richiesta. L'eccezione
  // si guarda solo qui dentro, per lo stesso motivo.
  if (stato.sottoreti.size > 0 && !stato.eccezioni.has(dati.ip)) {
    for (const nome of sottoretiDi(dati.ip)) {
      const rete = stato.sottoreti.get(nome);
      if (rete) {
        return {
          bloccato: true,
          causa: "sottorete",
          valore: nome,
          motivo: rete.motivo,
          scadeIl: rete.scadeIl,
        };
      }
    }
  }

  if (dati.dispositivo) {
    const marcatore = stato.dispositivi.get(dati.dispositivo);
    if (marcatore) {
      return {
        bloccato: true,
        causa: "dispositivo",
        valore: dati.dispositivo,
        motivo: marcatore.motivo,
        scadeIl: marcatore.scadeIl,
      };
    }
  }

  return LIBERO;
}

/** Quadro per il pannello: quante esclusioni sono in vigore e da quando. */
export function statoElenchi() {
  const stato = elenchi();
  return {
    ip: stato.ip.size,
    sottoreti: stato.sottoreti.size,
    dispositivi: stato.dispositivi.size,
    account: stato.account.size,
    eccezioni: stato.eccezioni.size,
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
