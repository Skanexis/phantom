import { prisma } from "@/lib/prisma";
import { leggiSessione } from "@/lib/sessione";
import { eStaff } from "@/lib/permessi";
import { CANALE_ADMIN, type Evento, iscrivi } from "@/lib/eventi";

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

export async function GET(richiesta: Request) {
  const sessione = await leggiSessione();
  if (!sessione) {
    return new Response("Non autorizzato.", { status: 401 });
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
        try {
          controller.close();
        } catch {
          // Già chiuso dal lato client.
        }
      }

      // Scheda chiusa o navigazione altrove: senza questo gli ascoltatori
      // resterebbero registrati e il processo accumulerebbe connessioni morte.
      richiesta.signal.addEventListener("abort", chiudi);
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
