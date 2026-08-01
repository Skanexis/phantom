-- CreateTable
CREATE TABLE "Automazione" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "icona" TEXT NOT NULL DEFAULT 'bolt',
    "selezionabile" BOOLEAN NOT NULL DEFAULT true,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automazione_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Automazione_slug_key" ON "Automazione"("slug");

-- CreateIndex
CREATE INDEX "Automazione_attivo_ordine_idx" ON "Automazione"("attivo", "ordine");
