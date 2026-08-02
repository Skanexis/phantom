/**
 * Lettura condivisa delle notifiche dal browser.
 *
 * Il problema che risolve: due componenti diversi mostrano le stesse
 * notifiche — l'anteprima nella barra di navigazione e il pannello
 * completo nell'area personale — e ognuno reagiva per conto suo agli
 * eventi del flusso SSE. Un solo messaggio inviato dall'amministrazione
 * faceva partire due richieste identiche a `/api/notifiche`, che a valle
 * sono due interrogazioni al database ciascuna: quattro letture per un
 * evento, moltiplicate per ogni persona collegata in quel momento.
 *
 * Qui la richiesta è una sola e il risultato viene condiviso. Due
 * meccanismi, per due casi diversi:
 *
 * - la promessa in volo, che copre le chiamate simultanee (è il caso
 *   normale: entrambi i componenti reagiscono allo stesso evento nello
 *   stesso istante);
 * - una validità brevissima, che copre le raffiche — tre messaggi inviati
 *   di seguito generano tre eventi ravvicinati, e senza questa ogni evento
 *   ripartirebbe da capo appena la richiesta precedente si è chiusa.
 *
 * La finestra è volutamente minuscola: il conteggio del badge arriva già
 * dentro l'evento SSE, quindi questa lettura serve al contenuto
 * dell'elenco, dove tre quarti di secondo di ritardo non sono percepibili.
 */

export type Notifica = {
  id: string;
  titolo: string;
  testo: string;
  url: string | null;
  letta: boolean;
  creatoIl: string;
};

export type RispostaNotifiche = {
  notifiche: Notifica[];
  nonLette: number;
  altreDisponibili?: boolean;
};

const VALIDITA_MS = 750;

let inVolo: Promise<RispostaNotifiche | null> | null = null;
let ultima: { dati: RispostaNotifiche; scadenza: number } | null = null;

/**
 * Prima pagina delle notifiche. Restituisce null se la lettura fallisce:
 * chi chiama tiene quello che ha già invece di svuotare l'elenco.
 */
export function caricaNotifiche(): Promise<RispostaNotifiche | null> {
  const adesso = Date.now();

  if (ultima && ultima.scadenza > adesso) {
    return Promise.resolve(ultima.dati);
  }
  if (inVolo) return inVolo;

  inVolo = fetch("/api/notifiche")
    .then((risposta) => (risposta.ok ? risposta.json() : null))
    .then((dati: RispostaNotifiche | null) => {
      if (!dati || !Array.isArray(dati.notifiche)) return null;
      ultima = { dati, scadenza: Date.now() + VALIDITA_MS };
      return dati;
    })
    .catch(() => null)
    .finally(() => {
      inVolo = null;
    });

  return inVolo;
}

/**
 * Invalida la copia locale dopo un'azione che cambia lo stato (segnare
 * come letta): la lettura successiva deve ripartire dal server, non
 * restituire il quadro di un attimo prima.
 */
export function scartaNotificheInCache() {
  ultima = null;
}
