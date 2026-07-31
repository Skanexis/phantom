import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_GATE, gateAttivo, verificaTokenGate } from "@/lib/gate";

/**
 * Con SITO_CHIUSO=true tutto il traffico finisce sulla pagina di attesa,
 * tranne chi possiede il cookie di sblocco.
 */

// Percorsi sempre raggiungibili: il webhook del bot deve continuare a
// funzionare anche a sito chiuso, altrimenti Telegram accumula errori.
const PERCORSI_LIBERI = ["/manutenzione", "/api/gate", "/api/telegram/webhook"];

/**
 * Diagnostica al primo passaggio.
 *
 * Il middleware gira nel runtime edge, che riceve le variabili d'ambiente
 * per una strada diversa dal resto dell'applicazione: se SITO_CHIUSO non
 * arriva fin qui, il gate resta spento e il sito è pubblico senza che
 * nulla lo segnali. Una riga nei log di PM2 rende il problema visibile
 * invece di lasciarlo indovinare.
 */
let diagnosticaFatta = false;

export async function middleware(richiesta: NextRequest) {
  if (!diagnosticaFatta) {
    diagnosticaFatta = true;
    const grezzo = process.env.SITO_CHIUSO;
    console.log(
      `[gate] SITO_CHIUSO=${JSON.stringify(grezzo)} -> sito ${
        gateAttivo() ? "CHIUSO" : "APERTO"
      }`,
    );
  }

  if (!gateAttivo()) return NextResponse.next();

  const { pathname } = richiesta.nextUrl;

  if (PERCORSI_LIBERI.some((percorso) => pathname.startsWith(percorso))) {
    return NextResponse.next();
  }

  const sbloccato = await verificaTokenGate(
    richiesta.cookies.get(NOME_COOKIE_GATE)?.value,
  );
  if (sbloccato) return NextResponse.next();

  // Le API rispondono 503 invece di servire l'HTML della pagina di attesa.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { errore: "Servizio momentaneamente non disponibile." },
      { status: 503 },
    );
  }

  // rewrite, non redirect: l'URL nella barra resta quello richiesto, così la
  // pagina di attesa non rivela l'esistenza di un percorso riservato.
  const destinazione = richiesta.nextUrl.clone();
  destinazione.pathname = "/manutenzione";
  destinazione.search = "";
  return NextResponse.rewrite(destinazione);
}

export const config = {
  // Esclude asset statici e immagini: non serve valutarli a ogni richiesta.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
