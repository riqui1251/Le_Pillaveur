-- CreateTable
CREATE TABLE "OnlineMatchResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "rank" INTEGER,
    "playerCount" INTEGER NOT NULL,
    "humanCount" INTEGER NOT NULL,
    "finishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnlineMatchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OnlineMatchResult_gameId_userId_idx" ON "OnlineMatchResult"("gameId", "userId");

-- CreateIndex
CREATE INDEX "OnlineMatchResult_userId_finishedAt_idx" ON "OnlineMatchResult"("userId", "finishedAt");

