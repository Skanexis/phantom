-- Eccezioni di rete, ricorsi e archivio duraturo delle richieste.

-- CreateEnum
CREATE TYPE "StatoRicorso" AS ENUM ('APERTO', 'ACCOLTO', 'RESPINTO');

-- CreateTable
CREATE TABLE "EccezioneRete" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadeIl" TIMESTAMP(3),
    "autoreId" TEXT,
    "ricorsoId" TEXT,

    CONSTRAINT "EccezioneRete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EccezioneRete_ip_key" ON "EccezioneRete"("ip");

-- CreateTable
CREATE TABLE "Ricorso" (
    "id" TEXT NOT NULL,
    "causa" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sottorete" TEXT,
    "dispositivo" TEXT,
    "utenteId" TEXT,
    "messaggio" TEXT NOT NULL,
    "contatto" TEXT,
    "agente" TEXT NOT NULL,
    "stato" "StatoRicorso" NOT NULL DEFAULT 'APERTO',
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisoIl" TIMESTAMP(3),
    "decisoDaId" TEXT,
    "nota" TEXT,

    CONSTRAINT "Ricorso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ricorso_stato_creatoIl_idx" ON "Ricorso"("stato", "creatoIl");

-- CreateIndex
CREATE INDEX "Ricorso_ip_idx" ON "Ricorso"("ip");

-- CreateTable
--
-- Nessuna chiave esterna verso Utente, di proposito: il registro deve
-- sopravvivere alla cancellazione di un account, e un vincolo costerebbe una
-- verifica a ogni riga inserita — su una tabella che ne riceve una per
-- richiesta servita.
CREATE TABLE "RegistroRichiesta" (
    "id" SERIAL NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "livello" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "percorso" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sottorete" TEXT,
    "paese" TEXT,
    "utenteId" TEXT,
    "telegramId" TEXT,
    "ruolo" TEXT,
    "dispositivo" TEXT,
    "agente" TEXT NOT NULL,
    "esito" TEXT NOT NULL,
    "stato" INTEGER,
    "tipo" TEXT,
    "motivi" TEXT,
    "durataMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RegistroRichiesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroRichiesta_quando_idx" ON "RegistroRichiesta"("quando");

-- CreateIndex
CREATE INDEX "RegistroRichiesta_ip_quando_idx" ON "RegistroRichiesta"("ip", "quando");

-- CreateIndex
CREATE INDEX "RegistroRichiesta_livello_quando_idx" ON "RegistroRichiesta"("livello", "quando");

-- CreateIndex
CREATE INDEX "RegistroRichiesta_utenteId_quando_idx" ON "RegistroRichiesta"("utenteId", "quando");

-- CreateIndex
CREATE INDEX "RegistroRichiesta_sottorete_quando_idx" ON "RegistroRichiesta"("sottorete", "quando");

-- CreateIndex
CREATE INDEX "RegistroRichiesta_percorso_quando_idx" ON "RegistroRichiesta"("percorso", "quando");
