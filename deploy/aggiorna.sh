#!/usr/bin/env bash
# Aggiorna phantom-lab.eu all'ultima versione del branch corrente.
# Uso: bash deploy/aggiorna.sh
set -euo pipefail

CARTELLA="/var/www/phantomlab"
APP="phantomlab"

cd "$CARTELLA"

echo "==> Scarico le modifiche"
git pull --ff-only

echo "==> Installo le dipendenze"
npm ci

echo "==> Applico le migrazioni del database"
npx prisma migrate deploy

# build.sh compila E copia gli asset nella build standalone: le due cose non
# vanno mai separate, altrimenti il sito resta senza CSS e JS.
bash deploy/build.sh "$CARTELLA"

echo "==> Riavvio l'applicazione"
if pm2 describe "$APP" > /dev/null 2>&1; then
  pm2 reload "$APP" --update-env
else
  pm2 start ecosystem.config.js
fi

pm2 save

echo "==> Verifico che l'app risponda"
sleep 3
if curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080; then
  echo "    OK."
else
  echo "    L'app non risponde. Log:" >&2
  pm2 logs "$APP" --lines 30 --nostream >&2
  exit 1
fi

echo "==> Fatto. Stato:"
pm2 status "$APP"
