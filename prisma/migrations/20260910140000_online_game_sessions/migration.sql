-- Journal des parties LANCEES : une ligne par partie (pas par partie gagnee),
-- creee au lancement, `endedAt` nul tant qu'elle tourne. Une revanche produit
-- une NOUVELLE ligne. Aucune cle etrangere vers OnlineRoom : la salle est
-- ephemere, le journal lui survit.

-- CreateTable
CREATE TABLE "OnlineGameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "playerCount" INTEGER NOT NULL,
    "humanCount" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "OnlineGameSession_startedAt_idx" ON "OnlineGameSession"("startedAt");

-- CreateIndex
CREATE INDEX "OnlineGameSession_roomId_endedAt_idx" ON "OnlineGameSession"("roomId", "endedAt");

-- Participant : SOIT un compte (`userId`), SOIT un bot (`botName`).
-- RGPD : aucune copie du pseudo humain. SET NULL (et non CASCADE) pour que la
-- suppression du compte cesse de le nommer sans effacer le journal.

-- CreateTable
CREATE TABLE "OnlineGameSessionPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "botName" TEXT,
    "seat" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OnlineGameSessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnlineGameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnlineGameSessionPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OnlineGameSessionPlayer_sessionId_idx" ON "OnlineGameSessionPlayer"("sessionId");

-- CreateIndex
CREATE INDEX "OnlineGameSessionPlayer_userId_idx" ON "OnlineGameSessionPlayer"("userId");
