-- Classement des gorgees par compte (26/11/2026) : onglet « Gorgees » de
-- /classement, top 5 des comptes par jeu en ligne + sa propre position.
-- OnlineDrinkResult : gorgees BUES par chaque compte humain d'une partie en
-- ligne terminee, une ligne par compte et par partie (historique brut agrege
-- a la lecture, comme OnlineMatchResult). Supprimee avec le compte (cascade).
-- Table neuve : aucune ligne existante touchee, rien a rattraper (le
-- classement demarre vide). IF NOT EXISTS : rejouable sans risque.

-- CreateTable
CREATE TABLE IF NOT EXISTS "OnlineDrinkResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drinks" INTEGER NOT NULL,
    "finishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnlineDrinkResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnlineDrinkResult_gameId_userId_idx" ON "OnlineDrinkResult"("gameId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnlineDrinkResult_userId_finishedAt_idx" ON "OnlineDrinkResult"("userId", "finishedAt");
