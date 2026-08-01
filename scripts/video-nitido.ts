import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, devices } from "playwright";

/**
 * Video della pagina di attesa alla risoluzione vera del telefono.
 *
 * La registrazione integrata di Playwright compone il filmato ai pixel CSS
 * della finestra e non ridisegna a densità maggiore: il risultato va poi
 * ingrandito, senza guadagnare dettaglio. Gli screenshot invece rispettano
 * deviceScaleFactor, quindi qui i fotogrammi si catturano uno per uno a
 * densità 3 e si montano dopo.
 *
 * Il problema di catturare a mano è il tempo: uno screenshot richiede
 * molto più di 1/30 di secondo, e l'animazione nel frattempo correrebbe
 * avanti, dando un filmato accelerato e a scatti. La soluzione è togliere
 * al browser il tempo reale: con il "virtual time" del protocollo di
 * Chrome l'orologio della pagina avanza solo di quanto gli diciamo noi,
 * un fotogramma alla volta. Timer, animazioni e rAF seguono quel tempo.
 *
 * Uso: npx tsx scripts/video-nitido.ts
 */

const SITO = process.env.SITO_URL ?? "http://127.0.0.1:3099";
const CARTELLA = process.env.CARTELLA_USCITA ?? "video";
const SECONDI = Number(process.env.SECONDI ?? 15);
const FPS = Number(process.env.FPS ?? 30);

/** Pixel CSS: è la larghezza che decide l'impaginazione. */
const LARGHEZZA = Number(process.env.LARGHEZZA ?? 393);
const ALTEZZA = Number(process.env.ALTEZZA ?? 852);

/** Densità di disegno: 3 è quella dei modelli iPhone Pro. */
const DENSITA = Number(process.env.DENSITA ?? 3);

/** Secondi lasciati correre prima di iniziare, per il montaggio iniziale. */
const PREPARAZIONE = 2.2;

function ffmpegDisponibile() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!ffmpegDisponibile()) {
    console.error(
      "\nServe ffmpeg per montare i fotogrammi. Installalo e riprova.\n",
    );
    process.exit(1);
  }

  fs.mkdirSync(CARTELLA, { recursive: true });
  const temporanea = fs.mkdtempSync(path.join(os.tmpdir(), "phantom-video-"));

  const browser = await chromium.launch();
  const contesto = await browser.newContext({
    ...devices["iPhone 15 Pro"],
    viewport: { width: LARGHEZZA, height: ALTEZZA },
    deviceScaleFactor: DENSITA,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    // Il tema del sito è scuro salvo preferenza contraria, e Playwright
    // chiede "light" per difetto.
    colorScheme: "dark",
  });

  const pagina = await contesto.newPage();
  pagina.on("pageerror", (errore) =>
    console.error("Errore nella pagina:", errore.message.slice(0, 160)),
  );

  console.log(`  Apro ${SITO}`);
  await pagina.goto(SITO, { waitUntil: "networkidle", timeout: 30_000 });

  const titolo = await pagina.title();
  if (!/arrivo/i.test(titolo)) {
    console.error(
      `\nLa pagina servita è "${titolo}", non quella di attesa.\n` +
        'Avvia il server con SITO_CHIUSO="true".\n',
    );
    await browser.close();
    process.exit(1);
  }

  // Il marchio si campiona dai caratteri: prima che siano pronti la forma
  // sarebbe quella del carattere di ripiego.
  await pagina.evaluate("document.fonts.ready");

  const cdp = await contesto.newCDPSession(pagina);

  /**
   * Fa scorrere l'orologio della pagina di una quantità precisa e aspetta
   * che il browser abbia finito di elaborarla.
   */
  async function avanza(millisecondi: number) {
    const scaduto = new Promise<void>((risolvi) => {
      cdp.once("Emulation.virtualTimeBudgetExpired", () => risolvi());
    });
    await cdp.send("Emulation.setVirtualTimePolicy", {
      policy: "pauseIfNetworkFetchesPending",
      budget: millisecondi,
    });
    await scaduto;
  }

  console.log("  Passo al tempo controllato");
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

  // Montaggio iniziale del marchio, saltato nel filmato finale.
  await avanza(PREPARAZIONE * 1000);

  const totale = Math.round(SECONDI * FPS);
  const passo = 1000 / FPS;
  const meta = Math.floor(totale / 2);

  console.log(
    `  Catturo ${totale} fotogrammi a ${LARGHEZZA * DENSITA}×${ALTEZZA * DENSITA}…`,
  );

  const inizio = Date.now();

  for (let indice = 0; indice < totale; indice += 1) {
    // Il tocco a metà filmato mostra anche la reazione del marchio. Va
    // inviato fra un fotogramma e l'altro, non durante uno scatto.
    if (indice === meta) {
      await pagina.mouse.click(LARGHEZZA / 2, ALTEZZA * 0.3);
    }

    await pagina.screenshot({
      path: path.join(temporanea, `f-${String(indice).padStart(5, "0")}.png`),
      animations: "allow",
      caret: "hide",
    });

    await avanza(passo);

    if (indice > 0 && indice % 60 === 0) {
      const fatto = Math.round((indice / totale) * 100);
      process.stdout.write(`\r  ${fatto}%`);
    }
  }

  process.stdout.write("\r  100%\n");
  console.log(`  Catturati in ${Math.round((Date.now() - inizio) / 1000)}s`);

  await browser.close();

  const finale = path.join(CARTELLA, "pagina-attesa-nitido.mp4");
  console.log("  Monto il filmato…");

  // H.264 con yuv420p: la combinazione che iPhone, Telegram e i browser
  // riproducono senza conversioni.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      path.join(temporanea, "f-%05d.png"),
      "-vf",
      // Dimensioni pari: senza, H.264 rifiuta di codificare.
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      // Più generoso del solito: i blocchi netti su fondo scuro mostrano
      // subito gli artefatti di compressione.
      "-crf",
      "17",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      finale,
    ],
    { stdio: "ignore" },
  );

  fs.rmSync(temporanea, { recursive: true, force: true });

  const dimensione = fs.statSync(finale).size;
  console.log(
    `\n  Fatto: ${path.resolve(finale)}\n` +
      `  ${LARGHEZZA * DENSITA}×${ALTEZZA * DENSITA} · ${SECONDI}s · ${FPS} fps · ` +
      `${(dimensione / 1024 / 1024).toFixed(1)} MB\n`,
  );
}

main().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
