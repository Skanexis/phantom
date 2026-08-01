import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const RUOLI_VALIDI = ["UTENTE", "SUPPORTO", "ADMIN", "DEVELOPER"] as const;
type RuoloValido = (typeof RUOLI_VALIDI)[number];

const telegramId = process.argv[2];
const ruolo = process.argv[3]?.toUpperCase();

if (!telegramId || !ruolo || !RUOLI_VALIDI.includes(ruolo as RuoloValido)) {
  console.error(
    `Uso: npx tsx scripts/imposta-ruolo.ts <telegramId> <${RUOLI_VALIDI.join("|")}>`,
  );
  process.exit(1);
}

/**
 * Unico punto da cui nascono i ruoli DEVELOPER e SUPPORTO: nessuna rotta
 * del sito li assegna, solo chi ha accesso alla console del server.
 * ADMIN resta anche assegnabile via ADMIN_TELEGRAM_IDS alla prima
 * autenticazione, ma questo script funziona comunque per tutti i ruoli.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  const utente = await prisma.utente.update({
    where: { telegramId },
    data: { ruolo: ruolo as RuoloValido },
  });
  console.log(`Utente ${utente.telegramId} ora ha ruolo ${utente.ruolo}.`);
}

main()
  .catch((errore) => {
    console.error(errore);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
