#!/usr/bin/env bash
# Configura Nginx e HTTPS per phantom-lab.eu.
#
# Risolve da sé il problema dell'uovo e della gallina: Certbot ha bisogno di
# un sito in HTTP per validare il dominio, ma la configurazione definitiva
# richiede un certificato che ancora non esiste. Lo script installa prima una
# configurazione minima in HTTP, ottiene il certificato, poi applica quella
# completa.
#
# Uso:  sudo bash deploy/configura-nginx.sh
set -euo pipefail

DOMINIO="phantom-lab.eu"
CARTELLA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DISPONIBILI="/etc/nginx/sites-available/$DOMINIO"
ATTIVI="/etc/nginx/sites-enabled/$DOMINIO"
CERTIFICATO="/etc/letsencrypt/live/$DOMINIO/fullchain.pem"

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui con sudo:  sudo bash deploy/configura-nginx.sh" >&2
  exit 1
fi

# --- 1. Controllo che il DNS punti qui ------------------------------------
echo "==> [1/5] Verifico il DNS"

IP_SERVER="$(curl -s -4 ifconfig.me || echo "")"
IP_DOMINIO="$(dig +short "$DOMINIO" | tail -1 || echo "")"

if [ -z "$IP_DOMINIO" ]; then
  echo "ERRORE: $DOMINIO non risolve a nessun IP." >&2
  echo "Configura i record DNS (sezione 2 di docs/DEPLOY.md) e attendi la" >&2
  echo "propagazione prima di riprovare." >&2
  exit 1
fi

if [ -n "$IP_SERVER" ] && [ "$IP_DOMINIO" != "$IP_SERVER" ]; then
  echo "ATTENZIONE: $DOMINIO punta a $IP_DOMINIO, ma questo server è $IP_SERVER."
  echo "Certbot fallirà se il DNS non è ancora propagato."
  read -r -p "Proseguo comunque? [s/N] " risposta
  [ "$risposta" = "s" ] || exit 1
else
  echo "    $DOMINIO -> $IP_DOMINIO"
fi

# --- 2. Map per i WebSocket ------------------------------------------------
echo "==> [2/5] Installo la map \$connection_upgrade"

if grep -rqs 'connection_upgrade' /etc/nginx/conf.d/ /etc/nginx/nginx.conf; then
  echo "    Già definita altrove: la salto."
else
  cp "$CARTELLA/deploy/nginx-upgrade-map.conf" /etc/nginx/conf.d/upgrade-map.conf
  echo "    Installata in /etc/nginx/conf.d/upgrade-map.conf"
fi

# --- 3. Configurazione provvisoria in HTTP --------------------------------
if [ ! -f "$CERTIFICATO" ]; then
  echo "==> [3/5] Nessun certificato: installo la configurazione HTTP"

  mkdir -p /var/www/certbot

  cat > "$DISPONIBILI" <<'NGINX'
# Configurazione provvisoria: serve solo a far validare il dominio a Certbot.
# Viene sostituita da deploy/nginx.conf appena il certificato è pronto.
server {
    listen 80;
    listen [::]:80;
    server_name phantom-lab.eu www.phantom-lab.eu;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

  ln -sf "$DISPONIBILI" "$ATTIVI"
  rm -f /etc/nginx/sites-enabled/default

  nginx -t
  systemctl reload nginx
  echo "    Sito raggiungibile in HTTP."

  # --- 4. Certificato ------------------------------------------------------
  echo "==> [4/5] Ottengo il certificato HTTPS"

  if ! command -v certbot > /dev/null 2>&1; then
    apt install -y certbot python3-certbot-nginx
  fi

  # --webroot invece di --nginx: non tocca la configurazione, che gestiamo noi.
  certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMINIO" -d "www.$DOMINIO" \
    --agree-tos --no-eff-email --register-unsafely-without-email \
    --non-interactive

  echo "    Certificato ottenuto."
else
  echo "==> [3/5] Certificato già presente: salto"
  echo "==> [4/5] Salto la richiesta a Certbot"
fi

# --- 5. Configurazione definitiva -----------------------------------------
echo "==> [5/5] Applico la configurazione definitiva"

cp "$CARTELLA/deploy/nginx.conf" "$DISPONIBILI"
ln -sf "$DISPONIBILI" "$ATTIVI"

if ! nginx -t; then
  echo >&2
  echo "ERRORE: la configurazione non è valida." >&2
  echo "Il sito resta servito dalla configurazione precedente." >&2
  echo >&2
  echo "Se l'errore è 'unknown directive \"http2\"', questo nginx è" >&2
  echo "precedente alla 1.25.1: aggiorna deploy/nginx.conf con" >&2
  echo "  git pull" >&2
  echo "e riesegui questo script." >&2
  exit 1
fi

systemctl reload nginx

echo
echo "==> Verifico il risultato"
sleep 2

CODICE="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMINIO" || echo 000)"
TIPO_CSS="$(curl -s -o /dev/null -w '%{content_type}' \
  "https://$DOMINIO/_next/static/css/" 2>/dev/null || echo "")"

echo "    https://$DOMINIO -> HTTP $CODICE"

if [ "$CODICE" != "200" ]; then
  echo
  echo "Il sito non risponde 200. Controlla:" >&2
  echo "  pm2 status" >&2
  echo "  sudo tail -30 /var/log/nginx/phantomlab.error.log" >&2
  exit 1
fi

echo
echo "============================================================"
echo " Nginx e HTTPS configurati."
echo
echo " Verifica dal browser:"
echo "   https://$DOMINIO           pagina di attesa, lucchetto valido"
echo "   https://www.$DOMINIO       reindirizza senza www"
echo "   http://$DOMINIO            reindirizza a HTTPS"
echo
echo " Se la pagina appare senza stile, gli asset non sono stati"
echo " copiati nella build standalone:"
echo "   bash deploy/build.sh && pm2 restart phantomlab"
echo "============================================================"
