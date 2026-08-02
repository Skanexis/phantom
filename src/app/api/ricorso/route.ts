import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ipClient, sottorete } from "@/lib/rete";
import { registraTentativo } from "@/lib/limite";
import {
  NOME_COOKIE_DISPOSITIVO,
  identificativoValido,
  valutaEsclusione,
} from "@/lib/bandi";
import {
  NOME_COOKIE_SESSIONE,
  verificaTokenSessione,
} from "@/lib/sessione-token";
import { accodaAllerta } from "@/lib/sorveglianza";

/**
 * Ricorso di chi è stato bloccato: l'unica porta che resta aperta.
 *
 * È una rotta con una proprietà che nessun'altra ha — il middleware la
 * esenta dal controllo delle esclusioni (vedi ROTTA_RICORSO), altrimenti il
 * pulsante «È uno sbaglio» sarebbe un pulsante che non può funzionare — e
 * questo la rende, per costruzione, l'unico bersaglio raggiungibile da chi
 * il perimetro sta respingendo. Tutto ciò che segue esiste per quel motivo:
 *
 * 1. **Si accetta solo da chi è davvero bloccato.** Ricalcolare
 *    l'esclusione qui dentro costa quattro letture da mappe in memoria, e
 *    trasforma una rotta aperta a tutta internet in una rotta aperta a un
 *    insieme che abbiamo scelto noi. Senza questo controllo sarebbe un
 *    modulo di contatto anonimo senza limiti, cioè una casella di posta per
 *    lo spam.
 * 2. **Limite di frequenza stretto, per indirizzo.** Chi è bloccato ha
 *    tempo da perdere: due tentativi l'ora bastano a chi ha davvero
 *    qualcosa da dire.
 * 3. **Un ricorso aperto per indirizzo.** Il secondo aggiorna il testo del
 *    primo invece di creare una riga nuova, come già fa `segnalaUtente` per
 *    le segnalazioni sullo stesso account: senza, chi insiste riempirebbe
 *    la coda dello sviluppatore da solo, e la coda smetterebbe di essere
 *    l'elenco dei casi da decidere.
 *
 * Runtime Node esplicito: legge gli elenchi su globalThis, che esistono
 * solo qui e non nella sandbox edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Due tentativi l'ora per indirizzo. */
const MAX_RICORSI = 2;
const FINESTRA_MS = 60 * 60 * 1000;

const MASSIMO_MESSAGGIO = 600;
const MASSIMO_CONTATTO = 120;

/**
 * Caratteri di controllo, scritti come categoria Unicode invece che come
 * intervallo di codici: `\p{Cc}` è esattamente l'insieme che interessa, e a
 * differenza di una classe compilata a mano non contiene byte invisibili
 * che un editor o un copia-incolla possono rovinare senza lasciare traccia.
 * Tabulazione e a capo si salvano dividendo prima il testo per righe.
 */
const CONTROLLI = /\p{Cc}/gu;

/**
 * Ripulisce ciò che arriva da fuori e finisce in una pagina del pannello.
 *
 * Si tolgono i soli caratteri di controllo, tenendo gli a capo: il testo è
 * un racconto di qualche riga, e appiattirlo lo renderebbe più difficile da
 * leggere proprio a chi deve decidere. Stessa regola di `sorveglianza.ts`.
 */
function ripulisci(valore: unknown, massimo: number): string {
  if (typeof valore !== "string") return "";
  return valore
    .split("\n")
    .map((riga) => riga.replace(CONTROLLI, ""))
    .join("\n")
    .trim()
    .slice(0, massimo);
}

