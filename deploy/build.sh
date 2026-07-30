#!/usr/bin/env bash
# Compila l'app e prepara la build standalone completa.
#
# Next.js con output:"standalone" NON copia static/ e public/ dentro
# .next/standalone: senza questo passaggio il sito parte ma restituisce 404
# su ogni CSS e JS, e il browser mostra "This page couldn't load".
# Ogni percorso che compila deve passare da qui.
set -euo pipefail

CARTELLA="${1:-/var/www/phantomlab}"
cd "$CARTELLA"

echo "==> Genero il client Prisma"
npx prisma generate

echo "==> Compilo l'applicazione"
npm run build

echo "==> Copio gli asset nella build standalone"
if [ ! -d .next/standalone ]; then
  echo "ERRORE: .next/standalone non esiste dopo la build." >&2
  echo "Verifica che next.config.ts contenga  output: \"standalone\"." >&2
  exit 1
fi

rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/

if [ -d public ]; then
  rm -rf .next/standalone/public
  cp -r public .next/standalone/
fi

# Il server standalone legge il .env dalla propria cartella di lavoro.
# PM2 imposta cwd sulla radice del progetto, quindi il file va bene dov'è,
# ma lo copiamo anche accanto a server.js per gli avvii manuali.
if [ -f .env ]; then
  cp .env .next/standalone/.env
  chmod 600 .next/standalone/.env
fi

echo "==> Verifico che gli asset siano al loro posto"
if [ ! -d .next/standalone/.next/static/chunks ]; then
  echo "ERRORE: gli asset non sono stati copiati correttamente." >&2
  exit 1
fi

CONTA=$(find .next/standalone/.next/static -type f | wc -l)
echo "    $CONTA file statici pronti."
