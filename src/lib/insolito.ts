/**
 * Giudizio su una richiesta che NON è stata respinta.
 *
 * `anomalie.ts` risponde a "questa richiesta è ostile?" e chi la fa scattare
 * viene chiuso fuori. Qui la domanda è diversa e più sfumata: "questa
 * richiesta è normale?". Nessuno di questi segnali basta a respingere
 * qualcuno — un `curl` sulla home è legittimo, un utente senza user-agent
 * pure — ma tutti insieme sono ciò che distingue una riga di traffico da
 * guardare da un rumore di fondo.
 *
 * Il risultato non blocca nulla: colora la riga nella console e, sopra una
 * certa soglia, fa partire un avviso. Serve a rispondere alla domanda che
 * un giornale di soli eventi respinti non può soddisfare: *cosa stava
 * succedendo poco prima che scattasse qualcosa?*
 *
 * Il modulo è puro e senza dipendenze: gira nel perimetro, sul percorso
 * caldo di ogni richiesta, e ogni regola qui dentro costa una manciata di
 * confronti su stringhe già in memoria.
 */

import type { LivelloRiga } from "@/lib/sorveglianza";

export type Giudizio = {
  livello: LivelloRiga;
  /** Perché la riga non è ordinaria, in parole leggibili nel pannello. */
  motivi: string[];
};

/**
 * Strumenti da riga di comando e librerie HTTP. Non sono vietati: sono
 * semplicemente *non un browser*, e su un sito senza API pubblica questo
 * è un fatto che vale la pena vedere.
 */
const AGENTI_STRUMENTO =
  /(curl|wget|python-requests|python-urllib|go-http-client|java\/|okhttp|libwww|httpie|postman|insomnia|axios|node-fetch|guzzle|winhttp)/i;

/**
 * Nomi che nessuno manda per sbaglio: sono scanner di vulnerabilità, e chi
 * li usa contro un sito non ci sta navigando.
 */
const AGENTI_SCANNER =
  /(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|nessus|openvas|wpscan|dirbuster|gobuster|feroxbuster|ffuf|hydra)/i;

/** Robot dichiarati. Legittimi, ma vanno distinti da una persona. */
const AGENTI_ROBOT =
  /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome|phantomjs|puppeteer|playwright)/i;

/** Metodi che un browser su questo sito usa davvero. */
const METODI_ATTESI = new Set([
  "GET",
  "HEAD",
  "POST",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

/** Percorsi che meritano attenzione anche quando la risposta è lecita. */
const PERCORSI_SENSIBILI = [/^\/admin/i, /^\/api\/admin/i];

export type ContestoRichiesta = {
  metodo: string;
  percorso: string;
  agente: string | null;
  /** Vero se l'indirizzo compare adesso per la prima volta. */
  nuovoIp: boolean;
  /** Vero se la richiesta porta un cookie di sessione valido. */
  collegato: boolean;
  /** Ruolo dal token firmato, quando c'è. */
  ruolo: string | null;
  /**
   * Vero per le Server Action, che sono POST verso il percorso di una
   * pagina: senza questa distinzione ogni form del sito verrebbe segnalato
   * come "scrittura su un percorso che non è API", che è esattamente il
   * funzionamento normale di Next.
   */
  azioneServer: boolean;
};

/**
 * Il livello più alto vince: i motivi si accumulano tutti, ma la riga
 * prende il colore del segnale peggiore.
 */
const ORDINE: Record<LivelloRiga, number> = {
  info: 0,
  avviso: 1,
  allarme: 2,
  critico: 3,
};

export function valutaRichiesta(contesto: ContestoRichiesta): Giudizio {
  const motivi: string[] = [];
  let livello: LivelloRiga = "info";

  const alza = (candidato: LivelloRiga, motivo: string) => {
    motivi.push(motivo);
    if (ORDINE[candidato] > ORDINE[livello]) livello = candidato;
  };

  // Tagliato prima di passarlo alle espressioni regolari: lo user-agent
  // arriva da fuori e Node accetta intestazioni fino a sedici kilobyte.
  // Le regole qui sotto sono lineari, quindi non c'è un'esplosione
  // combinatoria da temere, ma scandire sedicimila caratteri quattro volte
  // per ogni richiesta di una raffica è lavoro regalato all'attaccante.
  const agente = (contesto.agente ?? "").slice(0, 300);
  const metodo = contesto.metodo.toUpperCase();

  if (AGENTI_SCANNER.test(agente)) {
    alza("allarme", "user-agent di uno scanner di vulnerabilità");
  } else if (AGENTI_STRUMENTO.test(agente)) {
    alza("avviso", "richiesta fatta da uno strumento, non da un browser");
  } else if (AGENTI_ROBOT.test(agente)) {
    alza("avviso", "robot dichiarato");
  }

  // Un browser manda sempre lo user-agent. Assente significa client fatto
  // a mano — non necessariamente ostile, ma mai una persona che naviga.
  if (!agente) alza("avviso", "nessun user-agent");

  if (!METODI_ATTESI.has(metodo)) {
    alza("allarme", `metodo ${metodo}, che il sito non usa`);
  }

  // Scrittura verso un percorso di pagina: le Server Action fanno
  // esattamente questo ed è normale, tutto il resto no.
  if (
    (metodo === "POST" || metodo === "PUT" || metodo === "DELETE") &&
    !contesto.percorso.startsWith("/api/") &&
    !contesto.azioneServer
  ) {
    alza("avviso", `${metodo} su un percorso che non è API`);
  }

  const sensibile = PERCORSI_SENSIBILI.some((schema) =>
    schema.test(contesto.percorso),
  );

  if (sensibile) {
    if (!contesto.collegato) {
      alza("allarme", "area riservata raggiunta senza sessione");
    } else if (contesto.ruolo === "UTENTE") {
      alza("allarme", `area riservata raggiunta con ruolo ${contesto.ruolo}`);
    } else {
      // Accesso legittimo dello staff: non è un problema, ma è la riga che
      // si cerca quando si ricostruisce chi ha fatto cosa.
      alza("avviso", `accesso all'area riservata (${contesto.ruolo})`);
    }
  }

  if (contesto.percorso.length > 200) {
    alza("avviso", `percorso di ${contesto.percorso.length} caratteri`);
  }

  // Un indirizzo mai visto che arriva dritto su una rotta sensibile non è
  // qualcuno che sta navigando il sito: ci è arrivato sapendo dove andare.
  if (contesto.nuovoIp && sensibile) {
    alza("avviso", "primo contatto di questo indirizzo, dritto su /admin");
  }

  return { livello, motivi };
}
