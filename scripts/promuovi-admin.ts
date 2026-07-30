import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const telegramId = process.argv[2];
if (!telegramId) {
  console.error("Uso: npx tsx scripts/promuovi-admin.ts <telegramId>");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  const utente = await prisma.utente.update({
    where: { telegramId },
    data: { ruolo: "ADMIN" },
  });
  console.log(`Utente ${utente.telegramId} ora ha ruolo ${utente.ruolo}.`);
}

main()
  .catch((errore) => {
    console.error(errore);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
