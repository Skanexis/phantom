#!/usr/bin/env bash
# Installa e configura CrowdSec per phantom-lab.eu.
#
# Cosa aggiunge rispetto a quello che c'è già. Il perimetro
# dell'applicazione sa riconoscere chi abusa, ma per farlo deve prima
# ricevere la richiesta: uno scanner che insiste costa un passaggio completo
# dentro Node a ogni colpo, anche quando il verdetto è già "no". CrowdSec
# legge i log di Nginx, decide, e fa cadere il pacchetto nel kernel — dal
# secondo colpo in poi quel traffico non costa più niente a nessuno.
#
# In più porta un elenco condiviso: gli indirizzi già segnalati da altri
# vengono bloccati prima ancora di provarci qui. È la differenza principale
# rispetto a fail2ban, che sa solo quello che ha visto in casa.
#
# Uso:  sudo bash deploy/crowdsec.sh <IL_TUO_IP> [altro_ip ...]
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui con sudo:  sudo bash deploy/crowdsec.sh <IL_TUO_IP>" >&2
  exit 1
fi

# --- 0. Gli indirizzi da non bloccare mai ---------------------------------
#
# Obbligatori, e lo script si rifiuta di partire senza. È la stessa trappola
# da cui difendono la valvola della quarantena e lo scavalco dello staff sui
# bandi di rete (vedi src/middleware.ts): chiudersi fuori dal proprio
# pannello lasciando le chiavi dentro. Qui sarebbe peggio, perché il blocco
# è nel firewall e non lo si toglie da una pagina web — servirebbe la
# console del provider.
if [ "$#" -eq 0 ]; then
  echo "ERRORE: manca l'indirizzo da mettere in lista bianca." >&2
  echo >&2
  echo "CrowdSec blocca nel firewall: un errore di configurazione, o un tuo" >&2
  echo "test un po' insistente, ti chiuderebbero fuori dal server senza" >&2
  echo "modo di rientrare se non dalla console del provider." >&2
  echo >&2
  echo "Scopri il tuo indirizzo e rilancia:" >&2
  echo "  curl -s https://ifconfig.me" >&2
  echo "  sudo bash deploy/crowdsec.sh 203.0.113.7" >&2
  exit 1
fi

INDIRIZZI=("$@")

for indirizzo in "${INDIRIZZI[@]}"; do
  if ! printf '%s' "$indirizzo" | grep -Eq '^[0-9a-fA-F:.]+(/[0-9]{1,3})?$'; then
    echo "ERRORE: '$indirizzo' non sembra un indirizzo IP o una rete CIDR." >&2
    exit 1
  fi
done

# --- 1. Memoria disponibile ------------------------------------------------
echo "==> [1/7] Controllo la memoria"

LIBERA_MB="$(free -m | awk '/^Mem:/{print $7}')"
if [ -n "$LIBERA_MB" ] && [ "$LIBERA_MB" -lt 250 ]; then
  echo "ATTENZIONE: solo ${LIBERA_MB} MB disponibili." >&2
  echo "L'agente CrowdSec ne occupa fra 80 e 150, e su questa macchina ci" >&2
  echo "sono già Node (fino a 1 GB per il tetto PM2) e PostgreSQL." >&2
  read -r -p "Proseguo comunque? [s/N] " risposta
  [ "$risposta" = "s" ] || exit 1
else
  echo "    ${LIBERA_MB:-?} MB disponibili."
fi

# --- 2. Pacchetti ----------------------------------------------------------
echo "==> [2/7] Installo agente e bouncer"

if ! command -v cscli > /dev/null 2>&1; then
  curl -s https://install.crowdsec.net | bash
  apt install -y crowdsec
else
  echo "    Agente già presente."
fi

# Il bouncer nftables e non quello per Nginx: qui l'obiettivo è che il
# pacchetto non arrivi nemmeno al proxy. Convive con ufw, che su Ubuntu usa
# lo stesso backend nft ma una tabella propria.
if ! dpkg -s crowdsec-firewall-bouncer-nftables > /dev/null 2>&1; then
  apt install -y crowdsec-firewall-bouncer-nftables
else
  echo "    Bouncer già presente."
fi

# --- 3. Collezioni ---------------------------------------------------------
echo "==> [3/7] Installo le collezioni"

for collezione in \
  crowdsecurity/nginx \
  crowdsecurity/base-http-scenarios \
  crowdsecurity/http-cve \
  crowdsecurity/whitelists; do
  if cscli collections list -o json | grep -q "\"$collezione\""; then
    echo "    $collezione già installata."
  else
    cscli collections install "$collezione"
  fi
