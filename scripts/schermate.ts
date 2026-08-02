import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

/**
 * Cattura le schermate delle pagine utente su un dispositivo mobile.
 *
 * L'accesso al sito avviene solo via Telegram: non esiste una password da
 * automatizzare. Il cookie di sessione va quindi fornito da fuori, preso
 * da un browser dove si è già collegati (vedi docs/SCHERMATE.md).
 *
 * Uso:
 *   SESSIONE="<cookie>" npx tsx scripts/schermate.ts
 *
 * Nota: se `SESSIONE` non è fornita, lo script cattura solo le pagine
 * pubbliche. Le pagine che richiedono login (es. `area-personale`) verranno
 * saltate automaticamente. Le pagine `admin` sono escluse.
 */

const SITO = process.env.SITO_URL ?? "https://phantom-lab.eu";
const CARTELLA = process.env.CARTELLA_USCITA ?? "schermate";

/** Timeout per la navigazione (ms). Sovrascrivibile con TIMEOUT. */
const TIMEOUT = Number(process.env.TIMEOUT ?? 60_000);

/**
 * iPhone 15 Pro: 393×852 a 3x. È il profilo dei modelli Pro recenti, che
 * condividono la stessa area utile. Sovrascrivibile se serve un altro
 * formato — la larghezza logica è ciò che conta per l'impaginazione.
 */
/** Impostazione di default orientata a Instagram Stories: 1080×1920 */
const LARGHEZZA = Number(process.env.LARGHEZZA ?? 360);
const ALTEZZA = Number(process.env.ALTEZZA ?? 640);
const SCALA = Number(process.env.SCALA ?? 3);

/** Pagine da catturare: percorso, nome del file, descrizione. */
/** Costruisce l'elenco di pagine a partire dalle route in `src/app/(sito)`.
 * Esclude la cartella `admin`.
 */
function scopriPagine() {
  const sitoDir = path.join(process.cwd(), "src", "app", "(sito)");
  const pagine: { url: string; nome: string; titolo: string }[] = [];

  // Sempre includere la home come prima voce.
  pagine.push({ url: "/", nome: "01-home", titolo: "Home" });

  let indice = 2;
  try {
    const entries = fs.readdirSync(sitoDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name === "admin") continue; // escludi admin

      const pageFile = path.join(sitoDir, ent.name, "page.tsx");
      if (!fs.existsSync(pageFile)) continue;

      const url = `/${ent.name}`;
      const nome = `${String(indice).padStart(2, "0")}-${ent.name}`;
      const titolo = ent.name.replace(/-/g, " ");
      pagine.push({ url, nome, titolo });
      indice += 1;
    }
  } catch (e) {
    // In caso di errore, ritorna le pagine di default minime.
    return pagine;
  }

  return pagine;
}

// SESSIONE è opzionale: senza, lo script cattura solo le pagine pubbliche.
// Se serve una sessione per alcune pagine (es. `area-personale`), verranno
// saltate se `SESSIONE` non è fornita.
function leggiSessione() {
  return process.env.SESSIONE ?? undefined;
}

async function main() {
  const sessione = leggiSessione();
  const dominio = new URL(SITO).hostname;
  const PAGINE = scopriPagine();

  fs.mkdirSync(CARTELLA, { recursive: true });

  const browser = await chromium.launch();
  const contesto = await browser.newContext({
    ...devices["iPhone 15 Pro"],
    viewport: { width: LARGHEZZA, height: ALTEZZA },
    deviceScaleFactor: SCALA,
    // Il fuso cambia le date relative ("ieri", "3 ore fa") mostrate nelle
    // schermate: fissarlo rende le catture riproducibili.
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });

  const cookie: any[] = [];
  if (sessione) {
    cookie.push({
      name: "phantomlab_sessione",
      value: sessione,
      domain: dominio,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    });
  }

  // Con SITO_CHIUSO="true" ogni pagina mostra la schermata di attesa:
  // serve anche il cookie del gate, altrimenti si catturano sei volte
  // la stessa pagina di manutenzione.
  if (process.env.ACCESSO) {
    cookie.push({
      name: "phantomlab_accesso",
      value: process.env.ACCESSO,
      domain: dominio,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    });
  }

  if (cookie.length > 0) await contesto.addCookies(cookie);

  const pagina = await contesto.newPage();
  let catturate = 0;

  for (const voce of PAGINE) {
    const indirizzo = `${SITO}${voce.url}`;
    process.stdout.write(`  ${voce.titolo} … `);

    // Se la pagina è area-personale e non abbiamo sessione, la saltiamo.
    if (voce.url === "/area-personale" && !sessione) {
      console.log("skip (sessione mancante)");
      continue;
    }

    try {
      await pagina.goto(indirizzo, {
        waitUntil: "networkidle",
        timeout: TIMEOUT,
      });

      // Le animazioni d'ingresso partono allo scroll: senza scorrere fino
      // in fondo, metà pagina resta trasparente nella cattura.
      //
      // Il corpo è una stringa e non una funzione: tsx compila le funzioni
      // aggiungendo un helper __name che nel browser non esiste, e
      // page.evaluate fallirebbe con "__name is not defined".
      await pagina.evaluate(`
        new Promise(function (risolvi) {
          var posizione = 0;
          function passo() {
            window.scrollBy(0, window.innerHeight);
            posizione += window.innerHeight;
            if (posizione < document.body.scrollHeight) {
              setTimeout(passo, 120);
            } else {
              window.scrollTo(0, 0);
              setTimeout(risolvi, 400);
            }
          }
          passo();
        })
      `);

      // Ferma i cicli continui (cursore, nastro, puntini): senza, ogni
      // esecuzione produce un fotogramma diverso.
      await pagina.addStyleTag({
        content:
          "*, *::before, *::after { animation-play-state: paused !important; }",
      });

      // Verifica di essere davvero collegati: la pagina dell'area personale
      // senza sessione mostra il modulo d'accesso, e la cattura sarebbe
      // silenziosamente sbagliata.
      if (voce.url === "/area-personale") {
        const accesso = await pagina
          .getByText("Accedi al tuo account")
          .count()
          .catch(() => 0);
        if (accesso > 0) {
          console.log("SESSIONE NON VALIDA");
          console.error(
            "\nIl cookie non è stato accettato: l'area personale mostra\n" +
              "ancora il modulo d'accesso. Rigenera il valore seguendo\n" +
              "docs/SCHERMATE.md.\n",
          );
          await browser.close();
          process.exit(1);
        }
      }

      await pagina.screenshot({
        path: path.join(CARTELLA, `${voce.nome}.png`),
        fullPage: true,
      });

      // Anche la sola prima schermata: è quella che si usa negli store e
      // nelle presentazioni, dove la pagina intera sarebbe illeggibile.
      await pagina.screenshot({
        path: path.join(CARTELLA, `${voce.nome}-primo-schermo.png`),
        fullPage: false,
      });

      catturate += 1;
      console.log("ok");
    } catch (errore) {
      console.log("errore");
      console.error(`    Errore catturando ${indirizzo}: ${(errore as Error).message}`);
      if ((errore as any).stack) console.error((errore as any).stack);
    }
  }

  await browser.close();

  console.log(
    `\n${catturate}/${PAGINE.length} pagine catturate in ${path.resolve(CARTELLA)}`,
  );
  console.log(`Formato: ${LARGHEZZA}×${ALTEZZA} @${SCALA}x\n`);
}

main().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
