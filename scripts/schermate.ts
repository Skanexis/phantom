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
 */

const SITO = process.env.SITO_URL ?? "https://phantom-lab.eu";
const CARTELLA = process.env.CARTELLA_USCITA ?? "schermate";

/**
 * iPhone 15 Pro: 393×852 a 3x. È il profilo dei modelli Pro recenti, che
 * condividono la stessa area utile. Sovrascrivibile se serve un altro
 * formato — la larghezza logica è ciò che conta per l'impaginazione.
 */
const LARGHEZZA = Number(process.env.LARGHEZZA ?? 393);
const ALTEZZA = Number(process.env.ALTEZZA ?? 852);
const SCALA = Number(process.env.SCALA ?? 3);

/** Pagine da catturare: percorso, nome del file, descrizione. */
const PAGINE = [
  { url: "/", nome: "01-home", titolo: "Home" },
  { url: "/#servizi", nome: "02-servizi", titolo: "Servizi" },
  { url: "/#abbonamenti", nome: "03-abbonamenti", titolo: "Abbonamenti" },
  { url: "/#faq", nome: "04-faq", titolo: "FAQ" },
  { url: "/richiesta", nome: "05-richiesta", titolo: "Nuova richiesta" },
  {
    url: "/area-personale",
    nome: "06-area-personale",
    titolo: "Area personale",
  },
];

function pretendiCookie() {
  const sessione = process.env.SESSIONE;
  if (!sessione) {
    console.error(
      "\nManca SESSIONE.\n\n" +
        "Il sito non ha password: la sessione va presa da un browser già\n" +
        "collegato. Istruzioni in docs/SCHERMATE.md.\n\n" +
        'Esempio: SESSIONE="eyJhbG..." npx tsx scripts/schermate.ts\n',
    );
    process.exit(1);
  }
  return sessione;
}

async function main() {
  const sessione = pretendiCookie();
  const dominio = new URL(SITO).hostname;

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

  const cookie = [
    {
      name: "phantomlab_sessione",
      value: sessione,
      domain: dominio,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    },
  ];

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

  await contesto.addCookies(cookie);

  const pagina = await contesto.newPage();
  let catturate = 0;

  for (const voce of PAGINE) {
    const indirizzo = `${SITO}${voce.url}`;
    process.stdout.write(`  ${voce.titolo} … `);

    try {
      await pagina.goto(indirizzo, {
        waitUntil: "networkidle",
        timeout: 30_000,
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
      console.error(`    ${(errore as Error).message}`);
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