done

# --- 4. Da quali log leggere ----------------------------------------------
echo "==> [4/7] Configuro la lettura dei log"

# I nostri log e non quelli generici di Nginx: il sito ne ha di propri (vedi
# access_log in deploy/nginx.conf), e puntare CrowdSec altrove significa
# leggere un file che resta vuoto — un'installazione che sembra funzionare e
# non vede niente.
cat > /etc/crowdsec/acquis.d/phantomlab.yaml <<'YAML'
filenames:
  - /var/log/nginx/phantomlab.access.log
  - /var/log/nginx/phantomlab.error.log
  # Il webhook ha un log suo: le consegne di Telegram arrivano a raffica
  # quando il bot recupera un arretrato, ed è esattamente la forma che uno
  # scenario di frequenza scambierebbe per un attacco.
labels:
  type: nginx
YAML
echo "    /etc/crowdsec/acquis.d/phantomlab.yaml"

# --- 5. Lista bianca -------------------------------------------------------
echo "==> [5/7] Scrivo la lista bianca"

{
  echo "name: phantomlab/lista-bianca"
  echo "description: Indirizzi che non vanno mai bloccati: chi amministra il server."
  echo "whitelist:"
  echo "  reason: amministrazione phantom-lab.eu"
  echo "  ip:"
  for indirizzo in "${INDIRIZZI[@]}"; do
    case "$indirizzo" in
      */*) : ;;
      *) echo "    - \"$indirizzo\"" ;;
    esac
  done
  echo "  cidr:"
  echo "    - \"127.0.0.1/32\""
  echo "    - \"::1/128\""
  for indirizzo in "${INDIRIZZI[@]}"; do
    case "$indirizzo" in
      */*) echo "    - \"$indirizzo\"" ;;
      *) : ;;
    esac
  done
} > /etc/crowdsec/parsers/s02-enrich/phantomlab-whitelist.yaml

echo "    Protetti: ${INDIRIZZI[*]} (più loopback)"

# --- 6. Chiave per il pannello --------------------------------------------
echo "==> [6/7] Registro il lettore per il pannello"

# Il pannello dell'applicazione legge le decisioni per mostrarle e per
# avvisare su Telegram: senza, i blocchi sarebbero invisibili ovunque tranne
# che da riga di comando — il pacchetto muore nel kernel e non lascia
# traccia né nei log di Nginx né nell'archivio.
if cscli bouncers list -o json | grep -q '"phantomlab-pannello"'; then
  echo "    Lettore già registrato."
  echo "    Se hai perso la chiave: cscli bouncers delete phantomlab-pannello"
  echo "    e rilancia questo script."
  CHIAVE=""
else
  CHIAVE="$(cscli bouncers add phantomlab-pannello -o raw)"
fi

# --- 7. Avvio --------------------------------------------------------------
echo "==> [7/7] Riavvio i servizi"

systemctl enable --now crowdsec
systemctl restart crowdsec
systemctl enable --now crowdsec-firewall-bouncer
systemctl restart crowdsec-firewall-bouncer

sleep 3

if ! systemctl is-active --quiet crowdsec; then
  echo "ERRORE: l'agente non è partito." >&2
  echo "  sudo journalctl -u crowdsec -n 40 --no-pager" >&2
  exit 1
fi

if ! systemctl is-active --quiet crowdsec-firewall-bouncer; then
  echo "ERRORE: il bouncer non è partito." >&2
  echo "  sudo journalctl -u crowdsec-firewall-bouncer -n 40 --no-pager" >&2
  exit 1
fi

echo
echo "============================================================"
echo " CrowdSec attivo."
echo
if [ -n "$CHIAVE" ]; then
  echo " Aggiungi questa riga al .env dell'applicazione e riavviala:"
  echo
  echo "   CROWDSEC_API_KEY=\"$CHIAVE\""
  echo
  echo "   cd /var/www/phantomlab && nano .env"
  echo "   pm2 reload phantomlab --update-env"
  echo
fi
echo " Verifiche:"
echo "   cscli metrics                 # sta leggendo i log?"
echo "   cscli decisions list          # chi è bloccato adesso"
echo "   cscli capi status             # elenco condiviso collegato"
echo "   cscli alerts list             # cosa ha visto"
echo
echo " PRIMA di chiudere questa sessione SSH, verifica di poter ancora"
echo " raggiungere il sito e il pannello: se qualcosa è andato storto"
echo " nella lista bianca, questa è l'ultima occasione per accorgertene"
echo " con una via di rientro ancora aperta."
echo "============================================================"
