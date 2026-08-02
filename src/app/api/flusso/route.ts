import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { eStaff } from "@/lib/permessi";
import { CANALE_ADMIN, type Evento, iscrivi } from "@/lib/eventi";
// Rinominata all'import: qui dentro `chiudi` è già il nome della funzione
// che smonta il flusso.
import { apri, chiudi as rilasciaFlusso } from "@/lib/limite";
import { segnala } from "@/lib/sorveglianza";
import { ipClient } from "@/lib/rete";

/**
 * Flusso SSE: tiene aperta una connessione e spinge gli aggiornamenti
 * (nuove notifiche, nuovi messaggi) senza che il client interroghi il
 * server né ricarichi la pagina.
 */

// Il flusso non va mai messo in cache né reso statico.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Runtime Node: il bus di eventi usa EventEmitter, assente in edge.
export const runtime = "nodejs";

/** Ogni 25s un commento keep-alive: sotto i timeout tipici dei proxy. */
const BATTITO_MS = 25_000;

/**
 * Connessioni simultanee per utente.
 *
 * Ogni flusso aperto costa un ascoltatore sul bus, un intervallo attivo e
 * una connessione tenuta viva: sono risorse che restano occupate finché il
 * client non se ne va. Senza tetto, un solo account collegato può aprirne
 * a migliaia in un ciclo e fermare il processo — l'unica rotta del
 * progetto dove una richiesta non finisce mai da sola.
 *
 * Il valore lascia spazio all'uso normale: più schede aperte sullo stesso
 * sito, più il ricongiungimento automatico che per qualche istante si
 * sovrappone alla connessione che sta cadendo.
 */
const MAX_FLUSSI_PER_UTENTE = 6;

export async function GET(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return new Response("Non autorizzato.", { status: 401 });
  }

  const chiaveFlussi = `flusso:${sessione.utenteId}`;
  if (!apri(chiaveFlussi, MAX_FLUSSI_PER_UTENTE)) {
    segnala({
      tipo: "flussi",
      ip: ipClient(richiesta.headers),
      metodo: "GET",
      percorso: "/api/flusso",
      agente: richiesta.headers.get("user-agent"),
      dettaglio: `utente ${sessione.utenteId}: oltre ${MAX_FLUSSI_PER_UTENTE} connessioni`,
    });
    return new Response("Troppe connessioni aperte.", {
      status: 429,
      headers: { "Retry-After": "30" },
    });
  }

  const codificatore = new TextEncoder();

  const flusso = new ReadableStream({
    start(controller) {
      let chiuso = false;

      const invia = (dati: string) => {
        if (chiuso) return;
        try {
          controller.enqueue(codificatore.encode(dati));
        } catch {
          // Client sparito fra il controllo e l'invio: chiudo e basta.
          chiudi();
        }
      };

      const inviaEvento = (evento: Evento) => {
        invia(
          `event: ${evento.tipo}\ndata: ${JSON.stringify(evento.dati ?? {})}\n\n`,
        );
      };

      // Il primo messaggio porta subito il conteggio corrente: senza,
      // il badge resterebbe a zero fino al primo evento.
      const inviaStatoIniziale = async () => {
        try {
          const nonLette = await prisma.notifica.count({
            where: { utenteId: sessione.utenteId, letta: false },
          });
          invia(`event: stato\ndata: ${JSON.stringify({ nonLette })}\n\n`);
        } catch {
          // Database non raggiungibile: il flusso resta comunque aperto.
        }
      };

      // "retry" indica al browser dopo quanto riconnettersi se cade la rete;
      // la riconnessione è automatica e non serve gestirla nel client.
      invia("retry: 5000\n\n");
      void inviaStatoIniziale();

      const disiscrivi = iscrivi(sessione.utenteId, inviaEvento);
      // Lo staff riceve anche gli eventi del canale comune.
      const disiscriviAdmin = eStaff(sessione.ruolo)
        ? iscrivi(CANALE_ADMIN, inviaEvento)
        : null;

      const battito = setInterval(() => {
        invia(": battito\n\n");
      }, BATTITO_MS);

      function chiudi() {
        if (chiuso) return;
        chiuso = true;
        clearInterval(battito);
        disiscrivi();
        disiscriviAdmin?.();
        // Il posto si libera qui e non altrove: è l'unico punto che passa
        // sia dalla chiusura del client sia dall'errore in scrittura, ed è
        // protetto dalla guardia `chiuso`, quindi il conteggio non scende
        // due volte per la stessa connessione.
        rilasciaFlusso(chiaveFlussi);
        try {
          controller.close();
        } catch {
          // Già chiuso dal lato client.
        }
      }

      // Scheda chiusa o navigazione altrove: senza questo gli ascoltatori
      // resterebbero registrati e il processo accumulerebbe connessioni morte.
      richiesta.signal.addEventListener("abort", chiudi);

      // Se il client se n'è già andato prima di arrivare qui, l'evento
      // "abort" è passato e non tornerà: il posto occupato resterebbe tale
      // fino al riavvio, e bastava ripetere la richiesta interrompendola
      // subito per esaurire il tetto e restare senza notifiche.
      if (richiesta.signal.aborted) chiudi();
    },
  });

  return new Response(flusso, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disattiva il buffering di Nginx: senza, i messaggi restano fermi
      // nel proxy finché il buffer non si riempie e il "tempo reale" sparisce.
      "X-Accel-Buffering": "no",
    },
  });
}
