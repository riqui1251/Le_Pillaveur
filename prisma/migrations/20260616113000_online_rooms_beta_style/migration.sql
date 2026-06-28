CREATE TABLE "OnlineRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "gameId" TEXT,
    "selectedMemberIdsJson" TEXT,
    "settingsJson" TEXT,
    "gameStateJson" TEXT,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "currentTurnUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnlineRoom_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

CREATE UNIQUE INDEX "OnlineRoom_code_key" ON "OnlineRoom"("code");
CREATE UNIQUE INDEX "OnlineRoomMember_roomId_userId_key" ON "OnlineRoomMember"("roomId", "userId");
