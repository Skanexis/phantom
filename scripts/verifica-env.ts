/**
 * Controlla le variabili d'ambiente prima del deploy.
 * Intercetta gli errori più frequenti (segreti mancanti, password con
 * caratteri che rompono l'URL, dev-login attivo in produzione) mentre
 * costano poco, invece che a sito online.
 *
 * Uso: npm run verifica-env
 */
import "dotenv/config";

type Esito = { livello: "errore" | "avviso"; messaggio: string };

const problemi: Esito[] = [];

function errore(messaggio: string) {
  problemi.push({ livello: "errore", messaggio });
}

function avviso(messaggio: string) {
  problemi.push({ livello: "avviso", messaggio });
}

const produzione = process.env.NODE_ENV === "production";

/* ------------------------------- Database ------------------------------- */

const urlDb = process.env.DATABASE_URL;
if (!urlDb) {
  errore("DATABASE_URL mancante.");
} else if (!urlDb.startsWith("postgresql://") && !urlDb.startsWith("postgres://")) {
  errore('DATABASE_URL deve iniziare con "postgresql://".');
} else {
  try {
    const analizzato = new URL(urlDb);
    if (!analizzato.hostname) errore("DATABASE_URL: host mancante.");
    if (!analizzato.pathname.replace("/", "")) {
      errore("DATABASE_URL: nome del database mancante.");
    }

    // Una "@" nella password spezza l'URL in modo silenzioso: la parte
    // successiva viene letta come host, e l'errore emerge solo alla
    // connessione ('invalid integer value ... for option "port"').
    // La stringa resta formalmente valida, quindi lo si scopre solo provando.
    const password = analizzato.password;
    if (password && /[:/#?]/.test(decodeURIComponent(password))) {
      avviso(
        "DATABASE_URL: la password contiene caratteri speciali (: / # ?). " +
          "Se la connessione fallisce, rigenerala con: openssl rand -hex 24",
      );
    }
  } catch {
    errore(
      "DATABASE_URL malformato. Causa tipica: password con @ non codificata. " +
        "Rigenera la password con: openssl rand -hex 24",
    );
  }
}

/* ------------------------------- Sicurezza ------------------------------ */

const segreto = process.env.AUTH_SECRET;
if (!segreto) {
  errore("AUTH_SECRET mancante. Genera con: openssl rand -base64 48");
} else if (segreto.length < 32) {
  errore(`AUTH_SECRET troppo corto (${segreto.length} caratteri, minimo 32).`);
} else if (segreto.includes("cambia-questo-valore")) {
  errore("AUTH_SECRET è ancora il valore di esempio. Generane uno reale.");
}

if (produzione && process.env.ALLOW_DEV_LOGIN === "true") {
  errore(
    'ALLOW_DEV_LOGIN="true" in produzione: chiunque potrebbe accedere ' +
      'senza Telegram. Impostalo a "false".',
  );
}

/**
 * Segmento di DEV.LOGS: avviso e non errore.
 *
 * Senza, la scheda semplicemente non compare e la rotta risponde 404 — il
 * sito funziona in tutto il resto. Un errore bloccante qui impedirebbe il
 * deploy per una funzione accessoria, il che sarebbe sproporzionato; ma
 * tacere del tutto lascerebbe qualcuno a chiedersi perché la scheda non
 * c'è, che è il tipo di mistero che costa un'ora.
 */
const segmentoDevLogs = process.env.SEGMENTO_DEV_LOGS;
if (!segmentoDevLogs) {
  avviso(
    "SEGMENTO_DEV_LOGS non impostato: la scheda DEV.LOGS resterà nascosta. " +
      "Generane uno con: openssl rand -hex 16",
  );
} else if (segmentoDevLogs.length < 16) {
  errore(
    `SEGMENTO_DEV_LOGS troppo corto (${segmentoDevLogs.length} caratteri, ` +
      "minimo 16). Sotto quella soglia la rotta risponde 404 e la scheda " +
      "non compare: meglio saperlo adesso che cercarlo dopo.",
  );
} else if (!/^[0-9a-zA-Z_-]+$/.test(segmentoDevLogs)) {
  errore(
    "SEGMENTO_DEV_LOGS contiene caratteri che vanno codificati in un URL. " +
      "Usa solo lettere, cifre, trattino e trattino basso: openssl rand -hex 16",
  );
}

/* -------------------------------- Telegram ------------------------------ */

const tokenBot = process.env.TELEGRAM_BOT_TOKEN;
if (!tokenBot) {
  avviso("TELEGRAM_BOT_TOKEN mancante: notifiche e accesso non funzioneranno.");
} else if (!/^\d+:[A-Za-z0-9_-]+$/.test(tokenBot)) {
  errore('TELEGRAM_BOT_TOKEN malformato. Atteso: "123456789:AAH...".');
}

const usernameBot = process.env.TELEGRAM_BOT_USERNAME;
if (!usernameBot) {
  avviso(
    "TELEGRAM_BOT_USERNAME mancante: l'accesso da browser risponderà 503.",
  );
} else if (usernameBot.startsWith("@")) {
  errore('TELEGRAM_BOT_USERNAME non deve iniziare con "@".');
}

const segretoWebhook = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!segretoWebhook) {
  // Da avviso a errore: il webhook non accetta più chiamate senza segreto,
  // quindi la variabile mancante non è più un rischio silenzioso ma un
  // guasto certo — il bot smette di rispondere e i collegamenti falliscono.
  errore(
    "TELEGRAM_WEBHOOK_SECRET mancante: il webhook risponde 503 e il bot " +
      "non riceve nulla. Genera con: openssl rand -hex 32\n" +
      "      Poi registralo su Telegram con secret_token nella setWebhook.",
  );
} else if (segretoWebhook.length < 16) {
  errore(
    `TELEGRAM_WEBHOOK_SECRET troppo corto (${segretoWebhook.length} caratteri, minimo 16).`,
  );
}

