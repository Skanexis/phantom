# Phantom Lab

Piattaforma per la vendita di servizi IT e abbonamenti mensili, pensata per essere usata come **Telegram Mini App**.

La specifica tecnica completa è in [docs/SPECIFICA-TECNICA.md](docs/SPECIFICA-TECNICA.md).

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** per lo stile
- **Prisma 7** con SQLite in sviluppo (in produzione: PostgreSQL)
- Autenticazione tramite `initData` di Telegram, sessione in cookie firmato (JWT)

## Avvio rapido

```bash
npm install
cp .env.example .env      # poi compila le variabili
npx prisma migrate dev
npm run seed
npm run dev
```

Il sito è disponibile su http://localhost:3000.

Per assegnare il ruolo amministratore a un utente già registrato:

```bash
npm run promuovi-admin -- <telegramId>
```

In alternativa, elenca i Telegram ID in `ADMIN_TELEGRAM_IDS` prima del loro primo accesso.

## Variabili d'ambiente

| Variabile | Descrizione |
| --- | --- |
| `DATABASE_URL` | Connessione al database. |
| `TELEGRAM_BOT_TOKEN` | Token del bot (BotFather). Serve a validare `initData` e inviare notifiche. |
| `TELEGRAM_BOT_USERNAME` | Username del bot senza `@`. Serve al deep link di accesso da browser. |
| `TELEGRAM_ADMIN_CHAT_ID` | Chat che riceve le notifiche delle nuove richieste. |
| `TELEGRAM_WEBHOOK_SECRET` | Segreto per validare le chiamate al webhook. |
| `AUTH_SECRET` | Segreto per firmare le sessioni (stringa casuale lunga). |
| `ADMIN_TELEGRAM_IDS` | Telegram ID (separati da virgola) che ricevono il ruolo `ADMIN`. |
| `ALLOW_DEV_LOGIN` | Se `true`, in sviluppo consente l'accesso fuori da Telegram con un utente fittizio. |

> In produzione `ALLOW_DEV_LOGIN` deve restare `false`: senza `initData` valido l'accesso viene rifiutato.

## Struttura

```
src/
  app/
    page.tsx                    homepage pubblica
    richiesta/                  modulo di richiesta sviluppo su misura
    area-personale/             abbonamento, richieste e notifiche dell'utente
    admin/                      pannello amministrativo (solo ruolo ADMIN)
    api/
      auth/telegram/            login tramite initData
      richieste/                creazione richieste + notifiche
      telegram/webhook/         webhook del bot
  components/                   UI riutilizzabile
  lib/                          Prisma, sessioni, validazione Telegram, contenuti
prisma/
  schema.prisma                 modello dati
  seed.ts                       contenuti iniziali in italiano
```

## Accesso e account

L'account è sempre lo stesso, identificato dal Telegram ID, sia che si arrivi dalla Mini App sia da un link normale.

- **Dentro Telegram**: accesso automatico validando l'`initData` firmato.
- **Da browser**: il sito genera un token monouso (valido 10 minuti), apre il bot con `?start=<token>`; quando l'utente preme *Avvia*, il webhook conferma il token e la pagina completa l'accesso da sola.

Il token è a uso singolo: una volta consumato non concede altre sessioni. Inviare richieste e attivare abbonamenti richiede un account collegato, verificato lato server e non solo nell'interfaccia.

## Contenuti editabili

Testi della homepage, servizi, vantaggi, FAQ, contatti e abbonamenti sono salvati a database e modificabili dal pannello `/admin` senza toccare il codice.

## Bot Telegram

1. Crea il bot con [@BotFather](https://t.me/BotFather) e imposta `TELEGRAM_BOT_TOKEN`.
2. Registra il webhook:

```bash
curl -F "url=https://phantom-lab.eu/api/telegram/webhook" \
     -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

3. Configura la Mini App su BotFather puntando all'URL del sito.

## Produzione

In `prisma/schema.prisma` cambia il provider in `postgresql`, aggiorna `DATABASE_URL` e sostituisci l'adapter in `src/lib/prisma.ts` con quello PostgreSQL.
