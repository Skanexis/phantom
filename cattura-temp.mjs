import { chromium, devices } from "playwright";

const CARTELLA = process.argv[2];

const browser = await chromium.launch();
const contesto = await browser.newContext({
  ...devices["iPhone 15 Pro"],
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  locale: "it-IT",
  timezoneId: "Europe/Rome",
});

const pagina = await contesto.newPage();
pagina.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 160)));

await pagina.goto("http://127.0.0.1:3099/", {
  waitUntil: "networkidle",
  timeout: 30000,
});

// Lascio comporre il titolo e avanzare qualche voce del cantiere.
await pagina.waitForTimeout(4500);

await pagina.screenshot({ path: `${CARTELLA}/manutenzione.png`, fullPage: true });
await pagina.screenshot({ path: `${CARTELLA}/manutenzione-schermo.png` });

await browser.close();
console.log("ok");
