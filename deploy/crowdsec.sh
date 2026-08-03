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
echo "==> [1/8] Controllo la memoria"

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

# --- 2. Agente -------------------------------------------------------------
#
# L'agente PRIMA del bouncer, e in mezzo la lista bianca. L'ordine non è
# estetico: l'agente da solo osserva e decide, ma non blocca niente — a
# bloccare è il bouncer. Installandoli insieme si aprirebbe una finestra,
# breve ma reale, in cui il firewall applica decisioni prese senza che la
# lista bianca esista ancora. È esattamente il modo in cui ci si chiude
# fuori dal proprio server.
echo "==> [2/8] Installo l'agente"

if ! command -v cscli > /dev/null 2>&1; then
  curl -s https://install.crowdsec.net | bash
  apt install -y crowdsec
else
  echo "    Agente già presente."
fi

# --- 3. Lista bianca, prima che qualcosa possa bloccare -------------------
echo "==> [3/8] Scrivo la lista bianca"

mkdir -p /etc/crowdsec/parsers/s02-enrich

# Le virgolette attorno a description e reason non sono uno stile: in YAML
# uno scalare non quotato che contiene "due punti + spazio" viene letto come
# l'inizio di una mappa, e il file diventa illeggibile. Il guaio è che il
# danno non resta locale — un parser rotto in questa cartella fa fallire
# OGNI comando cscli e il test di configurazione all'avvio del servizio, con
# messaggi che parlano dell'hub e non del file appena scritto.
{
  echo "name: phantomlab/lista-bianca"
  echo "description: \"Indirizzi che non vanno mai bloccati: chi amministra il server\""
  echo "whitelist:"
  echo "  reason: \"amministrazione phantom-lab.eu\""
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

# Verifica subito, non fra cinque passi.
#
# Un file malformato qui dentro non dà un errore locale: rende illeggibile
# l'intera configurazione, quindi ogni `cscli` successivo fallisce
# lamentandosi dell'hub, e il servizio non parte per un test che nomina
# config.yaml. Si finisce a cercare il guasto ovunque tranne che nel file
# appena scritto. Controllarlo adesso costa un secondo e indica il colpevole.
if ! crowdsec -c /etc/crowdsec/config.yaml -t > /tmp/crowdsec-test.log 2>&1; then
  echo "ERRORE: la configurazione non è valida dopo la scrittura della" >&2
  echo "lista bianca. Quasi certamente il problema è in:" >&2
  echo "  /etc/crowdsec/parsers/s02-enrich/phantomlab-whitelist.yaml" >&2
  echo >&2
  sed -n '1,15p' /tmp/crowdsec-test.log >&2
  echo >&2
  echo "Rimuovi quel file e rilancia:" >&2
  echo "  sudo rm /etc/crowdsec/parsers/s02-enrich/phantomlab-whitelist.yaml" >&2
  exit 1
fi
echo "    Configurazione valida."

# --- 4. Bouncer ------------------------------------------------------------
echo "==> [4/8] Installo il bouncer"

# Il bouncer nftables e non quello per Nginx: qui l'obiettivo è che il
# pacchetto non arrivi nemmeno al proxy. Convive con ufw, che su Ubuntu usa
# lo stesso backend nft ma una tabella propria.
if ! dpkg -s crowdsec-firewall-bouncer-nftables > /dev/null 2>&1; then
  apt install -y crowdsec-firewall-bouncer-nftables
else
  echo "    Bouncer già presente."
fi

# --- 5. Collezioni e parser ------------------------------------------------
echo "==> [5/8] Installo collezioni e parser"

# Collezioni e parser sono due categorie diverse dell'hub, e vanno chieste
# con il comando giusto: `crowdsecurity/whitelists` è un parser, e chiederlo
# come collezione fa fallire il comando.
#
# Un elemento mancante non ferma lo script. L'hub è un servizio esterno che
# cambia nel tempo — un elemento rinominato o ritirato è normale — e con
# `set -e` un singolo `cscli install` fallito lascerebbe l'installazione a
# metà: servizi avviati, ma senza le regole di lettura dei log. Meglio un
# avviso e un'installazione completa che un'uscita pulita a metà strada.
# L'indice dell'hub va aggiornato prima di chiedergli qualcosa: su
# un'installazione vecchia di qualche settimana `install` fallisce su
# elementi che esistono benissimo.
cscli hub update > /dev/null 2>&1 || echo "    (indice hub non aggiornato)" >&2

installa_hub() {
  local tipo="$1" nome="$2"
  if cscli "$tipo" inspect "$nome" > /dev/null 2>&1; then
    echo "    $nome già presente."
  elif cscli "$tipo" install "$nome" > /dev/null 2>&1; then
    echo "    $nome installato."
  else
    echo "    ATTENZIONE: $nome non disponibile nell'hub, lo salto." >&2
  fi
}

installa_hub collections crowdsecurity/nginx
installa_hub collections crowdsecurity/base-http-scenarios
installa_hub collections crowdsecurity/http-cve

# Le liste bianche predefinite dell'hub: reti private, bot dei motori di
# ricerca. La nostra, scritta sopra, vale comunque a prescindere da questa.
installa_hub parsers crowdsecurity/whitelists

# --- 6. Da quali log leggere ----------------------------------------------
echo "==> [6/8] Configuro la lettura dei log"

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

# --- 7. Chiave per il pannello --------------------------------------------
echo "==> [7/8] Registro il lettore per il pannello"

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

# --- 8. Avvio --------------------------------------------------------------
echo "==> [8/8] Riavvio i servizi"

# L'agente per primo: deve aver già letto la lista bianca quando il bouncer
# comincia ad applicare le decisioni.
systemctl enable --now crowdsec
systemctl restart crowdsec
sleep 2

# Verifica che la lista bianca sia stata caricata davvero. Un errore di
# sintassi nel file la renderebbe inerte, e l'agente partirebbe lo stesso:
# ce ne accorgeremmo solo restando chiusi fuori.
if ! cscli parsers inspect phantomlab/lista-bianca > /dev/null 2>&1; then
  echo "ATTENZIONE: la lista bianca non risulta caricata." >&2
  echo "Controlla /etc/crowdsec/parsers/s02-enrich/phantomlab-whitelist.yaml" >&2
  echo "e i log: sudo journalctl -u crowdsec -n 40 --no-pager" >&2
  echo >&2
  read -r -p "Avvio comunque il bouncer? [s/N] " risposta
  [ "$risposta" = "s" ] || {
    echo "Bouncer non avviato: nulla viene bloccato. Correggi e rilancia." >&2
    exit 1
  }
fi

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
