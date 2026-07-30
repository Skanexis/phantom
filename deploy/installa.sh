#!/usr/bin/env bash
# Installazione completa di Phantom Lab su un VPS già dotato di
# Node 22, PostgreSQL, Nginx e PM2 (sezione 4 di docs/DEPLOY.md).
#
# Va lanciato DA DENTRO la cartella del progetto già clonata, come utente
# normale (non root):
#
#   cd /var/www/phantomlab
#   bash deploy/installa.sh
#
# Si aspetta che .env esista già (sezione 7 della guida).
set -euo pipefail

CARTELLA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="phantomlab"
PORTA="3080"

cd "$CARTELLA"

if [ "$(id -u)" -eq 0 ]; then
  echo "ERRORE: non eseguire come root." >&2
  echo "L'app deve girare con un utente normale (es. phantom)." >&2
  echo "Esci da root e riprova:  su - phantom" >&2
  exit 1
fi

echo "============================================================"
echo " Installazione Phantom Lab"
echo " Cartella: $CARTELLA"
echo " Utente:   $(whoami)"
echo "============================================================"
echo

# --- 1. Controlli preliminari ---------------------------------------------
echo "==> [1/7] Controllo i prerequisiti"

for comando in node npm pm2 psql nginx; do
  if ! command -v "$comando" > /dev/null 2>&1; then
    echo "ERRORE: '$comando' non trovato." >&2
    echo "Completa la sezione 4 di docs/DEPLOY.md prima di proseguire." >&2
    exit 1
  fi
done

VERSIONE_NODE="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
if [ "$VERSIONE_NODE" -lt 20 ]; then
  echo "ERRORE: serve Node 20 o superiore (trovato $(node -v))." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERRORE: manca il file .env." >&2
  echo "Crealo seguendo la sezione 7 di docs/DEPLOY.md." >&2
  echo "Puoi partire da:  cp .env.example .env && nano .env" >&2
  exit 1
fi

chmod 600 .env
echo "    Prerequisiti a posto."

# --- 2. Cartella dei log ---------------------------------------------------
echo "==> [2/7] Preparo la cartella dei log"
if [ ! -d /var/log/phantomlab ]; then
  sudo mkdir -p /var/log/phantomlab
fi
sudo chown "$(whoami):$(whoami)" /var/log/phantomlab
echo "    /var/log/phantomlab pronta."

# --- 3. Dipendenze ---------------------------------------------------------
echo "==> [3/7] Installo le dipendenze"
if [ -f package-lock.json ]; then
  npm ci
else
  echo "    package-lock.json assente: uso npm install"
  npm install
fi

# --- 4. Verifica configurazione -------------------------------------------
echo "==> [4/7] Verifico il file .env"
npm run verifica-env

# --- 5. Database -----------------------------------------------------------
echo "==> [5/7] Applico le migrazioni del database"
npx prisma migrate deploy

echo "    Popolo i contenuti iniziali"
npm run seed || echo "    (seed già eseguito o non necessario)"

# --- 6. Build --------------------------------------------------------------
echo "==> [6/7] Compilo l'applicazione"
bash deploy/build.sh "$CARTELLA"

# --- 7. Avvio --------------------------------------------------------------
echo "==> [7/7] Avvio con PM2"
pm2 delete "$APP" 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "    Attendo l'avvio..."
sleep 4

CODICE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORTA" || echo 000)"

if [ "$CODICE" = "200" ]; then
  echo "    L'app risponde correttamente (HTTP $CODICE)."
else
  echo
  echo "ERRORE: l'app non risponde (HTTP $CODICE)." >&2
  echo "Log recenti:" >&2
  pm2 logs "$APP" --lines 40 --nostream >&2
  exit 1
fi

echo
echo "============================================================"
echo " Applicazione avviata."
echo
echo " Prossimi passi:"
echo
echo " 1. Configura Nginx (sezione 9 di docs/DEPLOY.md):"
echo "      sudo bash deploy/configura-nginx.sh"
echo
echo " 2. Rendi PM2 persistente al riavvio:"
echo "      pm2 startup"
echo "    poi esegui la riga 'sudo env PATH=...' che viene stampata."
echo "============================================================"
