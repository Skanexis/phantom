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
    // Conta le "@" nella parte credenziali: più di una significa che la
    // password ne contiene una non codificata, ed è la causa tipica di
    // 'invalid integer value "ON" for connection option "port"'.
    const senzaSchema = urlDb.replace(/^postgres(ql)?:\/\//, "");
    const posizioneUltimaChiocciola = senzaSchema.lastIndexOf("@");
    const credenziali =
      posizioneUltimaChiocciola >= 0
        ? senzaSchema.slice(0, posizioneUltimaChiocciola)
        : "";

    if ((credenziali.match(/@/g) ?? []).length > 0) {
      errore(
        'DATABASE_URL: la password contiene "@" non codificata. È la causa di ' +
          "errori come 'invalid integer value for connection option port'. " +
          "Rigenera la password con: openssl rand -hex 24",
      );
    }

    const analizzato = new URL(urlDb);
    if (!analizzato.hostname) errore("DATABASE_URL: host mancante.");
    if (!analizzato.pathname.replace("/", "")) {
      errore("DATABASE_URL: nome del database mancante.");
    }

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

if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
  avviso(
    "TELEGRAM_WEBHOOK_SECRET mancante: il webhook accetterebbe chiamate " +
      "da chiunque. Genera con: openssl rand -hex 32",
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

if (process.env.SITO_CHIUSO === "true") {
  const passwordSito = process.env.SITO_PASSWORD;
  if (!passwordSito) {
    errore(
      'SITO_CHIUSO="true" ma SITO_PASSWORD è vuota: nessuno potrebbe entrare.',
    );
  } else if (passwordSito.length < 8) {
    avviso(
      `SITO_PASSWORD corta (${passwordSito.length} caratteri): usane almeno 12.`,
    );
  }
}

/* --------------------------------- Esito -------------------------------- */

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
