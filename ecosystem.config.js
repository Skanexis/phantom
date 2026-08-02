/**
 * Configurazione PM2 per phantom-lab.eu.
 * Avvia il server standalone prodotto da `next build` (output: "standalone").
 *
 * PM2 non legge il file .env da solo: senza il caricamento qui sotto l'app
 * parte senza DATABASE_URL, AUTH_SECRET e SITO_CHIUSO, e si comporta come se
 * il sito fosse aperto a tutti.
 */
const fs = require("node:fs");
const path = require("node:path");

const CARTELLA = __dirname;
const PERCORSO_ENV = path.join(CARTELLA, ".env");

if (!fs.existsSync(PERCORSO_ENV)) {
  throw new Error(
    `File .env non trovato in ${PERCORSO_ENV}.\n` +
      "Crealo seguendo la sezione 7 di docs/DEPLOY.md prima di avviare PM2.",
  );
}

// dotenv.parse legge senza toccare process.env: le variabili finiscono solo
// nell'ambiente del processo figlio, che è quello che ci interessa.
const variabili = require("dotenv").parse(fs.readFileSync(PERCORSO_ENV));

const OBBLIGATORIE = ["DATABASE_URL", "AUTH_SECRET", "TELEGRAM_BOT_TOKEN"];
const mancanti = OBBLIGATORIE.filter((nome) => !variabili[nome]);

if (mancanti.length > 0) {
  throw new Error(
    `Variabili mancanti o vuote nel .env: ${mancanti.join(", ")}.\n` +
      "Esegui `npm run verifica-env` per la diagnosi completa.",
  );
}

module.exports = {
  apps: [
    {
      name: "phantomlab",
      script: ".next/standalone/server.js",
      cwd: CARTELLA,
      // Istanza singola: il bus degli eventi che alimenta le notifiche in
      // tempo reale (src/lib/eventi.ts) vive nella memoria del processo.
      // Passando a "cluster" con più istanze, un evento raggiungerebbe solo
      // i client connessi allo stesso worker e le notifiche sparirebbero a
      // caso: servirebbe prima un canale condiviso (Redis pub/sub).
      instances: 1,
      exec_mode: "fork",

      env: {
        ...variabili,
        // Questi hanno la precedenza sul .env: la porta e l'host di ascolto
        // devono restare allineati a quanto configurato in Nginx.
        NODE_ENV: "production",
        PORT: variabili.PORT || "3080",
        HOSTNAME: "127.0.0.1",
      },

      /**
       * Il tetto era 500M, ed è troppo basso per come si comporta l'app
       * sotto carico. Misurato: a riposo il processo sta sui 110 MB, ma
       * una raffica di richieste alla homepage — che è renderizzata a ogni
       * visita e interroga il database — spinge la memoria molto oltre,
       * perché il garbage collector non fa in tempo a rientrare finché la
       * pressione continua. A quiete tornata la memoria si riprende da
       * sola: non è una perdita, è ritardo di raccolta.
       *
       * Con il tetto a 500M il riavvio scattava proprio durante un picco,
       * ed è il momento peggiore: cadono tutte le connessioni SSE aperte,
       * i clienti collegati smettono di ricevere notifiche, e il quadro
       * della sorveglianza — che vive in memoria — si azzera cancellando
       * le tracce di ciò che stava succedendo. Peggio ancora, con
       * max_restarts a 10 una serie di riavvii consecutivi fa arrendere
       * PM2 e il sito resta giù del tutto.
       *
       * 1 GB lascia margine al picco e continua a fermare una vera perdita
       * di memoria, che invece cresce senza mai rientrare.
       */
      max_memory_restart: "1G",
      autorestart: true,
      // Evita cicli di riavvio infiniti se l'app non parte (es. env errate).
      max_restarts: 10,
      min_uptime: "20s",
      error_file: "/var/log/phantomlab/error.log",
      out_file: "/var/log/phantomlab/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
