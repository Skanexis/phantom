/**
 * Configurazione PM2 per phantom-lab.eu.
 * Avvia il server standalone prodotto da `next build` (output: "standalone").
 */
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.join('/var/www/phantomlab', '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

module.exports = {
  apps: [
    {
      name: "phantomlab",
      script: ".next/standalone/server.js",
      cwd: "/var/www/phantomlab",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3080,
        HOSTNAME: "127.0.0.1",
        ...envConfig,
      },
      max_memory_restart: "500M",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      error_file: "/var/log/phantomlab/error.log",
      out_file: "/var/log/phantomlab/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