export async function POST(richiesta: Request) {
  const intestazioni = await headers();
  const biscotti = await cookies();
  const ip = ipClient(intestazioni);

  const limite = registraTentativo(`ricorso:${ip}`, MAX_RICORSI, FINESTRA_MS);
  if (limite.superato) {
    return NextResponse.json(
      {
        errore:
          "Hai già inviato una segnalazione di recente. Uno sviluppatore la leggerà: non serve rinviarla.",
      },
      { status: 429, headers: { "Retry-After": String(limite.attesaSecondi) } },
    );
  }

  const cookieDispositivo = biscotti.get(NOME_COOKIE_DISPOSITIVO)?.value;
  const dispositivo = identificativoValido(cookieDispositivo)
    ? (cookieDispositivo as string)
    : null;

  const cookieSessione = biscotti.get(NOME_COOKIE_SESSIONE)?.value;
  const sessione = cookieSessione
    ? await verificaTokenSessione(cookieSessione)
    : null;

  const esclusione = valutaEsclusione({
    ip,
    dispositivo,
    utenteId: sessione?.utenteId,
  });

  // Chi non è bloccato non ha nulla da ricorrere. 404 e non 403: a chi non
  // è nella condizione di usarla, questa rotta non deve nemmeno risultare
  // esistente.
  if (!esclusione.bloccato || !esclusione.causa) {
    return NextResponse.json({ errore: "Non trovato." }, { status: 404 });
  }

  const corpo = await richiesta.json().catch(() => null);
  const messaggio = ripulisci(corpo?.messaggio, MASSIMO_MESSAGGIO);
  const contatto = ripulisci(corpo?.contatto, MASSIMO_CONTATTO) || null;

  if (messaggio.length < 10) {
    return NextResponse.json(
      { errore: "Scrivi almeno una frase: serve a capire il caso." },
      { status: 400 },
    );
  }

  // Causa e valore si prendono dalla valutazione, non dal corpo della
  // richiesta: sono l'unica parte del ricorso che deve restare vera anche
  // se chi scrive prova a raccontarla diversamente.
  const causa = esclusione.causa;
  const valore = esclusione.valore ?? ip;
  const agente = ripulisci(intestazioni.get("user-agent"), 200);

  try {
    const aperto = await prisma.ricorso.findFirst({
      where: { ip, stato: "APERTO" },
      select: { id: true, messaggio: true },
    });

    if (aperto) {
      // Il testo si accoda con un tetto: senza, riscrivere allo stesso
      // indirizzo allungherebbe la stessa riga all'infinito.
      await prisma.ricorso.update({
        where: { id: aperto.id },
        data: {
          messaggio: `${aperto.messaggio}\n\n— ancora: ${messaggio}`.slice(
            0,
            2000,
          ),
          contatto: contatto ?? undefined,
        },
      });

      return NextResponse.json({ ok: true, gia: true });
    }

    await prisma.ricorso.create({
      data: {
        causa,
        valore,
        ip,
        sottorete: sottorete(ip),
        dispositivo,
        utenteId: sessione?.utenteId ?? null,
        messaggio,
        contatto,
        agente,
      },
    });
  } catch (eccezione) {
    console.error("[ricorso] scrittura fallita:", eccezione);
    return NextResponse.json(
      { errore: "Invio non riuscito. Riprova più tardi." },
      { status: 500 },
    );
  }

  /**
   * L'avviso passa dalla coda della sorveglianza invece che da una chiamata
   * diretta a Telegram: è già il canale verso i DEVELOPER, ha già il
   * raffreddamento e già raggruppa più avvisi in un messaggio solo. Una
   * seconda strada verso la stessa chat significherebbe due punti in cui
   * ricordarsi chi sono i destinatari.
   */
  accodaAllerta({
    gravita: "media",
    titolo: `Ricorso da ${ip}`,
    righe: [
      `bloccato per: ${causa} (${valore})`,
      messaggio.slice(0, 160),
      contatto ? `contatto: ${contatto}` : "nessun contatto indicato",
    ],
    chiave: `ricorso:${ip}`,
    raffreddamentoMinuti: 30,
  });

  return NextResponse.json({ ok: true });
}
