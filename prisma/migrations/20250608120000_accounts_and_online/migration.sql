-- Comptes, sessions et salles en ligne

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "displayName" TEXT NOT NULL DEFAULT 'Joueur';
ALTER TABLE "User" ADD COLUMN "playMode" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "User" ADD COLUMN "localPlayersJson" TEXT;

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

CREATE TABLE "OnlineRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "gameId" TEXT,
    "selectedMemberIdsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnlineRoom_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OnlineRoom_code_key" ON "OnlineRoom"("code");

CREATE TABLE "OnlineRoomMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnlineRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "OnlineRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnlineRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OnlineRoomMember_roomId_userId_key" ON "OnlineRoomMember"("roomId", "userId");
