import { EventEmitter } from "node:events";

/**
 * Bus di eventi in memoria che alimenta lo streaming SSE.
 *
 * Il badge delle notifiche si aggiornava solo al caricamento della pagina:
 * un messaggio dell'amministratore restava invisibile finché l'utente non
 * ricaricava. Qui ogni scrittura pubblica un evento e le connessioni aperte
 * lo ricevono subito.
 *
 * Vive nel processo: l'applicazione gira su una singola istanza Node dietro
 * PM2, quindi tutte le connessioni condividono questa memoria. Passando a
 * più istanze servirebbe un canale esterno (Redis pub/sub) al posto di questo
 * emitter, lasciando invariata l'interfaccia.
 */

export type TipoEvento = "notifica" | "messaggio" | "richiesta" | "abbonamento";

export type Evento = {
  tipo: TipoEvento;
  /** Destinatario. "admin" raggiunge tutti gli amministratori collegati. */
  destinatario: string;
  /** Payload libero, serializzato in JSON verso il client. */
  dati?: Record<string, unknown>;
};

/** Canale convenzionale per gli eventi diretti agli amministratori. */
export const CANALE_ADMIN = "admin";

declare global {
  var busEventiPhantom: EventEmitter | undefined;
}

/**
 * In sviluppo il hot reload rivaluta i moduli a ogni modifica: senza il
 * riuso su globalThis ogni ricompilazione creerebbe un bus nuovo, lasciando
 * le connessioni già aperte in ascolto su un emitter morto.
 */
const bus =
  globalThis.busEventiPhantom ??
  (() => {
    const emitter = new EventEmitter();
    // Un utente con molte schede aperte supera in fretta il limite di 10
    // ascoltatori, e Node stampa un avviso di perdita di memoria che qui
    // sarebbe un falso allarme.
    emitter.setMaxListeners(0);
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalThis.busEventiPhantom = bus;
}

/** Pubblica un evento verso un destinatario. Non fallisce mai. */
export function pubblica(evento: Evento) {
  try {
    bus.emit(evento.destinatario, evento);
  } catch {
    // La consegna in tempo reale è un miglioramento, non un requisito:
    // i dati restano nel database e la pagina li mostra comunque.
  }
}

/** Iscrive un ascoltatore a un canale. Restituisce la funzione di rimozione. */
export function iscrivi(canale: string, ascoltatore: (evento: Evento) => void) {
  bus.on(canale, ascoltatore);
  return () => {
    bus.off(canale, ascoltatore);
  };
}
