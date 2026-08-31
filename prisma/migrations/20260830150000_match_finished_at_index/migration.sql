-- Classement hebdomadaire : les agrégations filtrent `finishedAt >= lundi`
-- (00:00 Europe/Paris) — index simple pour éviter le scan complet de la table.
-- CreateIndex
CREATE INDEX "OnlineMatchResult_finishedAt_idx" ON "OnlineMatchResult"("finishedAt");
