-- Terzo tipo di esclusione: la sottorete.
--
-- Sta in una migrazione tutta sua, e non insieme alle tabelle che la usano,
-- per una regola di PostgreSQL: un valore aggiunto a un enum non è
-- utilizzabile nella stessa transazione che lo ha aggiunto. Prisma esegue
-- ogni file in una transazione, quindi separarli è l'unico modo di poter
-- scrivere, in una migrazione futura, un INSERT o un UPDATE che nomini
-- 'SOTTORETE' senza che fallisca.

-- AlterEnum
ALTER TYPE "TipoBando" ADD VALUE 'SOTTORETE';
