-- CreateEnum
CREATE TYPE "TipoSupporto" AS ENUM ('PROBLEMA', 'DOMANDA', 'MIGLIORAMENTO');

-- AlterEnum
ALTER TYPE "AmbitoSviluppo" ADD VALUE 'SUPPORTO';

-- AlterTable
ALTER TABLE "Richiesta" ADD COLUMN     "tipoSupporto" "TipoSupporto";
