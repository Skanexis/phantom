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

PORTA=3080

# PID in ascolto sulla porta, se il sistema lo espone. Girando con lo stesso
# utente del processo, ss mostra il PID senza bisogno di sudo.
pid_in_ascolto() {
  if command -v ss > /dev/null 2>&1; then
    ss -lptnH "sport = :$PORTA" 2>/dev/null |
      grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
  elif command -v lsof > /dev/null 2>&1; then
    lsof -tiTCP:"$PORTA" -sTCP:LISTEN 2>/dev/null | head -1
  fi
}

# Un riavvio andato storto può lasciare un processo orfano che continua a
# tenere la porta: PM2 non riesce più ad avviarsi (EADDRINUSE) e va in ciclo
# di crash, mentre Nginx continua a servire il processo vecchio con le
# variabili d'ambiente di prima. Da fuori il sito sembra funzionare, ma
# ignora ogni modifica al .env.
echo "==> Fermo l'applicazione e libero la porta $PORTA"
pm2 delete "$APP" > /dev/null 2>&1 || true

for _ in 1 2 3 4 5; do
  ORFANO="$(pid_in_ascolto)"
  [ -z "$ORFANO" ] && break
  echo "    Porta occupata dal processo $ORFANO: lo termino."
  kill "$ORFANO" 2>/dev/null || true
  sleep 1
done

ORFANO="$(pid_in_ascolto)"
if [ -n "$ORFANO" ]; then
  echo "    Il processo $ORFANO non risponde a SIGTERM: SIGKILL."
  kill -9 "$ORFANO" 2>/dev/null || true
  sleep 1
fi

if [ -n "$(pid_in_ascolto)" ]; then
  echo "ERRORE: la porta $PORTA resta occupata. Libera il processo a mano:" >&2
  echo "  sudo ss -lptn 'sport = :$PORTA'" >&2
  exit 1
fi

echo "==> Avvio l'applicazione"
pm2 start ecosystem.config.js
pm2 save

echo "==> Verifico che l'app risponda"
sleep 3

# Lo stato di PM2 va controllato PRIMA della risposta HTTP: se un orfano
# restasse in ascolto, curl risponderebbe 200 e il controllo direbbe "OK"
# mentre l'applicazione vera è ferma.
STATO="$(pm2 jlist 2>/dev/null |
  tr ',' '\n' | grep -A1 "\"name\":\"$APP\"" | grep -o '"status":"[a-z]*"' |
  head -1 | cut -d'"' -f4)"

if [ "$STATO" != "online" ]; then
  echo "    PM2 riporta stato '${STATO:-sconosciuto}'. Log:" >&2
  pm2 logs "$APP" --lines 30 --nostream >&2
  exit 1
fi

if curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$PORTA"; then
  echo "    OK."
else
  echo "    L'app non risponde. Log:" >&2
  pm2 logs "$APP" --lines 30 --nostream >&2
  exit 1
fi

echo "==> Fatto. Stato:"
pm2 status "$APP"
