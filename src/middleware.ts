import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_GATE, gateAttivo, verificaTokenGate } from "@/lib/gate";
import { eMutante, ipClient, origineValida } from "@/lib/rete";
import { registraTentativo } from "@/lib/limite";
import {
  annota,
  inQuarantena,
  segnala,
  traccia,
  type Identita,
} from "@/lib/sorveglianza";
import {
  NOME_COOKIE_SESSIONE,
  verificaTokenSessione,
} from "@/lib/sessione-token";
import { eStaff } from "@/lib/permessi";
import { esaminaUrl } from "@/lib/anomalie";
import { valutaRichiesta } from "@/lib/insolito";
import {
  DURATA_COOKIE_DISPOSITIVO,
  NOME_COOKIE_DISPOSITIVO,
  identificativoValido,
  nuovoIdentificativoDispositivo,
  valutaEsclusione,
} from "@/lib/bandi";

/**
 * Runtime Node invece di edge.
 *
 * Due motivi, entrambi concreti. Il primo è la sorveglianza: in edge il
 * proxy gira in una sandbox con un globalThis tutto suo, quindi ciò che
 * registra qui sarebbe invisibile al pannello, che è una rotta Node — e il
 * pannello resterebbe vuoto proprio degli eventi più interessanti, quelli
 * respinti prima di toccare l'applicazione.
 *
 * Il secondo è la lettura delle variabili d'ambiente, il problema
 * descritto nella diagnostica qui sotto: in Node arrivano per la stessa
 * strada del resto dell'applicazione, e SITO_CHIUSO non può più risultare
 * assente solo qui dentro.
 */
export const runtime = "nodejs";

/**
 * Perimetro dell'applicazione.
 *
 * Qui passa tutto il traffico prima di raggiungere le rotte, ed è il punto
 * giusto per i controlli che valgono ovunque: sondaggi automatici, chiamate
 * all'API fatte fuori dal browser, frequenza per IP. I controlli specifici
 * (chi sei, cosa puoi fare, i dati sono validi) restano nelle rotte, che
 * sono le uniche a conoscere il contesto.
 *
 * Con SITO_CHIUSO=true, in più, tutto il traffico finisce sulla pagina di
 * attesa tranne chi possiede il cookie di sblocco.
 */

// Percorsi sempre raggiungibili: il webhook del bot deve continuare a
// funzionare anche a sito chiuso, altrimenti Telegram accumula errori.
const PERCORSI_LIBERI = ["/manutenzione", "/api/gate", "/api/telegram/webhook"];

/**
 * Il webhook è l'unica rotta chiamata da un server invece che da un
 * browser: non ha Origin e non deve averlo. Si difende da sé con il
 * segreto condiviso in `x-telegram-bot-api-secret-token`.
 */
const ROTTA_WEBHOOK = "/api/telegram/webhook";

/**
 * Sondaggi automatici: scanner che cercano file di configurazione, backup
 * e pannelli di altri CMS. Non esiste nulla di tutto questo, quindi Next
 * risponderebbe 404 senza danni — ma ogni tentativo costa una
 * renderizzazione e riempie i log, nascondendo gli errori veri. Meglio
 * chiuderli qui con una risposta vuota e immediata.
 */
const ESCHE = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.aws/i,
  /^\/wp-(admin|content|includes|login)/i,
  /^\/(vendor|storage)\//i,
  /^\/(phpmyadmin|pma|adminer)/i,
  /\.(php|asp|aspx|jsp|cgi)$/i,
  /^\/(config|backup|dump)\.(json|sql|zip|tar|gz)$/i,
];

/**
 * Tetto generale per IP: non è la difesa di un singolo endpoint, è la rete
 * che impedisce a un singolo indirizzo di saturare il processo. Va tenuto
 * largo, perché una pagina normale fa diverse richieste in pochi secondi.
 */
