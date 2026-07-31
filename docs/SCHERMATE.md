# Schermate automatiche

Cattura le pagine utente su formato telefono, con dati reali e senza
creare account finti in produzione.

---

## Perché serve un cookie

Il sito non ha password: l'accesso avviene solo tramite Telegram, con un
token monouso. Non c'è nulla da automatizzare in un modulo di login.

La sessione va quindi presa da un browser dove sei **già collegato** e
passata allo script. Sono le tue schermate, con i tuoi dati.

> Il cookie è una sessione valida a tuo nome. Trattalo come una password:
> non incollarlo in chat, ticket o repository. Scade dopo 30 giorni.

---

## 1. Installa Playwright

Una volta sola:

```bash
npm install -D playwright
npx playwright install chromium
```

---

## 2. Copia il cookie di sessione

Da **desktop**, con Chrome o Edge:

1. Apri `https://phantom-lab.eu` e accedi normalmente via Telegram.
2. `F12` → scheda **Application** (o *Applicazione*).
3. A sinistra: **Storage → Cookies → https://phantom-lab.eu**.
4. Trova la riga `phantomlab_sessione` e copia il campo **Value**.

È una stringa lunga che inizia con `eyJ`.

Da **Firefox**: `F12` → **Archiviazione** → **Cookie**.

---

## 3. Se il sito è in modalità riservata

Con `SITO_CHIUSO="true"` ogni pagina mostra la schermata di attesa. Serve
anche il secondo cookie, `phantomlab_accesso`, copiato allo stesso modo.
Senza, cattureresti sei volte la pagina di manutenzione.

---

## 4. Esegui

```bash
SESSIONE="eyJhbG…" npx tsx scripts/schermate.ts
```

Con il gate attivo:

```bash
SESSIONE="eyJhbG…" ACCESSO="eyJhbG…" npx tsx scripts/schermate.ts
```

Su PowerShell:

```powershell
$env:SESSIONE = "eyJhbG…"
npx tsx scripts/schermate.ts
```

---

## Risultato

Nella cartella `schermate/`, per ogni pagina due file:

| File | Contenuto |
|---|---|
| `06-area-personale.png` | pagina intera, dall'alto in fondo |
| `06-area-personale-primo-schermo.png` | solo la prima schermata |

Pagine catturate: home, servizi, abbonamenti, FAQ, modulo richiesta,
area personale.

---

## Formato

Predefinito **393×852 a 3x** — il profilo dei modelli iPhone Pro recenti,
che condividono la stessa area utile. I PNG escono a 1179×2556 pixel.

Per un formato diverso:

```bash
LARGHEZZA=430 ALTEZZA=932 SESSIONE="…" npx tsx scripts/schermate.ts
```

La **larghezza logica** è ciò che determina l'impaginazione: 393 e 430
sono i due valori che contano per verificare il responsive.

---

## Note

- **Fuso orario fissato** a `Europe/Rome`: le date relative ("ieri",
  "3 ore fa") sarebbero altrimenti diverse a ogni esecuzione.
- **Animazioni congelate** prima dello scatto, dopo aver scorso l'intera
  pagina: le rivelazioni allo scroll partono solo quando l'elemento entra
  in vista, e senza scorrere metà pagina resterebbe trasparente.
- **Controllo della sessione**: se l'area personale mostra ancora il
  modulo d'accesso, lo script si ferma con un errore invece di salvare
  una cattura sbagliata.
- `schermate/` è escluso da Git: le immagini contengono i tuoi dati.

---

## Contro un ambiente locale

```bash
SITO_URL="http://localhost:3000" SESSIONE="…" npx tsx scripts/schermate.ts
```

Il cookie va preso dal browser puntato su `localhost`, non da produzione:
la firma è la stessa solo se `AUTH_SECRET` coincide.
