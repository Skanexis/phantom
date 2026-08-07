-- Storico delle decisioni di CrowdSec.
--
-- CrowdSec conserva le decisioni finché sono in vigore; scadute, spariscono.
-- Ma il traffico che blocca non lascia traccia da nessun'altra parte — muore
-- nel firewall — quindi senza questa tabella la domanda «questo indirizzo era
-- già stato bloccato?» non ha risposta.

-- CreateTable
CREATE TABLE "DecisioneCrowdSec" (
    "id" SERIAL NOT NULL,
    "valore" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "origine" TEXT NOT NULL,
    "durata" TEXT NOT NULL,
    "vistoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadutaIl" TIMESTAMP(3),

    CONSTRAINT "DecisioneCrowdSec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisioneCrowdSec_valore_scenario_key" ON "DecisioneCrowdSec"("valore", "scenario");

-- CreateIndex
CREATE INDEX "DecisioneCrowdSec_vistoIl_idx" ON "DecisioneCrowdSec"("vistoIl");

-- CreateIndex
CREATE INDEX "DecisioneCrowdSec_origine_vistoIl_idx" ON "DecisioneCrowdSec"("origine", "vistoIl");
