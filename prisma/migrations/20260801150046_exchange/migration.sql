-- CreateEnum
CREATE TYPE "DirezioneScambio" AS ENUM ('CRIPTO_CONTANTI', 'CONTANTI_CRIPTO', 'CRIPTO_BONIFICO', 'BONIFICO_CRIPTO');

-- CreateEnum
CREATE TYPE "Criptovaluta" AS ENUM ('BTC', 'USDC');

-- AlterEnum
ALTER TYPE "AmbitoSviluppo" ADD VALUE 'EXCHANGE';

-- AlterTable
ALTER TABLE "Richiesta" ADD COLUMN     "criptovaluta" "Criptovaluta",
ADD COLUMN     "direzioneScambio" "DirezioneScambio",
ADD COLUMN     "importoCentesimi" INTEGER;
