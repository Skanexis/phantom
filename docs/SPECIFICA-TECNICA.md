# Specifica Tecnica

## Progetto

**Phantom Lab** — piattaforma per la vendita di servizi IT e abbonamenti mensili, accessibile tramite Telegram Mini App.

---

## 1. Concetto generale

È necessario sviluppare un sito moderno per l'azienda **Phantom Lab**, che si occupa di:

- sviluppo di siti web;
- sviluppo di applicazioni mobili e web;
- automazione dei processi aziendali;
- sviluppo di bot Telegram;
- altri servizi IT.

La modalità principale di interazione degli utenti con la piattaforma è la **Telegram Mini App**.

---

## 2. Homepage

La homepage deve contenere:

- una breve descrizione dell'azienda;
- l'elenco dei servizi offerti;
- i vantaggi di lavorare con Phantom Lab;
- il blocco degli abbonamenti mensili;
- il blocco dello sviluppo su misura;
- una sezione con le domande frequenti (FAQ);
- contatti e canali di comunicazione.

---

## 3. Abbonamenti

Sul sito l'utente può sottoscrivere uno dei quattro abbonamenti mensili.

### Abbonamento n. 1 — Bot Telegram

Include:

- bot Telegram;
- vetrina di prodotti o servizi;
- menu;
- sistema **Clean Chat**;
- verifica obbligatoria degli utenti prima dell'accesso al catalogo;
- gestione tramite pannello amministrativo.

### Abbonamento n. 2 — Catalogo (livello base)

Le funzionalità sono definite tramite il pannello amministrativo.

Il prezzo e l'insieme delle funzionalità devono essere completamente modificabili dall'amministratore.

### Abbonamento n. 3 — Catalogo (livello avanzato)

Le funzionalità si differenziano dal piano precedente.

Tutte le funzionalità, i limiti e il prezzo sono configurabili tramite il pannello amministrativo.

### Abbonamento n. 4 — Catalogo (livello massimo)

Insieme massimo di funzionalità.

Anche tutti i parametri sono interamente gestiti tramite il pannello amministrativo.

---

## 4. Gestione degli abbonamenti

L'amministratore deve poter, senza modificare il codice:

- modificare il prezzo di qualsiasi abbonamento;
- modificare il nome dell'abbonamento;
- modificare la descrizione;
- aggiungere nuove funzionalità;
- disattivare funzionalità esistenti;
- modificare l'ordine di visualizzazione degli abbonamenti.

---

## 5. Sviluppo su misura

L'utente può richiedere uno sviluppo personalizzato.

Dopo la selezione del servizio si apre il modulo di richiesta.

È necessario scegliere l'ambito di sviluppo:

- Sito web;
- Applicazione;
- Automazione dei processi.

Al termine della compilazione del modulo:

- la richiesta viene inviata all'amministratore;
- l'utente riceve una notifica nel bot Telegram che conferma il corretto invio e la presa in carico della richiesta.

---

## 6. Telegram Mini App

Poiché gli utenti accedono alla piattaforma tramite Telegram Mini App, è necessario garantire:

- autenticazione tramite Telegram;
- acquisizione del Telegram ID dell'utente;
- corretto adattamento dell'interfaccia alla Mini App;
- supporto dei temi chiaro e scuro di Telegram (se necessario);
- caricamento rapido dell'interfaccia.

---

## 7. Bot Telegram

Il bot deve garantire:

- notifica all'utente del corretto invio della richiesta;
- notifiche sullo stato dell'ordine (se necessario);
- interazione con il sistema degli abbonamenti;
- possibilità di ulteriore estensione delle funzionalità.

---

## 8. Pannello amministrativo

È necessario sviluppare un pannello amministrativo completo.

L'amministratore deve poter:

### 8.1 Gestione degli abbonamenti

- modificare il prezzo;
- modificare la descrizione;
- modificare l'elenco delle funzionalità;
- attivare e disattivare gli abbonamenti;
- modificare l'ordine di visualizzazione.

### 8.2 Gestione delle richieste

- visualizzare tutte le richieste;
- modificare lo stato;
- visualizzare le informazioni sull'utente;
- visualizzare il servizio selezionato;
- visualizzare i commenti del cliente.

### 8.3 Gestione del sito

- modificare i testi;
- modificare le informazioni della homepage;
- gestire i vantaggi dell'azienda;
- modificare le informazioni di contatto;
- gestire le FAQ.

---

## 9. Area personale dell'utente

L'utente deve poter:

- consultare l'abbonamento attivo;
- vedere lo storico delle proprie richieste;
- monitorare lo stato degli ordini;
- ricevere notifiche.

---

## 10. Sicurezza

È necessario garantire:

- autenticazione protetta;
- protezione del pannello amministrativo;
- protezione da accessi non autorizzati;
- conservazione sicura dei dati degli utenti;
- protezione delle API.

---

## 11. Prestazioni

Il sito deve:

- caricarsi rapidamente;
- funzionare correttamente su dispositivi mobili;
- essere ottimizzato per la Telegram Mini App;
- garantire un'interfaccia fluida.

---

## 12. Design

Il design deve essere realizzato al massimo livello contemporaneo e trasmettere la sensazione di un prodotto IT premium.

L'interfaccia deve apparire tecnologica, di alto valore e memorabile, con animazioni fluide, transizioni curate ed elementi interattivi. Particolare attenzione va dedicata all'esperienza utente su dispositivi mobili, poiché lo scenario d'uso principale è tramite Telegram Mini App. Tutti gli elementi devono essere adattivi, funzionare in modo fluido e garantire una navigazione comoda anche su schermi di piccole dimensioni.

Non vengono imposti parametri stilistici, colori o vincoli visivi specifici: il designer propone autonomamente una soluzione moderna di livello adeguato.

---

## 13. Requisiti di sviluppo

- Layout responsive.
- Ottimizzazione completa per dispositivi mobili.
- Corretto funzionamento nella Telegram Mini App.
- Architettura scalabile del progetto.
- Possibilità di aggiungere nuovi abbonamenti e servizi senza rifare il sistema.
- Codice pulito, strutturato e documentato.
- Stack tecnologico moderno.
- Elevata velocità dell'interfaccia e del lato server.

---

## 14. Note

Su richiesta, questa specifica può essere integrata con l'architettura del progetto, la struttura del database, le API, i ruoli utente e l'elenco completo delle schermate (UI Flow), in modo da poter essere consegnata immediatamente al team di sviluppo.
