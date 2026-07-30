import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  PREFISSO_ABBONAMENTO,
  PREFISSO_RICHIESTA,
  codiceUnico,
} from "../src/lib/codici";

/**
 * Assegna i codici brevi alle righe create prima della migrazione.
 *
 * La colonna nasce vuota sui dati esistenti: senza questo passaggio le
 * vecchie richieste resterebbero senza riferimento nelle comunicazioni.
 * Rieseguibile senza rischi: tocca solo le righe con codice nullo.
 */
// Il progetto usa un driver adapter: senza, PrismaClient non sa come
// raggiungere il database e fallisce all'istanziazione.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const richieste = await prisma.richiesta.findMany({
    where: { codice: null },
    select: { id: true },
  });

  for (const richiesta of richieste) {
    const codice = await codiceUnico(PREFISSO_RICHIESTA, async (valore) =>
      Boolean(await prisma.richiesta.findUnique({ where: { codice: valore } })),
    );
    await prisma.richiesta.update({
      where: { id: richiesta.id },
      data: { codice },
    });
  }

  const sottoscrizioni = await prisma.abbonamentoUtente.findMany({
    where: { codice: null },
    select: { id: true },
  });

  for (const sottoscrizione of sottoscrizioni) {
    const codice = await codiceUnico(PREFISSO_ABBONAMENTO, async (valore) =>
      Boolean(
        await prisma.abbonamentoUtente.findUnique({
          where: { codice: valore },
        }),
      ),
    );
    await prisma.abbonamentoUtente.update({
      where: { id: sottoscrizione.id },
      data: { codice },
    });
  }

  console.log(
    `Codici assegnati: ${richieste.length} richieste, ${sottoscrizioni.length} abbonamenti.`,
  );
}

main()
  .catch((errore) => {
    console.error(errore);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
