import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, devices } from "playwright";

/**
 * Registra un video della pagina di attesa in formato telefono.
 *
 * Riprende la pagina vera in esecuzione, non una ricostruzione: quello che
 * si vede nel filmato è esattamente ciò che vede un visitatore.
 *
 * Uso:
 *   SITO_URL="http://127.0.0.1:3099" npx tsx scripts/video-attesa.ts
 */

const SITO = process.env.SITO_URL ?? "http://127.0.0.1:3099";
const CARTELLA = process.env.CARTELLA_USCITA ?? "video";

/** Durata utile del filmato, al netto del caricamento iniziale. */
const SECONDI = Number(process.env.SECONDI ?? 15);

/**
 * 393×852: area logica dei modelli iPhone Pro recenti. È la larghezza in
 * pixel CSS a decidere l'impaginazione, quindi va tenuta questa anche
 * volendo un file più grande — allargarla darebbe il layout da desktop.
 */
const LARGHEZZA = Number(process.env.LARGHEZZA ?? 393);
const ALTEZZA = Number(process.env.ALTEZZA ?? 852);

/**
 * Ingrandimento applicato al file finale, non alla ripresa.
 *
 * Playwright compone il filmato alla risoluzione del viewport in pixel CSS
 * e non ridisegna a densità maggiore: chiedendo un video più grande della
 * finestra, la pagina resta nell'angolo e il resto è riempimento grigio.
 * L'ingrandimento va quindi fatto dopo, in codifica, dove almeno evita che
 * sia il telefono a scalare con un filtro peggiore.
 */
const SCALA = Number(process.env.SCALA ?? 3);

/** Secondi scartati in testa: caricamento e primo fotogramma vuoto. */
const TAGLIO_INIZIALE = 1.6;

function ffmpegDisponibile() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(CARTELLA, { recursive: true });

  const browser = await chromium.launch();
  const contesto = await browser.newContext({
    ...devices["iPhone 15 Pro"],
    viewport: { width: LARGHEZZA, height: ALTEZZA },
    // Densità 1 e ripresa alla misura esatta della finestra: è l'unica
    // combinazione in cui il fotogramma contiene solo la pagina.
    deviceScaleFactor: 1,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    // Il tema del sito è scuro salvo preferenza contraria: Playwright
    // chiede "light" per difetto, ed è il motivo per cui le riprese
    // uscivano su fondo chiaro.
    colorScheme: "dark",
    recordVideo: {
      dir: CARTELLA,
      size: { width: LARGHEZZA, height: ALTEZZA },
    },
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
    await contesto.close();
    await browser.close();
    process.exit(1);
  }

  // Un tocco a metà ripresa: mostra anche la reazione del marchio, non
  // solo i cedimenti automatici.
  const durataRipresa = (TAGLIO_INIZIALE + SECONDI + 1) * 1000;
  const meta = durataRipresa / 2;

  setTimeout(() => {
    const riquadro = { x: LARGHEZZA / 2, y: ALTEZZA * 0.3 };
    pagina.mouse.click(riquadro.x, riquadro.y).catch(() => undefined);
  }, meta);

  console.log(`  Riprendo per ${Math.round(durataRipresa / 1000)}s…`);
  await pagina.waitForTimeout(durataRipresa);

  const video = pagina.video();
  await contesto.close();
  await browser.close();

  if (!video) {
    console.error("Nessun video prodotto.");
    process.exit(1);
  }

  const grezzo = await video.path();
  console.log(`  Registrato: ${path.basename(grezzo)}`);

  if (!ffmpegDisponibile()) {
    console.log(
      `\n  Fatto: ${path.resolve(grezzo)}\n` +
        "  ffmpeg non è disponibile: il file resta in WebM, che iPhone non\n" +
        "  riproduce da solo. Installa ffmpeg per ottenere un MP4.\n",
    );
    return;
  }

  const finale = path.join(CARTELLA, "pagina-attesa.mp4");

  // H.264 con yuv420p: è la combinazione che iPhone, Telegram e i browser
  // riproducono senza conversioni. Il WebM prodotto da Chromium, da solo,
  // su iOS non parte.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(TAGLIO_INIZIALE),
      "-i",
      grezzo,
      "-t",
      String(SECONDI),
      "-vf",
      // Lanczos per l'ingrandimento e dimensioni pari: senza queste
      // ultime H.264 rifiuta di codificare.
      `scale=trunc(iw*${SCALA}/2)*2:trunc(ih*${SCALA}/2)*2:flags=lanczos,fps=30`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      finale,
    ],
    { stdio: "ignore" },
  );

  fs.rmSync(grezzo, { force: true });

  const dimensione = fs.statSync(finale).size;
  console.log(
    `\n  Fatto: ${path.resolve(finale)}\n` +
      `  ${LARGHEZZA * SCALA}×${ALTEZZA * SCALA} · ${SECONDI}s · ${(dimensione / 1024 / 1024).toFixed(1)} MB\n`,
  );
}

main().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
