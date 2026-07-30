-- AlterTable: codice breve leggibile per richieste e abbonamenti.
ALTER TABLE "Richiesta" ADD COLUMN "codice" TEXT;
ALTER TABLE "AbbonamentoUtente" ADD COLUMN "codice" TEXT;

-- CreateTable
CREATE TABLE "Messaggio" (
    "id" TEXT NOT NULL,
    "richiestaId" TEXT NOT NULL,
    "daAdmin" BOOLEAN NOT NULL DEFAULT false,
    "testo" TEXT NOT NULL,
    "letto" BOOLEAN NOT NULL DEFAULT false,
    "daTelegram" BOOLEAN NOT NULL DEFAULT false,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Messaggio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Richiesta_codice_key" ON "Richiesta"("codice");

-- CreateIndex
CREATE UNIQUE INDEX "AbbonamentoUtente_codice_key" ON "AbbonamentoUtente"("codice");

-- CreateIndex
CREATE INDEX "Messaggio_richiestaId_creatoIl_idx" ON "Messaggio"("richiestaId", "creatoIl");

-- CreateIndex
CREATE INDEX "Messaggio_letto_daAdmin_idx" ON "Messaggio"("letto", "daAdmin");

-- AddForeignKey
ALTER TABLE "Messaggio" ADD CONSTRAINT "Messaggio_richiestaId_fkey" FOREIGN KEY ("richiestaId") REFERENCES "Richiesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