if (!process.env.TELEGRAM_ADMIN_CHAT_ID) {
  avviso("TELEGRAM_ADMIN_CHAT_ID mancante: nessuna notifica delle richieste.");
}

if (!process.env.ADMIN_TELEGRAM_IDS) {
  avviso(
    "ADMIN_TELEGRAM_IDS vuoto: nessuno potrà accedere al pannello admin. " +
      "In alternativa usa: npm run promuovi-admin -- <telegramId>",
  );
}

/* ---------------------------- Modalità cantiere -------------------------- */

const grezzoGate = process.env.SITO_CHIUSO;
const gateNormalizzato = (grezzoGate ?? "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .toLowerCase();
const gateChiuso =
  gateNormalizzato !== "" &&
  !["false", "0", "no", "off"].includes(gateNormalizzato);

// Il valore letterale conta: un apice non rimosso o uno spazio finale
// facevano fallire il vecchio confronto con "true" e il sito restava
// aperto al pubblico senza alcun segnale.
if (grezzoGate !== undefined && grezzoGate !== gateNormalizzato) {
  avviso(
    `SITO_CHIUSO contiene ${JSON.stringify(grezzoGate)} invece di "true"/"false". ` +
      `Interpretato come: sito ${gateChiuso ? "CHIUSO" : "APERTO"}.`,
  );
}

console.log(
  `   Modalità cantiere: sito ${gateChiuso ? "CHIUSO al pubblico" : "APERTO a tutti"}`,
);

if (gateChiuso) {
  const passwordSito = process.env.SITO_PASSWORD;
  if (!passwordSito) {
    errore(
      'SITO_CHIUSO attivo ma SITO_PASSWORD è vuota: nessuno potrebbe entrare.',
    );
  } else if (passwordSito.length < 8) {
    avviso(
      `SITO_PASSWORD corta (${passwordSito.length} caratteri): usane almeno 12.`,
    );
  }
}

/* --------------------------------- Runtime ------------------------------- */

// Nginx fa proxy verso 127.0.0.1:3080 (deploy/nginx.conf). Se qui la porta
// è diversa, il sito risponde 502 senza che nulla nei log dell'app lo spieghi.
const PORTA_ATTESA = "3080";
const porta = process.env.PORT;

if (porta && porta !== PORTA_ATTESA) {
  avviso(
    `PORT="${porta}" ma deploy/nginx.conf fa proxy verso ${PORTA_ATTESA}. ` +
      "Allinea i due valori, altrimenti il sito risponde 502.",
  );
}

/* --------------------- Connessione reale al database -------------------- */

/**
 * Verifica sul campo: è l'unico modo affidabile di scoprire una password
 * con "@". L'URL resta formalmente valido, ma la connessione fallisce.
 */
async function provaConnessione() {
  if (!urlDb) return;

  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: urlDb, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    console.log("Connessione al database riuscita.");
  } catch (eccezione) {
    const messaggio =
      eccezione instanceof Error ? eccezione.message : String(eccezione);

    if (/invalid integer value|port/i.test(messaggio)) {
      errore(
        "DATABASE_URL non valido: quasi certamente la password contiene " +
          '"@" o un altro carattere speciale. Rigenerala con:\n' +
          "      openssl rand -hex 24\n" +
          "      sudo -u postgres psql -c \"ALTER USER phantomlab WITH PASSWORD 'nuova';\"",
      );
    } else if (/password authentication failed/i.test(messaggio)) {
      errore(
        "Password del database errata. Reimpostala con:\n" +
          "      sudo -u postgres psql -c \"ALTER USER phantomlab WITH PASSWORD 'nuova';\"",
      );
    } else if (/ECONNREFUSED|could not connect/i.test(messaggio)) {
      errore(
        "PostgreSQL non raggiungibile. Verifica: sudo systemctl status postgresql",
      );
    } else if (/does not exist/i.test(messaggio)) {
      errore(`Database o utente inesistente: ${messaggio}`);
    } else {
      errore(`Connessione al database fallita: ${messaggio}`);
    }
  }
}

/* --------------------------------- Esito -------------------------------- */

async function main() {
  await provaConnessione();

  const errori = problemi.filter((p) => p.livello === "errore");
  const avvisi = problemi.filter((p) => p.livello === "avviso");

  if (errori.length > 0) {
    console.error(`\n${errori.length} errore/i da correggere:\n`);
    errori.forEach((p) => console.error(`  ✗ ${p.messaggio}`));
  }

  if (avvisi.length > 0) {
    console.warn(`\n${avvisi.length} avviso/i:\n`);
    avvisi.forEach((p) => console.warn(`  ! ${p.messaggio}`));
  }

  if (errori.length === 0 && avvisi.length === 0) {
    console.log("Configurazione valida.");
  } else if (errori.length === 0) {
    console.log("\nConfigurazione valida (con avvisi non bloccanti).");
  }

  process.exit(errori.length > 0 ? 1 : 0);
}

main();
