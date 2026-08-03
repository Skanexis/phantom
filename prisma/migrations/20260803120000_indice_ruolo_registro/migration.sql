-- Indice per la scheda DEV.LOGS.
--
-- Le righe con un ruolo sono una frazione minima dell'archivio — lo staff è
-- una manciata di persone contro tutto il traffico del sito — quindi il
-- filtro è molto selettivo ed è il caso da manuale in cui un indice
-- trasforma una scansione dell'intera tabella in poche letture.

-- CreateIndex
CREATE INDEX "RegistroRichiesta_ruolo_quando_idx" ON "RegistroRichiesta"("ruolo", "quando");
