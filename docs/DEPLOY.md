# Deploy su VPS — phantom-lab.eu

Guida per pubblicare Phantom Lab su un server Ubuntu 22.04/24.04.

**Cosa otterrai:** sito su `https://phantom-lab.eu`, chiuso al pubblico con una pagina di attesa, accessibile a chi conosce la password tramite doppio clic sul logo.

**Tempo stimato:** 30–45 minuti su un server pulito.

---

## Percorso rapido

Se il server ha già Node, PostgreSQL, Nginx e PM2 installati, l'intera procedura si riduce a tre comandi:

```bash
cd /var/www/phantomlab
bash deploy/installa.sh          # dipendenze, database, build, avvio
sudo bash deploy/configura-nginx.sh   # Nginx, certificato, HTTPS
```

Gli script si fermano al primo problema e spiegano cosa correggere. Il resto della guida serve per la prima installazione e per capire cosa fanno.

---

## Come leggere questa guida

**1. Guarda sempre il prompt del terminale.** Ti dice dove ti trovi:

| Prompt | Dove sei | Cosa accetta |
| --- | --- | --- |
| `phantom@server:~$` | Shell Linux del VPS | Comandi Linux (`ls`, `cd`, `npm`…) |
| `root@server:~#` | Shell Linux come root | Comandi Linux |
| `postgres=#` | **Dentro PostgreSQL** | **Solo SQL.** Esci con `\q` |
| `>` | Comando incompleto | Manca una virgoletta o parentesi: `Ctrl+C` |

> L'errore più comune è digitare comandi Linux mentre si è dentro `psql`. Se vedi `postgres=#`, scrivi `\q` e premi Invio prima di continuare.

**2. Ogni blocco va eseguito dove indicato.** I blocchi marcati «sul TUO computer» non vanno lanciati sul server, e viceversa.

**3. Non inventare le password.** Dove la guida dice di generarle con `openssl`, fallo: password con `@`, `:`, `/`, `#` rompono gli URL di connessione e producono errori difficili da diagnosticare.

**4. Se un comando fallisce, fermati.** Proseguire con un passo fallito moltiplica gli errori.

