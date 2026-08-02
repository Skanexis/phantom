-- CreateEnum
CREATE TYPE "StatoSegnalazione" AS ENUM ('APERTA', 'PRESA_IN_CARICO', 'CHIUSA');

-- CreateEnum
CREATE TYPE "TipoBando" AS ENUM ('IP', 'DISPOSITIVO');

-- AlterTable
ALTER TABLE "Utente" ADD COLUMN     "bloccato" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bloccatoIl" TIMESTAMP(3),
ADD COLUMN     "motivoBlocco" TEXT,
ADD COLUMN     "bloccatoDaId" TEXT;

-- CreateIndex
CREATE INDEX "Utente_bloccato_idx" ON "Utente"("bloccato");

-- CreateTable
CREATE TABLE "Segnalazione" (
    "id" TEXT NOT NULL,
    "utenteId" TEXT NOT NULL,
    "autoreId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "stato" "StatoSegnalazione" NOT NULL DEFAULT 'APERTA',
    "esito" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiusoIl" TIMESTAMP(3),

    CONSTRAINT "Segnalazione_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Segnalazione_stato_creatoIl_idx" ON "Segnalazione"("stato", "creatoIl");

-- CreateIndex
CREATE INDEX "Segnalazione_utenteId_idx" ON "Segnalazione"("utenteId");

-- CreateTable
CREATE TABLE "Bando" (
    "id" TEXT NOT NULL,
    "tipo" "TipoBando" NOT NULL,
    "valore" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadeIl" TIMESTAMP(3),
    "autoreId" TEXT,

    CONSTRAINT "Bando_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bando_tipo_valore_key" ON "Bando"("tipo", "valore");

-- CreateIndex
CREATE INDEX "Bando_tipo_idx" ON "Bando"("tipo");

-- AddForeignKey
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
