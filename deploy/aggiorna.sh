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

echo "==> Genero il client Prisma"
npx prisma generate

echo "==> Compilo l'applicazione"
npm run build

# La build standalone non include static/ e public/: vanno copiati a mano.
echo "==> Copio gli asset nella build standalone"
cp -r .next/static .next/standalone/.next/
if [ -d public ]; then
  cp -r public .next/standalone/
fi

echo "==> Riavvio l'applicazione"
if pm2 describe "$APP" > /dev/null 2>&1; then
  pm2 reload "$APP" --update-env
else
  pm2 start ecosystem.config.js
fi

pm2 save

echo "==> Fatto. Stato:"
pm2 status "$APP"