---

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [DNS del dominio](#2-dns-del-dominio)
3. [Primo accesso e sicurezza base](#3-primo-accesso-e-sicurezza-base)
4. [Installazione software](#4-installazione-software)
5. [Codice dell'applicazione](#5-codice-dellapplicazione)
6. [Database PostgreSQL](#6-database-postgresql)
7. [Variabili d'ambiente](#7-variabili-dambiente)
8. [Installazione e avvio](#8-installazione-e-avvio)
9. [Nginx e HTTPS](#9-nginx-e-https)
10. [Bot Telegram](#10-bot-telegram)
11. [Verifica finale](#11-verifica-finale)
12. [Accesso a sito chiuso](#12-accesso-a-sito-chiuso)
13. [Aggiornamenti](#13-aggiornamenti)
14. [Reinstallazione pulita](#14-reinstallazione-pulita)
15. [Backup](#15-backup)
16. [Risoluzione problemi](#16-risoluzione-problemi)

---

## 1. Prerequisiti

- VPS con **Ubuntu 22.04 o 24.04**, minimo **2 GB di RAM** (la build di Next.js con 1 GB fallisce spesso).
- Dominio `phantom-lab.eu` con accesso al pannello DNS.
- Accesso `root` o utente con `sudo`.
- Bot Telegram creato con [@BotFather](https://t.me/BotFather): servono **token** e **username**.

---

## 2. DNS del dominio

Nel pannello del registrar imposta due record **A** verso l'IP del VPS:

| Tipo | Nome | Valore | TTL |
| --- | --- | --- | --- |
| A | `@` | `IP_DEL_TUO_VPS` | 3600 |
| A | `www` | `IP_DEL_TUO_VPS` | 3600 |

Verifica la propagazione (può richiedere da minuti a qualche ora):

```bash
dig +short phantom-lab.eu
dig +short www.phantom-lab.eu
```

> Entrambi devono restituire l'IP del VPS. **Non proseguire al passo 9 (HTTPS) prima che il DNS risponda correttamente**: Certbot fallirebbe. Lo script `configura-nginx.sh` controlla il DNS e si ferma se non è pronto.

---

## 3. Primo accesso e sicurezza base

```bash
ssh root@IP_DEL_TUO_VPS
```

### Aggiorna il sistema

```bash
apt update && apt upgrade -y
```

### Crea un utente non privilegiato

Lavorare come `root` è rischioso: un comando sbagliato non ha rete di protezione. **L'applicazione deve girare con questo utente, non con root.**

```bash
adduser phantom
usermod -aG sudo phantom
```

Copia le chiavi SSH sul nuovo utente (se accedi con chiave):

```bash
rsync --archive --chown=phantom:phantom ~/.ssh /home/phantom
```

Da ora in poi accedi così:

```bash
ssh phantom@IP_DEL_TUO_VPS
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

> **Attenzione:** verifica che `OpenSSH` compaia tra le regole *prima* di confermare, altrimenti perdi l'accesso al server.

### Protezione da tentativi di accesso ripetuti

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

---

## 4. Installazione software

### Node.js 22 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # atteso: v22.x
npm -v
```

### Nginx, PostgreSQL, Git e utilità

```bash
sudo apt install -y nginx postgresql postgresql-contrib git ufw curl dnsutils
```

### PM2 (gestore di processi)

```bash
sudo npm install -g pm2
pm2 -v
```

---

## 5. Codice dell'applicazione

Scegli **uno** dei due percorsi:

- **5A — Con Git** (consigliato): gli aggiornamenti futuri sono un solo comando.
- **5B — Senza Git**: copia diretta dei file, più immediata ma scomoda da aggiornare.

---

### 5A. Con Git (consigliato)

#### Passo 1 — Inizializza il repository sul TUO computer

⚠️ **Questi comandi si eseguono in locale, non sul VPS.**

```bash
cd "c:/Users/be4ho/Desktop/WORK/Phantomlab"
git --version
git init -b main
```

> Se Git manca, scaricalo da [git-scm.com](https://git-scm.com/download/win).

#### Passo 2 — Controlla cosa stai per committare

**Questo passo è importante:** il `.env` contiene token e password e non deve finire nel repository.

```bash
git add -A
git status
```

Nell'elenco **non devono comparire**: `.env`, `node_modules/`, `.next/`, `src/generated/`.

Se `.env` compare, fermati:

```bash
git rm --cached .env
grep -n "^\.env" .gitignore
```

#### Passo 3 — Primo commit

```bash
git -c user.name="Il Tuo Nome" -c user.email="tua@email.com" commit -m "Phantom Lab: versione iniziale"
```

> Per non ripetere `-c` ogni volta:
> ```bash
> git config --global user.name "Il Tuo Nome"
> git config --global user.email "tua@email.com"
> ```

#### Passo 4 — Crea il repository remoto

Su [GitHub](https://github.com/new) crea un repository **privato**:

- Nome: `phantomlab`
- Visibilità: **Private**
- **Non** aggiungere README, .gitignore o licenza.

```bash
git remote add origin https://github.com/TUO_UTENTE/phantomlab.git
git push -u origin main
```

> GitHub non accetta più la password dell'account: usa un **Personal Access Token** ([crealo qui](https://github.com/settings/tokens) con permesso `repo`).

#### Passo 5 — Accesso del VPS al repository privato

Sul **VPS**, come utente `phantom`:

```bash
ssh-keygen -t ed25519 -C "vps-phantomlab" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copia la chiave e aggiungila su GitHub: `Repository → Settings → Deploy keys → Add deploy key`.

```bash
ssh -T git@github.com
```

> Atteso: `Hi TUO_UTENTE/phantomlab! You've successfully authenticated...`

#### Passo 6 — Clona sul VPS

```bash
sudo mkdir -p /var/www
sudo chown phantom:phantom /var/www
cd /var/www
git clone git@github.com:TUO_UTENTE/phantomlab.git phantomlab
cd phantomlab
```

---

### 5B. Senza Git

Sul **VPS**:

```bash
sudo mkdir -p /var/www/phantomlab
sudo chown phantom:phantom /var/www/phantomlab
```

Sul **TUO computer**:

```bash
cd "c:/Users/be4ho/Desktop/WORK/Phantomlab"

rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .env \
  --exclude src/generated \
  --exclude .git \
  ./ phantom@IP_DEL_TUO_VPS:/var/www/phantomlab/
```

> `rsync` non è disponibile su Windows di base. Alternative: **Git Bash** (`scp -r ./* phantom@IP:/var/www/phantomlab/`) o **WinSCP** escludendo a mano `node_modules`, `.next`, `.env`, `src/generated`.

---

> ⚠️ **Se `git clone` risponde `Permission denied (publickey)`, non aggirarlo con `sudo`.**
>
> `sudo git clone` funziona, ma lascia tutti i file di proprietà di `root`: npm, la build e PM2 falliranno più avanti con errori che non indicano la vera causa (`chmod: Operation not permitted`, `EACCES`).
>
> La causa vera è che la chiave SSH dell'utente `phantom` non è registrata su GitHub. Verifica e correggi:
>
> ```bash
> ssh -T git@github.com          # deve salutarti con il nome del repository
> cat ~/.ssh/id_ed25519.pub      # se manca, rigenerala (passo 5)
> ```
>
> Se hai già clonato con `sudo`, sistema la proprietà:
>
> ```bash
> sudo chown -R phantom:phantom /var/www/phantomlab
> ```

### 5C. Proprietà dei file

> **Stai lavorando come `root`?** Guarda il prompt: se vedi `root@...#`, i file appena clonati appartengono a `root` e l'app girerà con l'utente `phantom` senza poter scrivere dove serve.
>
> ```bash
> chown -R phantom:phantom /var/www/phantomlab
> su - phantom
> cd /var/www/phantomlab
> ```

Lo script `installa.sh` si rifiuta di partire come root proprio per evitare questo problema.

---

## 6. Database PostgreSQL

> **Genera la password, non inventarla.** Se contiene `@`, `:`, `/`, `#` o `?`, l'URL di connessione si rompe e ottieni errori incomprensibili come `invalid integer value "ON" for connection option "port"`.

### Percorso consigliato: script automatico

```bash
cd /var/www/phantomlab
sudo bash deploy/setup-db.sh
```

Lo script genera la password, crea utente e database, verifica la connessione e stampa la riga pronta per il `.env`. È **rieseguibile**: se utente o database esistono già, reimposta la password e conserva i dati.

Al termine copia la riga `DATABASE_URL="..."`: ti serve al passo 7.

<details>
<summary><b>Procedimento manuale</b></summary>

Genera la password:

```bash
openssl rand -hex 24
```

Crea utente e database (sostituisci `PASSWORD_DB`):

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE USER phantomlab WITH PASSWORD 'PASSWORD_DB';
CREATE DATABASE phantomlab OWNER phantomlab;
GRANT ALL PRIVILEGES ON DATABASE phantomlab TO phantomlab;
SQL

sudo -u postgres psql -d phantomlab -c "GRANT ALL ON SCHEMA public TO phantomlab;"
```

Verifica:

```bash
PGPASSWORD='PASSWORD_DB' psql -h 127.0.0.1 -U phantomlab -d phantomlab -c "SELECT version();"
```
</details>

> PostgreSQL ascolta solo su `127.0.0.1`: non è raggiungibile da internet, e va bene così.

---

## 7. Variabili d'ambiente

### Genera i segreti

```bash
openssl rand -base64 48   # per AUTH_SECRET
openssl rand -hex 32      # per TELEGRAM_WEBHOOK_SECRET
```

### Crea il file `.env`

```bash
cd /var/www/phantomlab
cp .env.example .env
nano .env
```

Compila con i tuoi valori:

```bash
DATABASE_URL="postgresql://phantomlab:PASSWORD_GENERATA@127.0.0.1:5432/phantomlab?schema=public"

TELEGRAM_BOT_TOKEN="il-token-di-BotFather"
TELEGRAM_BOT_USERNAME="phantomlab_bot"
TELEGRAM_ADMIN_CHAT_ID="il-tuo-chat-id"
TELEGRAM_WEBHOOK_SECRET="il-segreto-generato"
ADMIN_TELEGRAM_IDS="il-tuo-telegram-id"

AUTH_SECRET="il-segreto-generato"
ALLOW_DEV_LOGIN="false"

SITO_CHIUSO="true"
SITO_PASSWORD="una-password-lunga-almeno-12-caratteri"

NODE_ENV="production"
PORT="3080"
```

Salva con `Ctrl+O`, `Invio`, poi `Ctrl+X`.

```bash
chmod 600 .env
```

> **Importante:**
> - `PORT` deve valere **3080**: è la porta verso cui Nginx fa proxy. Se le due non coincidono, il sito risponde 502.
> - `ALLOW_DEV_LOGIN` deve restare `"false"`: con `"true"` chiunque potrebbe accedere senza Telegram.
> - `SITO_CHIUSO="true"` è ciò che tiene il sito chiuso al pubblico.
> - Per conoscere il tuo Telegram ID scrivi a [@userinfobot](https://t.me/userinfobot).

### Come viene letto il `.env`

PM2 **non** legge il `.env` da solo. Il file `ecosystem.config.js` lo carica esplicitamente all'avvio e si rifiuta di partire se mancano `DATABASE_URL`, `AUTH_SECRET` o `TELEGRAM_BOT_TOKEN`.

> Conseguenza pratica: dopo ogni modifica al `.env` serve `pm2 reload phantomlab --update-env`. Un semplice `restart` conserva le vecchie variabili.

---

## 8. Installazione e avvio

Un solo comando esegue dipendenze, verifica configurazione, migrazioni, seed, build e avvio:

```bash
cd /var/www/phantomlab
bash deploy/installa.sh
```

Lo script si ferma al primo problema spiegando cosa correggere. Al termine l'app risponde su `http://127.0.0.1:3080`.

<details>
<summary><b>Cosa fa, passo per passo</b></summary>

1. Controlla che Node, npm, PM2, psql e nginx siano installati e che Node sia almeno la versione 20.
2. Crea `/var/log/phantomlab` con i permessi giusti.
3. `npm ci` (o `npm install` se manca il lock).
4. `npm run verifica-env` — diagnosi della configurazione.
5. `npx prisma migrate deploy` e `npm run seed`.
6. `deploy/build.sh` — compila **e copia gli asset** nella build standalone.
7. `pm2 start ecosystem.config.js`, poi verifica che l'app risponda 200.
</details>

### Perché la build ha un passaggio dedicato

Next.js con `output: "standalone"` **non** copia `static/` e `public/` dentro `.next/standalone/`. Senza quella copia il server parte regolarmente — i log dicono `✓ Ready` — ma ogni CSS e JS risponde 404 e il browser mostra *"This page couldn't load"*.

`deploy/build.sh` fa le due cose insieme e verifica il risultato. **Non lanciare mai `npm run build` da solo** per un deploy: usa sempre lo script.

### Rendi PM2 persistente al riavvio

```bash
pm2 startup
```

Il comando stampa una riga che inizia con `sudo env PATH=...`: **copiala ed eseguila**.

```bash
pm2 save
```

<details>
<summary><b>La build viene "Killed" (RAM insufficiente)</b></summary>

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```
</details>

<details>
<summary><b><code>npm ci</code> fallisce: "package.json and package-lock.json are not in sync"</b></summary>

**Sul TUO computer**, rigenera il lock:

```bash
cd "c:/Users/be4ho/Desktop/WORK/Phantomlab"
rm -rf node_modules package-lock.json
npm install
npm ci
git add package-lock.json && git commit -m "Rigenera package-lock.json" && git push
```

Poi sul VPS: `git pull && npm ci`.

**Soluzione rapida:** sul VPS usa `npm install` al posto di `npm ci`.
</details>

---

## 9. Nginx e HTTPS

Un solo comando gestisce l'intera configurazione, compreso il certificato:

```bash
sudo bash deploy/configura-nginx.sh
```

<details>
<summary><b>Cosa fa, passo per passo</b></summary>

1. **Verifica il DNS**: confronta l'IP del server con quello a cui punta il dominio, e si ferma se non corrispondono (Certbot fallirebbe).
2. **Installa la map `$connection_upgrade`** in `/etc/nginx/conf.d/`, saltandola se un altro sito la definisce già.
3. **Configurazione provvisoria in HTTP**, necessaria perché Certbot possa validare il dominio.
4. **Ottiene il certificato** con `certbot certonly --webroot`, che non tocca la configurazione di Nginx.
5. **Applica `deploy/nginx.conf`** e verifica che il sito risponda 200.
</details>

### Il dettaglio che rompeva il sito

Nella vecchia configurazione il blocco `/_next/static/` non inoltrava l'intestazione `Host`. Nginx passava quindi `Host: 127.0.0.1:3080`, Next.js non riconosceva la richiesta e restituiva gli asset come `text/plain`. Il browser li rifiutava:

```
Refused to execute script ... MIME type ('text/plain') is not executable
```

In `deploy/nginx.conf` le intestazioni di proxy sono ora dichiarate **una sola volta a livello di `server`**, così ogni `location` le eredita e il problema non può ripresentarsi aggiungendo un blocco nuovo.

### Verifica il rinnovo automatico

```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

> Il blocco `:80` mantiene aperto `/.well-known/acme-challenge/` proprio per permettere i rinnovi.

---

## 10. Bot Telegram

### Registra il webhook

Sostituisci i valori con i tuoi:

```bash
source /var/www/phantomlab/.env

curl -F "url=https://phantom-lab.eu/api/telegram/webhook" \
     -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

Attesa: `{"ok":true,"result":true,"description":"Webhook was set"}`.

### Verifica lo stato

```bash
source /var/www/phantomlab/.env
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Controlla che `pending_update_count` sia basso e che non compaia `last_error_message`.

### Configura la Mini App

Su [@BotFather](https://t.me/BotFather):

1. `/mybots` → seleziona il bot → **Bot Settings** → **Menu Button** → **Configure menu button**
2. URL: `https://phantom-lab.eu`
3. Testo del pulsante: `Apri Phantom Lab`

> Il webhook resta raggiungibile anche a sito chiuso: il middleware lo esclude di proposito, così Telegram non accumula errori.

---

## 11. Verifica finale

```bash
# 1. Il sito risponde in HTTPS
curl -I https://phantom-lab.eu

# 2. I visitatori vedono la pagina di attesa
curl -s https://phantom-lab.eu | grep -o "In preparazione"

# 3. Gli asset hanno il MIME type corretto (deve dire application/javascript)
curl -s -o /dev/null -w '%{content_type}\n' \
  "https://phantom-lab.eu$(curl -s https://phantom-lab.eu | grep -o '/_next/static/chunks/[^"]*\.js' | head -1)"

# 4. Le API sono chiuse (atteso: 503)
curl -s -o /dev/null -w "%{http_code}\n" https://phantom-lab.eu/api/notifiche

# 5. Il webhook è raggiungibile (atteso: 401 senza il segreto corretto)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://phantom-lab.eu/api/telegram/webhook

# 6. L'app è attiva e stabile
pm2 status

# 7. Nessun errore recente
pm2 logs phantomlab --lines 50 --nostream
```

Il controllo **3** è quello che intercetta il guasto più insidioso: se restituisce `text/plain` invece di `application/javascript`, il sito si vedrà senza stile e senza interazioni.

Verifica anche dal browser:
- `https://phantom-lab.eu` → pagina di attesa con lucchetto valido
- `https://www.phantom-lab.eu` → reindirizza al dominio senza www
- `http://phantom-lab.eu` → reindirizza a HTTPS
- **Console del browser (F12) senza errori rossi**

---

## 12. Accesso a sito chiuso

Con `SITO_CHIUSO="true"` chiunque visiti il sito vede la pagina di attesa.

**Per entrare:**

1. Apri `https://phantom-lab.eu`
2. Fai **doppio clic sul quadrato verde con la P** in alto a sinistra
3. Inserisci il valore di `SITO_PASSWORD`
4. Premi **Entra**

Il cookie di sblocco dura **30 giorni** e vale solo per quel browser. L'URL nella barra non cambia: la pagina di attesa è servita con un *rewrite*, così non rivela l'esistenza di un percorso riservato.

### Aprire il sito al pubblico

```bash
cd /var/www/phantomlab
nano .env          # imposta SITO_CHIUSO="false"
pm2 reload phantomlab --update-env
```

> `--update-env` è indispensabile: senza, PM2 riavvia il processo mantenendo le vecchie variabili.

### Uscire dalla modalità riservata su un dispositivo

```bash
curl -X DELETE https://phantom-lab.eu/api/gate
```

---

## 13. Aggiornamenti

```bash
cd /var/www/phantomlab
bash deploy/aggiorna.sh
```

Lo script scarica, installa, migra, compila **con la copia degli asset**, riavvia e verifica che l'app risponda. Se qualcosa va storto stampa i log e esce con errore.

Se preferisci procedere a mano:

```bash
cd /var/www/phantomlab
git pull
npm ci
npx prisma migrate deploy
bash deploy/build.sh          # NON solo `npm run build`
pm2 reload phantomlab --update-env
```

---

## 14. Reinstallazione pulita

Se la configurazione è compromessa e vuoi ripartire da zero:

```bash
cd /var/www/phantomlab
sudo bash deploy/pulisci.sh
```

Lo script chiede conferma esplicita, poi:

- salva `.env` e un dump del database in `/root/phantomlab-backup-<data>/`
- rimuove il processo PM2, la cartella `/var/www/phantomlab`, i log e la configurazione Nginx del solo `phantom-lab.eu`
- **conserva il database** (usa `--anche-database` per rimuoverlo)
- **non tocca** gli altri siti, i certificati, PostgreSQL, Node e PM2

Poi riparti dalla [sezione 5](#5-codice-dellapplicazione):

```bash
cd /var/www
git clone git@github.com:TUO_UTENTE/phantomlab.git phantomlab
cd phantomlab
cp /root/phantomlab-backup-*/.env .env    # riusa la configurazione salvata
chmod 600 .env
bash deploy/installa.sh
sudo bash deploy/configura-nginx.sh
```

> Il backup in `/root/` non viene cancellato: conservalo finché la nuova installazione non funziona.

---

## 15. Backup

### Backup automatico giornaliero

```bash
chmod +x /var/www/phantomlab/deploy/backup.sh
sudo mkdir -p /var/backups/phantomlab
sudo chown phantom:phantom /var/backups/phantomlab
```

Salva la password del database per `pg_dump`:

```bash
echo "127.0.0.1:5432:phantomlab:phantomlab:LA_PASSWORD_DEL_DB" > ~/.pgpass
chmod 600 ~/.pgpass
```

Aggiungi il job con `crontab -e`:

```
0 3 * * * /var/www/phantomlab/deploy/backup.sh >> /var/log/phantomlab/backup.log 2>&1
```

Provalo subito:

```bash
bash /var/www/phantomlab/deploy/backup.sh
ls -lh /var/backups/phantomlab/
```

### Ripristino

```bash
gunzip -c /var/backups/phantomlab/phantomlab_AAAAMMGG_HHMMSS.sql.gz | \
  psql -U phantomlab -h 127.0.0.1 phantomlab
```

> I backup restano sul VPS: se il server si guasta, li perdi. Copiali periodicamente altrove.

---

## 16. Risoluzione problemi

> **Prima di tutto**, esegui la diagnosi automatica:
>
> ```bash
> cd /var/www/phantomlab
> npm run verifica-env
> ```

### La pagina è bianca o dice "This page couldn't load"

Nella console del browser (F12) vedi errori come:

```
Failed to load resource: 404   /_next/static/chunks/....js
Refused to execute script ... MIME type ('text/plain') is not executable
ChunkLoadError: Failed to load chunk
```

Due cause possibili, in quest'ordine:

**1. Gli asset non sono nella build standalone.**

```bash
ls /var/www/phantomlab/.next/standalone/.next/static/chunks/ | head
```

Se la cartella non esiste o è vuota:

```bash
cd /var/www/phantomlab
bash deploy/build.sh
pm2 restart phantomlab
```

**2. Nginx non inoltra l'intestazione `Host`.**

```bash
curl -s -o /dev/null -w '%{content_type}\n' https://phantom-lab.eu/_next/static/chunks/
```

Se risponde `text/plain`, la configurazione è quella vecchia:

```bash
sudo cp /var/www/phantomlab/deploy/nginx.conf /etc/nginx/sites-available/phantom-lab.eu
sudo nginx -t && sudo systemctl reload nginx
```

### PM2 va in crash-loop: `SyntaxError: "undefined" is not valid JSON`

L'errore arriva da `ProcessUtils.js` di PM2, non dall'app. Significa che PM2 non è riuscito a leggere la configurazione.

```bash
cd /var/www/phantomlab
node --check ecosystem.config.js     # sintassi del file
ls -la .env                          # il file deve esistere
pm2 delete phantomlab
pm2 start ecosystem.config.js
```

`ecosystem.config.js` ora fallisce con un messaggio esplicito se manca il `.env` o se mancano le variabili obbligatorie, invece di lasciar partire l'app in uno stato incoerente.

### Il sito è aperto a tutti nonostante `SITO_CHIUSO="true"`

Il processo sta girando con variabili vecchie o senza `.env`:

```bash
cd /var/www/phantomlab
grep SITO_CHIUSO .env               # deve dire "true"
pm2 reload phantomlab --update-env  # NON un semplice restart
```

Verifica che il middleware sia attivo:

```bash
grep -n "return NextResponse.next()" src/middleware.ts
```

Se la prima riga del corpo della funzione è un `return NextResponse.next()` incondizionato, il gate è stato disattivato per debug: rimuovi quella riga, poi `bash deploy/build.sh && pm2 restart phantomlab`.

### 502 Bad Gateway

```bash
pm2 status
curl -I http://127.0.0.1:3080
grep '^PORT' /var/www/phantomlab/.env
grep -n '127.0.0.1:' /etc/nginx/sites-available/phantom-lab.eu
```

Le ultime due devono indicare la **stessa porta**. Se l'app è ferma:

```bash
pm2 logs phantomlab --lines 50
pm2 restart phantomlab --update-env
```

### Errori di PostgreSQL

<details>
<summary><b><code>invalid integer value "ON" for connection option "port"</code></b></summary>

La password del database contiene `@` o un altro carattere speciale: tutto ciò che segue viene letto come indirizzo del server.

```bash
NUOVA=$(openssl rand -hex 24)
echo "Nuova password: $NUOVA"
sudo -u postgres psql -c "ALTER USER phantomlab WITH PASSWORD '$NUOVA';"
nano /var/www/phantomlab/.env    # aggiorna DATABASE_URL
npm run verifica-env
```
</details>

<details>
<summary><b><code>role already exists</code> / <code>database already exists</code></b></summary>

**Non è un errore bloccante:** i comandi erano già stati eseguiti. Riesegui `sudo bash deploy/setup-db.sh`, che reimposta la password conservando i dati.

Per ripartire da zero (⚠️ **cancella tutti i dati**):

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS phantomlab;"
sudo -u postgres psql -c "DROP USER IF EXISTS phantomlab;"
sudo bash /var/www/phantomlab/deploy/setup-db.sh
```
</details>

<details>
<summary><b><code>Peer authentication failed</code></b></summary>

Manca `-h 127.0.0.1`: senza, `psql` usa il socket locale con autenticazione di sistema.

```bash
PGPASSWORD='LA_TUA_PASSWORD' psql -h 127.0.0.1 -U phantomlab -d phantomlab -c "SELECT 1;"
```
</details>

<details>
<summary><b>Vedo <code>postgres=#</code> e i comandi non funzionano</b></summary>

Sei **dentro `psql`**: lì funzionano solo comandi SQL. Esci con `\q`.
</details>

### Errori di Nginx

<details>
<summary><b><code>duplicate variable "connection_upgrade"</code></b></summary>

Un altro sito sul server definisce già la stessa map:

```bash
sudo rm /etc/nginx/conf.d/upgrade-map.conf
sudo nginx -t && sudo systemctl reload nginx
```
</details>

<details>
<summary><b><code>protocol options redefined for 0.0.0.0:443</code></b></summary>

È un **avviso**, non un errore: più siti sulla stessa porta 443 ripetono le opzioni SSL. Non blocca nulla.
</details>

### Certbot non riesce a validare il dominio

```bash
dig +short phantom-lab.eu     # deve dare l'IP del VPS
sudo ufw status               # 'Nginx Full' deve essere permesso
sudo nginx -t
```

Il DNS deve essere propagato **prima** di eseguire Certbot.

### Il bot non invia notifiche

```bash
source /var/www/phantomlab/.env
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Controlla `last_error_message`. Cause frequenti: `TELEGRAM_WEBHOOK_SECRET` diverso da quello registrato, o certificato HTTPS non valido.

### Le modifiche al `.env` non hanno effetto

```bash
pm2 reload phantomlab --update-env
```

### Ho dimenticato la password del sito

```bash
grep SITO_PASSWORD /var/www/phantomlab/.env
```

### Nominare un amministratore

Se l'utente ha già scritto al bot almeno una volta:

```bash
cd /var/www/phantomlab
npm run promuovi-admin -- IL_TELEGRAM_ID
```

Altrimenti aggiungi il suo ID a `ADMIN_TELEGRAM_IDS` nel `.env` **prima** del suo primo accesso, poi `pm2 reload phantomlab --update-env`.

---

## Riferimento rapido

| Operazione | Comando |
| --- | --- |
| Installazione completa | `bash deploy/installa.sh` |
| Nginx + HTTPS | `sudo bash deploy/configura-nginx.sh` |
| Aggiornamento | `bash deploy/aggiorna.sh` |
| Ricompilare gli asset | `bash deploy/build.sh && pm2 restart phantomlab` |
| Reinstallazione pulita | `sudo bash deploy/pulisci.sh` |
| Diagnosi configurazione | `npm run verifica-env` |
| Setup database | `sudo bash deploy/setup-db.sh` |
| Stato applicazione | `pm2 status` |
| Log in tempo reale | `pm2 logs phantomlab` |
| Riavvio dopo modifica `.env` | `pm2 reload phantomlab --update-env` |
| Backup manuale | `bash deploy/backup.sh` |
| Ricarica Nginx | `sudo nginx -t && sudo systemctl reload nginx` |
| Log Nginx | `sudo tail -f /var/log/nginx/phantomlab.error.log` |
| Apri il sito al pubblico | `SITO_CHIUSO="false"` + `pm2 reload phantomlab --update-env` |
