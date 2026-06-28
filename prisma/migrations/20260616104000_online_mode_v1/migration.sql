-- CreateTable
CREATE TABLE "OnlineLobby" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "game" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "stateJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OnlineLobbyPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "reconnectTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnlineLobbyPlayer_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "OnlineLobby" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OnlineLobby_status_createdAt_idx" ON "OnlineLobby"("status", "createdAt");
CREATE INDEX "OnlineLobby_visibility_createdAt_idx" ON "OnlineLobby"("visibility", "createdAt");
CREATE UNIQUE INDEX "OnlineLobbyPlayer_lobbyId_seatIndex_key" ON "OnlineLobbyPlayer"("lobbyId", "seatIndex");
CREATE INDEX "OnlineLobbyPlayer_lobbyId_status_idx" ON "OnlineLobbyPlayer"("lobbyId", "status");
CREATE INDEX "OnlineLobbyPlayer_userId_idx" ON "OnlineLobbyPlayer"("userId");