const MAX_RICHIESTE_IP = 300;
const FINESTRA_IP_MS = 60_000;

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
    // Il PID distingue i processi: righe con valori diversi e PID diversi
    // significano più istanze in ascolto, ognuna con il proprio ambiente.
    // È il caso in cui il .env sembra ignorato, perché a rispondere è un
    // processo avviato prima della modifica.
    const pid = typeof process.pid === "number" ? process.pid : "?";
    console.log(
      `[gate] pid=${pid} SITO_CHIUSO=${JSON.stringify(grezzo)} -> sito ${
        gateAttivo() ? "CHIUSO" : "APERTO"
      }`,
    );
  }

  const inizio = Date.now();
  const { pathname } = richiesta.nextUrl;
  const ip = ipClient(richiesta.headers);
  const agente = richiesta.headers.get("user-agent");
  const metodo = richiesta.method;

  /* ------------------------------ Perimetro ----------------------------- */

  // Il webhook non entra in nessuna statistica né in nessun limite per IP:
  // Telegram consegna da pochi indirizzi e a raffica quando recupera un
  // arretrato, e finirebbe per sembrare l'attaccante più insistente del
  // pannello. Si difende con il segreto condiviso.
  const eWebhook = pathname === ROTTA_WEBHOOK;

  /**
   * Sessione letta una volta sola, e solo se il cookie c'è.
   *
   * Serve a tre cose che prima la rileggevano o non la vedevano affatto: la
   * valvola della quarantena, l'identità nella console e il giudizio sulle
   * richieste insolite. La verifica è una firma HMAC su un contenuto
   * minuscolo, ma resta lavoro per richiesta: senza cookie non si fa, e il
   * traffico anonimo — che è la quasi totalità di quello ostile — non la
   * paga mai.
   */
  const cookieSessione = richiesta.cookies.get(NOME_COOKIE_SESSIONE)?.value;
  const sessione = cookieSessione
    ? await verificaTokenSessione(cookieSessione)
    : null;
  const identita: Identita = sessione
    ? {
        utenteId: sessione.utenteId,
        telegramId: sessione.telegramId,
        ruolo: sessione.ruolo,
      }
    : null;
  const staffCollegato = Boolean(sessione && eStaff(sessione.ruolo));

  let nuovoIp = false;
  if (!eWebhook) {
    nuovoIp = traccia({ ip, metodo, percorso: pathname, agente, identita })
      .nuovoIp;
  }

  /**
   * Marcatore del dispositivo.
   *
   * Il valore arriva da un cookie, quindi da fuori: si accetta solo nella
   * forma esatta in cui è stato emesso. Senza il controllo, chiunque
   * potrebbe scriverci dentro quello che vuole — e quel testo finirebbe in
   * un elenco di esclusione, in una query e in una pagina del pannello.
   */
  const cookieDispositivo = richiesta.cookies.get(
    NOME_COOKIE_DISPOSITIVO,
  )?.value;
  const dispositivoNoto = identificativoValido(cookieDispositivo)
    ? (cookieDispositivo as string)
    : null;
  const dispositivo = dispositivoNoto ?? nuovoIdentificativoDispositivo();

  /**
   * Chiude la riga di console per le richieste che il perimetro lascia
   * passare. Quelle respinte sono già annotate da `segnala`, con la gravità
   * della loro famiglia: annotarle anche qui le farebbe comparire due volte
   * nel registro, una respinta e una passata.
   */
  const prosegui = (risposta: NextResponse, esito: string, stato?: number) => {
    if (eWebhook) return risposta;

    // Il marcatore si deposita solo sulle richieste che passano: darlo
    // anche a chi viene respinto significherebbe consegnare un
    // identificativo nuovo a ogni colpo di uno scanner, cioè riempire di
    // voci inutili proprio l'elenco che serve a riconoscerlo.
    if (!dispositivoNoto) {
      risposta.cookies.set(NOME_COOKIE_DISPOSITIVO, dispositivo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: DURATA_COOKIE_DISPOSITIVO,
      });
    }

    const giudizio = valutaRichiesta({
      metodo,
      percorso: pathname,
      agente,
      nuovoIp,
      collegato: Boolean(sessione),
      ruolo: sessione?.ruolo ?? null,
      azioneServer: richiesta.headers.has("next-action"),
    });

    annota({
      livello: giudizio.livello,
      metodo,
      percorso: pathname + richiesta.nextUrl.search,
      ip,
      agente,
      identita,
      esito,
      stato: stato ?? null,
      motivi: giudizio.motivi,
      durataMs: Date.now() - inizio,
    });

    return risposta;
  };

  // La quarantena viene prima di tutto: se questo indirizzo è già stato
  // giudicato, non deve costare nemmeno il lavoro dei controlli seguenti.
  if (!eWebhook) {
    const blocco = inQuarantena(ip);

    /**
     * Valvola di sicurezza: lo staff non viene mai chiuso fuori.
     *
     * Senza questa riga la misura è una trappola. Lo sviluppatore lavora
     * spesso dallo stesso indirizzo da cui prova le difese, e il blocco
     * copre tutto il sito — compreso il pannello, che è l'unico posto da
     * cui si può togliere. Ci si chiuderebbe fuori dalla propria stanza
     * lasciando la chiave dentro, con mezz'ora di attesa o un riavvio in
     * produzione come sole vie d'uscita.
     *
     * Il ruolo qui viene dal token firmato e non dal database: è un dato
     * che potrebbe essere vecchio di qualche giorno, ma sbagliarlo
     * significa al massimo non applicare una quarantena a chi era staff
     * fino a ieri — mentre il costo dell'errore opposto è il sito
     * inaccessibile a chi deve ripararlo. Ogni controllo vero sui permessi
     * resta dov'era, sulle rotte, e rilegge sempre dal database.
     */
    if (blocco && !staffCollegato) {
      segnala({
        tipo: "quarantena",
        ip,
        metodo,
        percorso: pathname,
        agente,
        dettaglio: blocco.motivo,
        identita,
        stato: 429,
        durataMs: Date.now() - inizio,
      });
      return new NextResponse("Accesso temporaneamente sospeso.", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((blocco.fino - Date.now()) / 1000)),
        },
      });
    }
    // Se il blocco c'era ma è stato scavalcato, si prosegue normalmente:
    // il resto dei controlli, gate compreso, vale anche per lo staff.
  }

  /* ------------------------------ Esclusioni ---------------------------- */

  /**
   * Blocchi decisi dallo staff: account, indirizzo, dispositivo.
   *
   * Vengono dopo la quarantena (che è automatica e temporanea) e prima di
   * tutto il resto: sono decisioni prese da una persona, e non ha senso
   * spendere altro lavoro su una richiesta che comunque non passerà.
   *
   * Lo staff scavalca il bando di rete ma non il blocco dell'account. La
   * differenza è voluta: un IP escluso può essere quello di un ufficio da
   * cui lavora anche chi deve intervenire, e chiudere fuori l'unica persona
   * che può revocare il blocco è la stessa trappola della quarantena. Un
   * account bloccato, invece, è bloccato — se fosse anche staff, il ruolo
   * non è un salvacondotto, e chi ha deciso il blocco lo ha deciso proprio
   * per quello.
   */
  if (!eWebhook) {
    const esclusione = valutaEsclusione({
      ip,
      dispositivo: dispositivoNoto,
      utenteId: identita?.utenteId,
    });

    const applicabile =
      esclusione.bloccato &&
      (esclusione.causa === "account" || !staffCollegato);

    if (applicabile) {
      segnala({
        tipo: "esclusione",
        ip,
        metodo,
        percorso: pathname,
        agente,
        dettaglio: `esclusione attiva: ${esclusione.causa}`,
        identita,
        stato: 403,
        durataMs: Date.now() - inizio,
      });

      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ errore: "Accesso revocato." }, {
          status: 403,
        });
      }

      // Come per la pagina di attesa: rewrite e non redirect, così l'URL
      // resta quello richiesto e la schermata non diventa un indirizzo che
      // si può girare a qualcun altro.
      const destinazione = new URL("/bloccato", richiesta.url);
      destinazione.searchParams.set("causa", esclusione.causa ?? "account");
      if (richiesta.headers.get("x-forwarded-proto")) {
        destinazione.protocol = "http:";
      }
      return NextResponse.rewrite(destinazione, { status: 403 });
    }
  }

  // Sondaggi noti: risposta secca, nessun lavoro a valle.
  if (ESCHE.some((esca) => esca.test(pathname))) {
    segnala({
      tipo: "sonda",
      ip,
      metodo,
      percorso: pathname,
      agente,
      identita,
      stato: 404,
      durataMs: Date.now() - inizio,
    });
    return new NextResponse(null, { status: 404 });
  }

  /**
   * Firme d'attacco nell'URL. Non si respinge per proteggere il database —
   * quello lo fa Prisma parametrizzando, e queste stringhe arriverebbero
   * comunque innocue. Si respinge perché una richiesta con dentro un
   * UNION SELECT non è un visitatore, e continuare a servirla significa
   * dedicare lavoro a chi sta sondando le difese. Vale come segnale, e
   * come segnale conta ai fini della quarantena.
   */
  if (!eWebhook) {
    const anomalia = esaminaUrl(pathname, richiesta.nextUrl.search);
    if (anomalia) {
      segnala({
        tipo: "iniezione",
        ip,
        metodo,
        percorso: pathname + richiesta.nextUrl.search,
        agente,
        dettaglio: `${anomalia.categoria}: ${anomalia.prova}`,
        identita,
        stato: 400,
        durataMs: Date.now() - inizio,
      });
      return new NextResponse(null, { status: 400 });
    }
  }

  if (!eWebhook) {
    const esito = registraTentativo(
      `ip:${ip}`,
      MAX_RICHIESTE_IP,
      FINESTRA_IP_MS,
    );
    if (esito.superato) {
      segnala({
        tipo: "frequenza",
        ip,
        metodo,
        percorso: pathname,
        agente,
        dettaglio: `oltre ${MAX_RICHIESTE_IP} richieste al minuto`,
        identita,
        stato: 429,
        durataMs: Date.now() - inizio,
      });
      return new NextResponse("Troppe richieste.", {
        status: 429,
        headers: { "Retry-After": String(esito.attesaSecondi) },
      });
    }
  }

  // Scritture sull'API: devono arrivare dal sito, non da uno script.
  // Le Server Action non passano di qui — vivono sulle rotte delle pagine
  // e Next applica per conto suo lo stesso confronto fra Origin e Host.
  if (
    pathname.startsWith("/api/") &&
    !eWebhook &&
    eMutante(metodo) &&
    !origineValida(richiesta)
  ) {
    segnala({
      tipo: "origine",
      ip,
      metodo,
      percorso: pathname,
      agente,
      dettaglio: richiesta.headers.get("origin")
        ? `Origin: ${richiesta.headers.get("origin")}`
        : "nessun Origin (richiesta fuori dal browser)",
      identita,
      stato: 403,
      durataMs: Date.now() - inizio,
    });
    return NextResponse.json(
      { errore: "Origine della richiesta non valida." },
      { status: 403 },
    );
  }

  /* -------------------------------- Gate -------------------------------- */

  // L'intestazione dice dall'esterno cosa ha deciso il middleware: i log
  // di PM2 richiedono l'accesso al server, questa si legge con un curl.
  const chiuso = gateAttivo();

  if (!chiuso) {
    const risposta = NextResponse.next();
    risposta.headers.set("x-gate", "aperto");
    return prosegui(risposta, "passata");
  }

  if (PERCORSI_LIBERI.some((percorso) => pathname.startsWith(percorso))) {
    return prosegui(NextResponse.next(), "passata");
  }

  const sbloccato = await verificaTokenGate(
    richiesta.cookies.get(NOME_COOKIE_GATE)?.value,
  );
  if (sbloccato) return prosegui(NextResponse.next(), "passata");

  // Le API rispondono 503 invece di servire l'HTML della pagina di attesa.
  if (pathname.startsWith("/api/")) {
    return prosegui(
      NextResponse.json(
        { errore: "Servizio momentaneamente non disponibile." },
        { status: 503 },
      ),
      "cantiere",
      503,
    );
  }

  // rewrite, non redirect: l'URL nella barra resta quello richiesto, così la
  // pagina di attesa non rivela l'esistenza di un percorso riservato.
  //
  const destinazione = new URL("/manutenzione", richiesta.url);

  // Dietro Nginx l'URL eredita X-Forwarded-Proto e diventa "https", mentre
  // l'applicazione ascolta in chiaro su 127.0.0.1. Le due origini non
  // coincidono, Next considera il rewrite esterno e prova a proxarsi
  // addosso via TLS: fallisce con EPROTO e restituisce 500 al posto della
  // pagina di attesa.
  //
  // La presenza dell'intestazione dice proprio questo: il TLS l'ha chiuso
  // il proxy, quindi qui dentro si parla in chiaro.
  if (richiesta.headers.get("x-forwarded-proto")) {
    destinazione.protocol = "http:";
  }
  const risposta = NextResponse.rewrite(destinazione);
  risposta.headers.set("x-gate", "chiuso");
  return prosegui(risposta, "cantiere");
}

export const config = {
  // Esclude asset statici e immagini: non serve valutarli a ogni richiesta.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
