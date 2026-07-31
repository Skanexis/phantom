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

# Ogni pipeline con grep può non trovare nulla: sotto "set -e" con
# "pipefail" l'uscita 1 chiuderebbe lo script senza stampare niente, e il
# caso normale verrebbe scambiato per un errore fatale. Da qui i "|| true".

# Occupazione della porta, indipendente dai permessi. "ss -lntH" elenca il
# socket anche quando appartiene a un altro utente: è la domanda giusta da
# fare, perché ciò che blocca l'avvio è la porta occupata, non il fatto di
# riuscire a vedere da chi.
porta_occupata() {
  if command -v ss > /dev/null 2>&1; then
    [ -n "$(ss -lntH "sport = :$PORTA" 2> /dev/null || true)" ]
  elif command -v lsof > /dev/null 2>&1; then
    [ -n "$(lsof -tiTCP:"$PORTA" -sTCP:LISTEN 2> /dev/null || true)" ]
  else
    return 1
  fi
}

# PID dell'occupante, quando ottenibile. Senza privilegi "ss -p" nasconde
# i processi altrui: qui l'assenza di PID non significa porta libera, ed è
# esattamente l'equivoco che lasciava partire PM2 su una porta occupata.
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

# Vero se sudo è utilizzabile senza chiedere la password: "-n" fallisce
# invece di aprire un prompt, che in uno script bloccherebbe tutto.
sudo_disponibile() {
  command -v sudo > /dev/null 2>&1 && sudo -n true 2> /dev/null
}

echo "==> Stato di partenza"
echo "    .env:  $(grep -E '^SITO_CHIUSO=' .env || echo 'non impostato')"
if porta_occupata; then
  OCCUPANTE="$(pid_in_ascolto)"
  echo "    porta $PORTA: occupata da ${OCCUPANTE:-un processo non visibile}"
else
  echo "    porta $PORTA: libera"
fi

echo "==> Rimuovo l'applicazione da PM2"
pm2 delete "$APP" > /dev/null 2>&1 || true

echo "==> Termino ogni processo residuo del sito"
# Percorso relativo oltre che assoluto: PM2 può avere avviato il server in
# un modo o nell'altro, e il residuo va riconosciuto in entrambi i casi.
pkill -f "standalone/server.js" 2> /dev/null || true
sleep 1

for TENTATIVO in 1 2 3 4 5; do
  porta_occupata || break

  RESIDUO="$(pid_in_ascolto)"
  if [ -n "$RESIDUO" ]; then
    echo "    Porta occupata dal PID $RESIDUO: lo termino."
    kill -9 "$RESIDUO" 2> /dev/null || true
  elif sudo_disponibile; then
    # Nessun PID visibile: l'occupante appartiene a un altro utente, tipico
    # dopo un comando lanciato con sudo. Con sudo senza password si può
    # chiudere comunque.
    echo "    Occupante non visibile senza privilegi: riprovo con sudo."
    sudo pkill -f "standalone/server.js" 2> /dev/null || true
    sudo fuser -k "$PORTA/tcp" 2> /dev/null || true
  else
    break
  fi

  sleep 1
done

if porta_occupata; then
  echo >&2
  echo "ERRORE: la porta $PORTA resta occupata da un processo che questo" >&2
  echo "utente non può chiudere. Eseguire come amministratore:" >&2
  echo >&2
  echo "  sudo ss -lptn 'sport = :$PORTA'     # chi la tiene" >&2
  echo "  sudo fuser -k $PORTA/tcp            # lo chiude" >&2
  echo >&2
  echo "poi rilanciare: bash deploy/riavvia-pulito.sh" >&2
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
