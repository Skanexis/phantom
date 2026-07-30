# Deploy su VPS — phantom-lab.eu

Guida completa per pubblicare Phantom Lab su un server Ubuntu 22.04/24.04.

**Cosa otterrai:** sito su `https://phantom-lab.eu`, chiuso al pubblico con una pagina di attesa, accessibile a chi conosce la password tramite doppio clic sul logo.

**Tempo stimato:** 45–60 minuti.

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

**4. Se un comando fallisce, fermati.** Proseguire con un passo fallito moltiplica gli errori. Ogni sezione ha un riquadro «errori comuni» a fine paragrafo.

---

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [DNS del dominio](#2-dns-del-dominio)
3. [Primo accesso e sicurezza base](#3-primo-accesso-e-sicurezza-base)
4. [Installazione software](#4-installazione-software)
5. [Codice dell'applicazione](#5-codice-dellapplicazione)
6. [Database PostgreSQL](#6-database-postgresql)
7. [Variabili d'ambiente](#7-variabili-dambiente)
8. [Build e primo avvio](#8-build-e-primo-avvio)
9. [Nginx e HTTPS](#9-nginx-e-https)
10. [Bot Telegram](#10-bot-telegram)
11. [Verifica finale](#11-verifica-finale)
12. [Accesso a sito chiuso](#12-accesso-a-sito-chiuso)
13. [Aggiornamenti](#13-aggiornamenti)
14. [Backup](#14-backup)
15. [Risoluzione problemi](#15-risoluzione-problemi)

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

> Entrambi devono restituire l'IP del VPS. **Non proseguire al passo 9 (HTTPS) prima che il DNS risponda correttamente**: Certbot fallirebbe.

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

Lavorare come `root` è rischioso: un comando sbagliato non ha rete di protezione.

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
sudo apt install -y nginx postgresql postgresql-contrib git ufw
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

Apri il terminale nella cartella del progetto:

```bash
cd "c:/Users/be4ho/Desktop/WORK/Phantomlab"
```

Verifica che Git sia installato:

```bash
git --version
```

> Se manca, scaricalo da [git-scm.com](https://git-scm.com/download/win).

Inizializza il repository:

```bash
git init -b main
```

#### Passo 2 — Controlla cosa stai per committare

**Questo passo è importante:** il `.env` contiene token e password e non deve finire nel repository.

```bash
git add -A
git status
```

Nell'elenco **non devono comparire**: `.env`, `node_modules/`, `.next/`, `src/generated/`.

Se `.env` compare, fermati e verifica il `.gitignore`:

```bash
git rm --cached .env
grep -n "^\.env" .gitignore
```

#### Passo 3 — Primo commit

```bash
git -c user.name="Il Tuo Nome" -c user.email="tua@email.com" commit -m "Phantom Lab: versione iniziale"
```

> Per non ripetere `-c` ogni volta, configura Git una tantum:
> ```bash
> git config --global user.name "Il Tuo Nome"
> git config --global user.email "tua@email.com"
> ```

#### Passo 4 — Crea il repository remoto

Su [GitHub](https://github.com/new) crea un repository **privato** (il codice contiene la logica del gate di accesso):

- Nome: `phantomlab`
- Visibilità: **Private**
- **Non** aggiungere README, .gitignore o licenza: il progetto li ha già.

Collega e invia:

```bash
git remote add origin https://github.com/TUO_UTENTE/phantomlab.git
git push -u origin main
```

> GitHub non accetta più la password dell'account: alla richiesta di credenziali usa un **Personal Access Token** ([crealo qui](https://github.com/settings/tokens) con permesso `repo`).

#### Passo 5 — Accesso del VPS al repository privato

Sul **VPS**, genera una chiave SSH:

```bash
ssh-keygen -t ed25519 -C "vps-phantomlab" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copia la chiave stampata e aggiungila su GitHub come **Deploy key**:

`Repository → Settings → Deploy keys → Add deploy key` — incolla, lascia la scrittura disabilitata, conferma.

Verifica la connessione:

```bash
ssh -T git@github.com
```

> Atteso: `Hi TUO_UTENTE/phantomlab! You've successfully authenticated...`. Alla prima connessione conferma con `yes`.

#### Passo 6 — Clona sul VPS

```bash
sudo mkdir -p /var/www
sudo chown phantom:phantom /var/www
cd /var/www
git clone git@github.com:TUO_UTENTE/phantomlab.git phantomlab
cd phantomlab
```

Prosegui al [passo 5C](#5c-installazione-dipendenze).

---

### 5B. Senza Git

Sul **VPS**, prepara la cartella:

```bash
sudo mkdir -p /var/www/phantomlab
sudo chown phantom:phantom /var/www/phantomlab
```

Sul **TUO computer**, invia i file:

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

> `rsync` non è disponibile su Windows di base. Alternative:
> - **Git Bash** include `scp`: `scp -r ./* phantom@IP:/var/www/phantomlab/`
> - **WinSCP** ([winscp.net](https://winscp.net)), interfaccia grafica: escludi manualmente `node_modules`, `.next`, `.env`, `src/generated`.

> ⚠️ Con questo metodo ogni aggiornamento richiede di ripetere il trasferimento a mano. Se prevedi di aggiornare spesso, il percorso 5A conviene.

---

### 5C. Installazione dipendenze

Sul VPS, dentro `/var/www/phantomlab`:

```bash
cd /var/www/phantomlab
npm ci
```

**Output atteso:** `added NNN packages in ...`

<details>
<summary><b>Errore: "npm ci can only install with an existing package-lock.json"</b></summary>

Il file `package-lock.json` non è arrivato sul server. Verifica:

```bash
ls -la package-lock.json
```

Se manca, ricopialo dal tuo computer oppure usa `npm install` (più lento e potenzialmente con versioni diverse).
</details>

<details>
<summary><b>La build o npm ci viene "Killed"</b></summary>

RAM insufficiente. Crea uno swap file:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```
</details>

### Cartella dei log

```bash
sudo mkdir -p /var/log/phantomlab
sudo chown phantom:phantom /var/log/phantomlab
```

---

## 6. Database PostgreSQL

> **Prima di iniziare, due avvertenze che evitano il 90% degli errori:**
>
> **1. Genera la password, non inventarla.** Se contiene `@`, `:`, `/`, `#` o `?`, l'URL di connessione si rompe e ottieni errori incomprensibili come
> `invalid integer value "ON" for connection option "port"`.
> Il comando qui sotto genera una password sicura e priva di caratteri problematici.
>
> **2. Attenzione al prompt.** Quando entri in `psql`, il prompt diventa `postgres=#`.
> Lì dentro funzionano **solo** comandi SQL, non comandi Linux. Se provi a lanciare `psql` o `ls` mentre sei già dentro, non succede nulla di buono: esci prima con `\q`.

### Percorso rapido: script automatico

Se hai già scaricato il codice sul VPS (passo 6), un solo comando fa tutto — genera la password, crea utente e database, verifica la connessione e stampa la riga pronta per il `.env`:

```bash
cd /var/www/phantomlab
sudo bash deploy/setup-db.sh
```

Lo script è **rieseguibile**: se utente o database esistono già, non fallisce — reimposta la password e conserva i dati.

Al termine copia la riga `DATABASE_URL="..."` che compare: ti servirà al passo 7.

> Se preferisci capire cosa succede o lo script dà problemi, segui il procedimento manuale qui sotto.

---

### 6.1 Genera la password del database

```bash
openssl rand -hex 24
```

a96e926b212eb64d0b9c0750facc0a2faddc95d39b6a4ce9

Copia il risultato (48 caratteri, solo lettere e numeri) e **conservalo**: lo userai due volte.

D'ora in avanti in questa guida lo chiamo `PASSWORD_DB`.

### 6.2 Crea utente e database

Questo comando fa tutto in un colpo solo, **senza entrare in `psql`**. Sostituisci `PASSWORD_DB` con quella che hai appena generato:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE USER phantomlab WITH PASSWORD 'PASSWORD_DB';
CREATE DATABASE phantomlab OWNER phantomlab;
GRANT ALL PRIVILEGES ON DATABASE phantomlab TO phantomlab;
SQL
```

Poi assegna i permessi sullo schema:

```bash
sudo -u postgres psql -d phantomlab -c "GRANT ALL ON SCHEMA public TO phantomlab;"
```

**Output atteso:**

```
CREATE ROLE
CREATE DATABASE
GRANT
GRANT
```

<details>
<summary><b>Vedi "role already exists" o "database already exists"?</b></summary>

Significa che avevi già eseguito questi comandi in un tentativo precedente. **Non è un guasto.**

Se non ricordi la password impostata allora, reimpostala:

```bash
sudo -u postgres psql -c "ALTER USER phantomlab WITH PASSWORD 'PASSWORD_DB';"
```

Se preferisci ripartire da zero (⚠️ **cancella tutti i dati**):

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS phantomlab;"
sudo -u postgres psql -c "DROP USER IF EXISTS phantomlab;"
```

Poi ripeti il passo 6.2.
</details>

### 6.3 Verifica la connessione

```bash
PGPASSWORD='PASSWORD_DB' psql -h 127.0.0.1 -U phantomlab -d phantomlab -c "SELECT version();"
```

> Uso `PGPASSWORD` invece dell'URL completo proprio per evitare i problemi di caratteri speciali.

**Output atteso** — una riga che inizia con:

```
PostgreSQL 16.x on x86_64-pc-linux-gnu ...
```

<details>
<summary><b>Errore: "invalid integer value ... for connection option port"</b></summary>

L'URL di connessione è malformato, quasi sempre perché la password contiene `@`.

Se hai già creato l'utente con una password che contiene caratteri speciali, la soluzione più semplice è cambiarla con una generata:

```bash
NUOVA=$(openssl rand -hex 24)
echo "Nuova password: $NUOVA"
sudo -u postgres psql -c "ALTER USER phantomlab WITH PASSWORD '$NUOVA';"
```

Annota la nuova password e usala nel `.env`.
</details>

<details>
<summary><b>Errore: "Peer authentication failed"</b></summary>

Stai connettendo via socket locale invece che via TCP. Assicurati di includere `-h 127.0.0.1` nel comando.
</details>

<details>
<summary><b>Errore: "could not connect to server"</b></summary>

PostgreSQL non è avviato:

```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```
</details>

> PostgreSQL ascolta solo su `127.0.0.1`: non è raggiungibile da internet, e va bene così.

---

## 7. Variabili d'ambiente

### Genera il segreto per le sessioni

```bash
openssl rand -base64 48
```

Copia il risultato: servirà per `AUTH_SECRET`.

Genera anche un segreto per il webhook:

```bash
openssl rand -hex 32
```

### Crea il file `.env`

```bash
cd /var/www/phantomlab
nano .env
```

Contenuto (sostituisci i valori tra virgolette):

```bash
DATABASE_URL="postgresql://phantomlab:LA_PASSWORD_DEL_DB@127.0.0.1:5432/phantomlab?schema=public"

TELEGRAM_BOT_TOKEN="123456:ABC-DEF_il_tuo_token"
TELEGRAM_BOT_USERNAME="phantomlab_bot"
TELEGRAM_ADMIN_CHAT_ID="IL_TUO_TELEGRAM_ID"
TELEGRAM_WEBHOOK_SECRET="il_segreto_hex_generato_sopra"
ADMIN_TELEGRAM_IDS="IL_TUO_TELEGRAM_ID"

AUTH_SECRET="il_segreto_base64_generato_sopra"
ALLOW_DEV_LOGIN="false"

SITO_CHIUSO="true"
SITO_PASSWORD="LA_PASSWORD_PER_ENTRARE"

NODE_ENV="production"
PORT="3000"
```

Salva con `Ctrl+O`, `Invio`, poi `Ctrl+X`.

### Proteggi il file

```bash
chmod 600 .env
```

> **Importante:**
> - `ALLOW_DEV_LOGIN` deve restare `"false"`: con `"true"` chiunque potrebbe accedere senza Telegram.
> - `SITO_CHIUSO="true"` è ciò che tiene il sito chiuso al pubblico.
> - Per conoscere il tuo Telegram ID scrivi a [@userinfobot](https://t.me/userinfobot).

### Verifica la configurazione

Prima di procedere, un controllo automatico segnala valori mancanti o sospetti:

```bash
cd /var/www/phantomlab
npm run verifica-env
```

**Output atteso:** `Configurazione valida.`

Se qualcosa non va, lo script indica quale variabile correggere e perché. Sistemala e riesegui prima di continuare.

---

## 8. Build e primo avvio

### Applica le migrazioni

```bash
cd /var/www/phantomlab
npx prisma migrate deploy
npx prisma generate
```

### Popola i contenuti iniziali

```bash
npm run seed
```

### Compila

```bash
npm run build
```

> Se la build viene interrotta per memoria insufficiente, crea uno swap file:
> ```bash
> sudo fallocate -l 2G /swapfile
> sudo chmod 600 /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

### Copia gli asset nella build standalone

Next.js in modalità `standalone` **non** include `static/` e `public/`: vanno copiati.

```bash
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/ 2>/dev/null || true
```

### Avvia con PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

L'ultimo comando stampa una riga che inizia con `sudo env PATH=...`: **copiala ed eseguila**, serve ad avviare l'app al riavvio del server.

### Verifica che risponda

```bash
curl -I http://127.0.0.1:3000
pm2 status
pm2 logs phantomlab --lines 30
```

Attesa: `HTTP/1.1 200 OK`.

---

## 9. Nginx e HTTPS

### Configurazione temporanea (solo HTTP)

Serve per far validare il dominio a Certbot.

```bash
sudo nano /etc/nginx/sites-available/phantom-lab.eu
```

Incolla:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name phantom-lab.eu www.phantom-lab.eu;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Attiva il sito e rimuovi quello di default:

```bash
sudo mkdir -p /var/www/certbot
sudo ln -s /etc/nginx/sites-available/phantom-lab.eu /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Verifica dall'esterno: `http://phantom-lab.eu` deve mostrare la pagina di attesa.

### Certificato HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d phantom-lab.eu -d www.phantom-lab.eu
```

Rispondi alle domande:
- **Email**: la tua, per gli avvisi di scadenza.
- **Termini**: `Y`.
- **Redirect HTTP → HTTPS**: scegli **2 (Redirect)**.

### Configurazione definitiva

Ora sostituisci con la configurazione completa del repository:

```bash
sudo cp /var/www/phantomlab/deploy/nginx.conf /etc/nginx/sites-available/phantom-lab.eu
sudo nginx -t
sudo systemctl reload nginx
```

### Verifica il rinnovo automatico

```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

---

## 10. Bot Telegram

### Registra il webhook

Sostituisci i valori con i tuoi:

```bash
curl -F "url=https://phantom-lab.eu/api/telegram/webhook" \
     -F "secret_token=IL_TUO_TELEGRAM_WEBHOOK_SECRET" \
     "https://api.telegram.org/botIL_TUO_TOKEN/setWebhook"
```

Attesa: `{"ok":true,"result":true,"description":"Webhook was set"}`.

### Verifica lo stato

```bash
curl "https://api.telegram.org/botIL_TUO_TOKEN/getWebhookInfo"
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

Elenco di controllo:

```bash
# 1. Il sito risponde in HTTPS
curl -I https://phantom-lab.eu

# 2. I visitatori vedono la pagina di attesa
curl -s https://phantom-lab.eu | grep -o "In preparazione"

# 3. Le API sono chiuse (atteso: 503)
curl -s -o /dev/null -w "%{http_code}\n" https://phantom-lab.eu/api/notifiche

# 4. Il webhook è raggiungibile (atteso: 401 senza il segreto corretto)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://phantom-lab.eu/api/telegram/webhook

# 5. L'app è attiva e stabile
pm2 status

# 6. Nessun errore recente
pm2 logs phantomlab --lines 50 --nostream
```

Verifica anche dal browser:
- `https://phantom-lab.eu` → pagina di attesa con lucchetto valido
- `https://www.phantom-lab.eu` → reindirizza al dominio senza www
- `http://phantom-lab.eu` → reindirizza a HTTPS

---

## 12. Accesso a sito chiuso

Con `SITO_CHIUSO="true"` chiunque visiti il sito vede la pagina di attesa.

**Per entrare:**

1. Apri `https://phantom-lab.eu`
2. Fai **doppio clic sul quadrato verde con la P** in alto a sinistra
3. Compare un campo password: inserisci il valore di `SITO_PASSWORD`
4. Premi **Entra**

Il cookie di sblocco dura **30 giorni** e vale solo per quel browser. Chi non conosce la password continua a vedere la pagina di attesa: non c'è alcuna etichetta che segnali il campo nascosto.

### Aprire il sito al pubblico

Quando è il momento del lancio:

```bash
cd /var/www/phantomlab
nano .env          # imposta SITO_CHIUSO="false"
pm2 reload phantomlab --update-env
```

> `--update-env` è indispensabile: senza, PM2 riavvia il processo mantenendo le vecchie variabili.

### Richiudere il sito

Stessa procedura con `SITO_CHIUSO="true"`.

### Uscire dalla modalità riservata su un dispositivo

```bash
curl -X DELETE https://phantom-lab.eu/api/gate
```

---

## 13. Aggiornamenti

Lo script fa tutto: scarica, installa, migra, compila e riavvia.

```bash
cd /var/www/phantomlab
bash deploy/aggiorna.sh
```

Se preferisci procedere a mano:

```bash
cd /var/www/phantomlab
git pull
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/ 2>/dev/null || true
pm2 reload phantomlab --update-env
```

---

## 14. Backup

### Backup automatico giornaliero

Rendi eseguibile lo script e programmalo:

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

Aggiungi il job:

```bash
crontab -e
```

Inserisci:

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

> I backup restano sul VPS: se il server si guasta, li perdi. Copiali periodicamente altrove (`scp`, rsync su altro host, storage esterno).

---

## 15. Risoluzione problemi

### Il sito non risponde (502 Bad Gateway)

```bash
pm2 status
pm2 logs phantomlab --lines 50
curl -I http://127.0.0.1:3000
```

Se l'app è ferma, quasi sempre è un problema di variabili d'ambiente o database. Riavvia con:

```bash
pm2 restart phantomlab --update-env
```

### La pagina si vede senza stile

Gli asset non sono stati copiati nella build standalone:

```bash
cd /var/www/phantomlab
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/ 2>/dev/null || true
pm2 restart phantomlab
```

### Errore di connessione al database

```bash
sudo systemctl status postgresql
psql "$(grep DATABASE_URL /var/www/phantomlab/.env | cut -d'"' -f2)" -c "SELECT 1;"
```

Se la password contiene caratteri speciali (`@`, `:`, `/`, `#`), va codificata nell'URL: `@` diventa `%40`, `#` diventa `%23`.

### Certbot non riesce a validare il dominio

```bash
dig +short phantom-lab.eu     # deve dare l'IP del VPS
sudo ufw status               # 'Nginx Full' deve essere permesso
sudo nginx -t
```

Il DNS deve essere propagato **prima** di eseguire Certbot.

### Il bot non invia notifiche

```bash
curl "https://api.telegram.org/botIL_TUO_TOKEN/getWebhookInfo"
```

Controlla `last_error_message`. Cause frequenti: `TELEGRAM_WEBHOOK_SECRET` diverso da quello registrato, oppure certificato HTTPS non valido.

### Le modifiche al `.env` non hanno effetto

PM2 conserva l'ambiente del primo avvio:

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
| Stato applicazione | `pm2 status` |
| Log in tempo reale | `pm2 logs phantomlab` |
| Riavvio | `pm2 reload phantomlab --update-env` |
| Aggiornamento | `bash deploy/aggiorna.sh` |
| Backup manuale | `bash deploy/backup.sh` |
| Ricarica Nginx | `sudo nginx -t && sudo systemctl reload nginx` |
| Log Nginx | `sudo tail -f /var/log/nginx/phantomlab.error.log` |
| Apri il sito al pubblico | `SITO_CHIUSO="false"` + `pm2 reload phantomlab --update-env` |
