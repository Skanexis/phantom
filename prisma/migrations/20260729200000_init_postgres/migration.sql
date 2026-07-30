-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Ruolo" AS ENUM ('UTENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "StatoRichiesta" AS ENUM ('NUOVA', 'IN_LAVORAZIONE', 'IN_ATTESA_CLIENTE', 'COMPLETATA', 'ANNULLATA');

-- CreateEnum
CREATE TYPE "AmbitoSviluppo" AS ENUM ('SITO_WEB', 'APPLICAZIONE', 'AUTOMAZIONE');

-- CreateEnum
CREATE TYPE "StatoAbbonamentoUtente" AS ENUM ('IN_ATTESA', 'ATTIVO', 'SOSPESO', 'SCADUTO', 'ANNULLATO');

-- CreateTable
CREATE TABLE "Utente" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "nome" TEXT,
    "cognome" TEXT,
    "linguaTelegram" TEXT,
    "urlFoto" TEXT,
    "ruolo" "Ruolo" NOT NULL DEFAULT 'UTENTE',
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abbonamento" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sottotitolo" TEXT,
    "descrizione" TEXT NOT NULL,
    "prezzoCentesimi" INTEGER NOT NULL,
    "valuta" TEXT NOT NULL DEFAULT 'EUR',
    "periodo" TEXT NOT NULL DEFAULT 'mese',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "inEvidenza" BOOLEAN NOT NULL DEFAULT false,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abbonamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunzionalitaAbbonamento" (
    "id" TEXT NOT NULL,
    "abbonamentoId" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "inclusa" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FunzionalitaAbbonamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbbonamentoUtente" (
    "id" TEXT NOT NULL,
    "utenteId" TEXT NOT NULL,
    "abbonamentoId" TEXT NOT NULL,
    "stato" "StatoAbbonamentoUtente" NOT NULL DEFAULT 'ATTIVO',
    "inizioIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadeIl" TIMESTAMP(3),
    "note" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbbonamentoUtente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Richiesta" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "utenteId" TEXT,
    "ambito" "AmbitoSviluppo" NOT NULL,
    "stato" "StatoRichiesta" NOT NULL DEFAULT 'NUOVA',
    "nomeContatto" TEXT NOT NULL,
    "contatto" TEXT NOT NULL,
    "budget" TEXT,
    "messaggio" TEXT NOT NULL,
    "noteAdmin" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Richiesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoricoStato" (
    "id" TEXT NOT NULL,
    "richiestaId" TEXT NOT NULL,
    "stato" "StatoRichiesta" NOT NULL,
    "nota" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoricoStato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifica" (
    "id" TEXT NOT NULL,
    "utenteId" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "letta" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenCollegamento" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "utenteId" TEXT,
    "confermato" BOOLEAN NOT NULL DEFAULT false,
    "usato" BOOLEAN NOT NULL DEFAULT false,
    "scadeIl" TIMESTAMP(3) NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenCollegamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContenutoSito" (
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL DEFAULT 'generale',
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContenutoSito_pkey" PRIMARY KEY ("chiave")
);

-- CreateTable
CREATE TABLE "Servizio" (
    "id" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "icona" TEXT NOT NULL DEFAULT 'code',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Servizio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vantaggio" (
    "id" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "icona" TEXT NOT NULL DEFAULT 'spark',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vantaggio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "domanda" TEXT NOT NULL,
    "risposta" TEXT NOT NULL,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contatto" (
    "id" TEXT NOT NULL,
    "etichetta" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "url" TEXT,
    "icona" TEXT NOT NULL DEFAULT 'link',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contatto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utente_telegramId_key" ON "Utente"("telegramId");

-- CreateIndex
CREATE INDEX "Utente_ruolo_idx" ON "Utente"("ruolo");

-- CreateIndex
CREATE UNIQUE INDEX "Abbonamento_slug_key" ON "Abbonamento"("slug");

-- CreateIndex
CREATE INDEX "Abbonamento_attivo_ordine_idx" ON "Abbonamento"("attivo", "ordine");

-- CreateIndex
CREATE INDEX "FunzionalitaAbbonamento_abbonamentoId_ordine_idx" ON "FunzionalitaAbbonamento"("abbonamentoId", "ordine");

-- CreateIndex
CREATE INDEX "AbbonamentoUtente_utenteId_stato_idx" ON "AbbonamentoUtente"("utenteId", "stato");

-- CreateIndex
CREATE UNIQUE INDEX "Richiesta_numero_key" ON "Richiesta"("numero");

-- CreateIndex
CREATE INDEX "Richiesta_stato_creatoIl_idx" ON "Richiesta"("stato", "creatoIl");

-- CreateIndex
CREATE INDEX "StoricoStato_richiestaId_creatoIl_idx" ON "StoricoStato"("richiestaId", "creatoIl");

-- CreateIndex
CREATE INDEX "Notifica_utenteId_letta_idx" ON "Notifica"("utenteId", "letta");

-- CreateIndex
CREATE UNIQUE INDEX "TokenCollegamento_token_key" ON "TokenCollegamento"("token");

-- CreateIndex
CREATE INDEX "TokenCollegamento_token_usato_idx" ON "TokenCollegamento"("token", "usato");

-- CreateIndex
CREATE INDEX "Servizio_attivo_ordine_idx" ON "Servizio"("attivo", "ordine");

-- CreateIndex
CREATE INDEX "Vantaggio_attivo_ordine_idx" ON "Vantaggio"("attivo", "ordine");

-- CreateIndex
CREATE INDEX "Faq_attiva_ordine_idx" ON "Faq"("attiva", "ordine");

-- CreateIndex
CREATE INDEX "Contatto_attivo_ordine_idx" ON "Contatto"("attivo", "ordine");

-- AddForeignKey
ALTER TABLE "FunzionalitaAbbonamento" ADD CONSTRAINT "FunzionalitaAbbonamento_abbonamentoId_fkey" FOREIGN KEY ("abbonamentoId") REFERENCES "Abbonamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbonamentoUtente" ADD CONSTRAINT "AbbonamentoUtente_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbonamentoUtente" ADD CONSTRAINT "AbbonamentoUtente_abbonamentoId_fkey" FOREIGN KEY ("abbonamentoId") REFERENCES "Abbonamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Richiesta" ADD CONSTRAINT "Richiesta_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoricoStato" ADD CONSTRAINT "StoricoStato_richiestaId_fkey" FOREIGN KEY ("richiestaId") REFERENCES "Richiesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notifica" ADD CONSTRAINT "Notifica_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenCollegamento" ADD CONSTRAINT "TokenCollegamento_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

