#!/usr/bin/env bash
# Riavvio pulito: garantisce che resti UN SOLO processo, avviato con il
# .env attuale.
#
# Serve quando le modifiche al .env sembrano non avere effetto. Il caso
# tipico: un riavvio andato storto lascia un processo orfano che tiene la
# porta 3080 con l'ambiente di prima. PM2 non riesce ad avviarsi
# (EADDRINUSE) e va in crash-loop, mentre Nginx continua a servire il
# processo vecchio. Da fuori il sito risponde, ma ignora il .env.
#
# Uso: bash deploy/riavvia-pulito.sh
set -euo pipefail

CARTELLA="/var/www/phantomlab"
APP="phantomlab"
PORTA=3080

cd "$CARTELLA"

# Porta libera significa che grep non trova nulla ed esce con 1. Sotto
# "set -e" con "pipefail" quell'uscita interrompe l'intero script senza
# stampare niente: il caso normale verrebbe scambiato per un errore fatale.
# Il "|| true" tiene la ricerca infruttuosa per quello che è.
pid_in_ascolto() {
  local trovato=""
  if command -v ss > /dev/null 2>&1; then
    trovato="$(ss -lptnH "sport = :$PORTA" 2> /dev/null |
      grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
  elif command -v lsof > /dev/null 2>&1; then
    trovato="$(lsof -tiTCP:"$PORTA" -sTCP:LISTEN 2> /dev/null | head -1 || true)"
  fi
  printf '%s' "$trovato"
}

echo "==> Stato di partenza"
echo "    .env:  $(grep -E '^SITO_CHIUSO=' .env || echo 'non impostato')"
OCCUPANTE="$(pid_in_ascolto)"
echo "    porta $PORTA: ${OCCUPANTE:-libera}"

echo "==> Rimuovo l'applicazione da PM2"
pm2 delete "$APP" > /dev/null 2>&1 || true

echo "==> Termino ogni processo residuo del sito"
# Mirato al server standalone di questo progetto: non tocca altri servizi
# Node presenti sulla macchina.
pkill -f "$CARTELLA/.next/standalone/server.js" 2> /dev/null || true
sleep 1

for _ in 1 2 3 4 5; do
  RESIDUO="$(pid_in_ascolto)"
  [ -z "$RESIDUO" ] && break
  echo "    La porta $PORTA è ancora occupata dal PID $RESIDUO: SIGKILL."
  kill -9 "$RESIDUO" 2> /dev/null || true
  sleep 1
done

if [ -n "$(pid_in_ascolto)" ]; then
  echo "ERRORE: la porta $PORTA resta occupata. Verifica a mano:" >&2
  echo "  sudo ss -lptn 'sport = :$PORTA'" >&2
  exit 1
fi
echo "    Porta $PORTA libera."

echo "==> Avvio con il .env attuale"
pm2 start ecosystem.config.js
# --force sovrascrive il dump: senza, un salvataggio vecchio può riportare
# in vita l'ambiente sbagliato al prossimo riavvio della macchina.
pm2 save --force

echo "==> Verifica"
sleep 3

# Anche qui il grep può non trovare nulla (app assente dall'elenco): senza
# "|| true" lo script morirebbe invece di riportare lo stato mancante.
STATO="$(pm2 jlist 2> /dev/null |
  tr ',' '\n' | grep -A1 "\"name\":\"$APP\"" | grep -o '"status":"[a-z]*"' |
  head -1 | cut -d'"' -f4 || true)"

if [ "$STATO" != "online" ]; then
  echo "    PM2 riporta stato '${STATO:-sconosciuto}'. Log:" >&2
  pm2 logs "$APP" --lines 30 --nostream >&2 || true
  exit 1
fi

echo "    PM2: online."

# Una richiesta serve a far scattare la diagnostica del middleware.
curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/" || true
sleep 1

echo
echo "    Processi che hanno risposto (una sola riga attesa):"
pm2 logs "$APP" --lines 40 --nostream 2> /dev/null |
  grep "\[gate\]" | tail -3 || echo "    (nessuna riga [gate]: rifai una richiesta)"

echo
echo "==> Fatto. Controllo finale dall'esterno:"
echo "    curl -sI https://phantom-lab.eu/ | grep -i x-gate"
