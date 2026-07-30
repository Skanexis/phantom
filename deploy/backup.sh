#!/usr/bin/env bash
# Backup giornaliero del database PostgreSQL, con rotazione a 14 giorni.
# Uso da crontab:  0 3 * * * /var/www/phantomlab/deploy/backup.sh
set -euo pipefail

CARTELLA_BACKUP="/var/backups/phantomlab"
GIORNI_CONSERVAZIONE=14
DB_NOME="phantomlab"
DB_UTENTE="phantomlab"

mkdir -p "$CARTELLA_BACKUP"

DATA=$(date +%Y%m%d_%H%M%S)
FILE="$CARTELLA_BACKUP/phantomlab_$DATA.sql.gz"

# PGPASSWORD viene letto da ~/.pgpass oppure dall'ambiente.
pg_dump -U "$DB_UTENTE" -h 127.0.0.1 "$DB_NOME" | gzip > "$FILE"

echo "Backup creato: $FILE ($(du -h "$FILE" | cut -f1))"

# Rimuove i backup più vecchi della soglia.
find "$CARTELLA_BACKUP" -name "phantomlab_*.sql.gz" -mtime +"$GIORNI_CONSERVAZIONE" -delete

echo "Backup presenti: $(find "$CARTELLA_BACKUP" -name 'phantomlab_*.sql.gz' | wc -l)"
