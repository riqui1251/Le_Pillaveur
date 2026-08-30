-- Historique des derniers jeux joués en ligne : une ligne par (user, jeu),
-- horodatée à chaque lancement de partie (bots et rematchs compris).
-- CreateTable
CREATE TABLE "OnlineGameHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "lastPlayedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "OnlineGameHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineGameHistory_userId_gameId_key" ON "OnlineGameHistory"("userId", "gameId");

-- CreateIndex
CREATE INDEX "OnlineGameHistory_userId_lastPlayedAt_idx" ON "OnlineGameHistory"("userId", "lastPlayedAt");
