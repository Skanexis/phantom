#!/usr/bin/env bash
# Crea utente e database PostgreSQL per Phantom Lab.
#
# Genera da sé una password priva di caratteri che romperebbero l'URL di
# connessione (@ : / # ?), causa più frequente di errori in fase di setup.
#
# Uso:  sudo bash deploy/setup-db.sh
set -euo pipefail

DB_NOME="phantomlab"
DB_UTENTE="phantomlab"

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui con sudo:  sudo bash deploy/setup-db.sh" >&2
  exit 1
fi

if ! command -v psql > /dev/null 2>&1; then
  echo "PostgreSQL non è installato. Esegui prima:" >&2
  echo "  sudo apt install -y postgresql postgresql-contrib" >&2
  exit 1
fi

if ! systemctl is-active --quiet postgresql; then
  echo "==> Avvio PostgreSQL"
  systemctl start postgresql
fi

# Solo esadecimale: nessun carattere problematico nell'URL di connessione.
PASSWORD=$(openssl rand -hex 24)

esiste_utente=$(sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='$DB_UTENTE'" || echo "")
esiste_db=$(sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NOME'" || echo "")

if [ "$esiste_utente" = "1" ]; then
  echo "==> L'utente '$DB_UTENTE' esiste già: reimposto la password"
  sudo -u postgres psql -q -c \
    "ALTER USER $DB_UTENTE WITH PASSWORD '$PASSWORD';"
else
  echo "==> Creo l'utente '$DB_UTENTE'"
  sudo -u postgres psql -q -c \
    "CREATE USER $DB_UTENTE WITH PASSWORD '$PASSWORD';"
fi

if [ "$esiste_db" = "1" ]; then
  echo "==> Il database '$DB_NOME' esiste già: lo mantengo (i dati restano)"
else
  echo "==> Creo il database '$DB_NOME'"
  sudo -u postgres psql -q -c \
    "CREATE DATABASE $DB_NOME OWNER $DB_UTENTE;"
fi

sudo -u postgres psql -q -c \
  "GRANT ALL PRIVILEGES ON DATABASE $DB_NOME TO $DB_UTENTE;"
sudo -u postgres psql -q -d "$DB_NOME" -c \
  "GRANT ALL ON SCHEMA public TO $DB_UTENTE;"

echo "==> Verifico la connessione"
if PGPASSWORD="$PASSWORD" psql -h 127.0.0.1 -U "$DB_UTENTE" -d "$DB_NOME" \
     -tAc "SELECT 1;" > /dev/null 2>&1; then
  echo "    Connessione riuscita."
else
  echo "    Connessione FALLITA. Controlla i log:" >&2
  echo "    sudo tail -50 /var/log/postgresql/postgresql-*-main.log" >&2
  exit 1
fi

echo
echo "============================================================"
echo " Database pronto."
echo
echo " Copia questa riga nel file .env di /var/www/phantomlab:"
echo
echo "DATABASE_URL=\"postgresql://$DB_UTENTE:$PASSWORD@127.0.0.1:5432/$DB_NOME?schema=public\""
echo
echo " La password non viene salvata da nessun'altra parte:"
echo " se la perdi, riesegui questo script per rigenerarla."
echo "============================================================"
