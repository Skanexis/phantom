#!/usr/bin/env bash
# Rimuove Phantom Lab dal VPS per una reinstallazione pulita.
#
# NON tocca: gli altri siti in /etc/nginx, i certificati Let's Encrypt,
# PostgreSQL come servizio, Node, PM2.
#
# Il database viene conservato per default. Per cancellare anche quello:
#   sudo bash deploy/pulisci.sh --anche-database
#
# Uso: sudo bash deploy/pulisci.sh
set -euo pipefail

CARTELLA="/var/www/phantomlab"
APP="phantomlab"
CANCELLA_DB="no"

if [ "${1:-}" = "--anche-database" ]; then
  CANCELLA_DB="si"
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui con sudo:  sudo bash deploy/pulisci.sh" >&2
  exit 1
fi

echo "============================================================"
echo " Sto per rimuovere:"
echo "   - il processo PM2 '$APP'"
echo "   - la cartella $CARTELLA"
echo "   - la configurazione Nginx di phantom-lab.eu"
if [ "$CANCELLA_DB" = "si" ]; then
  echo "   - IL DATABASE phantomlab E TUTTI I SUOI DATI"
fi
echo
echo " Gli altri siti sul server non vengono toccati."
echo "============================================================"
read -r -p "Scrivi 'confermo' per procedere: " risposta
if [ "$risposta" != "confermo" ]; then
  echo "Annullato."
  exit 0
fi

# --- Backup di sicurezza del .env e del database --------------------------
SALVATAGGIO="/root/phantomlab-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$SALVATAGGIO"

if [ -f "$CARTELLA/.env" ]; then
  cp "$CARTELLA/.env" "$SALVATAGGIO/.env"
  echo "==> Salvato il .env in $SALVATAGGIO/.env"
fi

if sudo -u postgres psql -tAc \
     "SELECT 1 FROM pg_database WHERE datname='phantomlab'" 2>/dev/null | grep -q 1; then
  echo "==> Backup del database in $SALVATAGGIO/phantomlab.sql.gz"
  sudo -u postgres pg_dump phantomlab | gzip > "$SALVATAGGIO/phantomlab.sql.gz"
fi

# --- PM2 -------------------------------------------------------------------
echo "==> Fermo e rimuovo il processo PM2"
UTENTE_APP="$(stat -c '%U' "$CARTELLA" 2>/dev/null || echo root)"
sudo -u "$UTENTE_APP" pm2 delete "$APP" 2>/dev/null || true
sudo -u "$UTENTE_APP" pm2 save --force 2>/dev/null || true

# --- Nginx -----------------------------------------------------------------
echo "==> Rimuovo la configurazione Nginx"
rm -f /etc/nginx/sites-enabled/phantom-lab.eu
rm -f /etc/nginx/sites-available/phantom-lab.eu
rm -f /etc/nginx/conf.d/upgrade-map.conf

if nginx -t 2>/dev/null; then
  systemctl reload nginx
  echo "    Nginx ricaricato."
else
  echo "    ATTENZIONE: nginx -t fallisce. Controlla gli altri siti:" >&2
  nginx -t || true
fi

# --- File dell'applicazione ------------------------------------------------
echo "==> Rimuovo $CARTELLA"
rm -rf "$CARTELLA"

echo "==> Rimuovo i log"
rm -rf /var/log/phantomlab

# --- Database (solo se richiesto) ------------------------------------------
if [ "$CANCELLA_DB" = "si" ]; then
  echo "==> Cancello database e utente PostgreSQL"
  sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS phantomlab;"
  sudo -u postgres psql -q -c "DROP USER IF EXISTS phantomlab;"
else
  echo "==> Database conservato (usa --anche-database per rimuoverlo)"
fi

echo
echo "============================================================"
echo " Pulizia completata."
echo
echo " Backup conservato in: $SALVATAGGIO"
echo " Contiene il .env e un dump del database: NON cancellarlo"
echo " finché la nuova installazione non funziona."
echo
echo " Ora riparti dalla sezione 5 di docs/DEPLOY.md."
echo "============================================================"
