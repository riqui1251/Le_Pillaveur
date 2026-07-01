-- CreateTable
CREATE TABLE "OnlineRoomInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    CONSTRAINT "OnlineRoomInvite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "OnlineRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnlineRoomInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnlineRoomInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OnlineRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "visibility" TEXT NOT NULL DEFAULT 'public',
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
INSERT INTO "new_OnlineRoom" ("code", "createdAt", "currentTurnUserId", "gameId", "gameStateJson", "hostUserId", "id", "selectedMemberIdsJson", "settingsJson", "stateVersion", "status", "updatedAt") SELECT "code", "createdAt", "currentTurnUserId", "gameId", "gameStateJson", "hostUserId", "id", "selectedMemberIdsJson", "settingsJson", "stateVersion", "status", "updatedAt" FROM "OnlineRoom";
DROP TABLE "OnlineRoom";
ALTER TABLE "new_OnlineRoom" RENAME TO "OnlineRoom";
CREATE UNIQUE INDEX "OnlineRoom_code_key" ON "OnlineRoom"("code");
CREATE INDEX "OnlineRoom_status_visibility_gameId_idx" ON "OnlineRoom"("status", "visibility", "gameId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OnlineRoomInvite_invitedUserId_status_idx" ON "OnlineRoomInvite"("invitedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineRoomInvite_roomId_invitedUserId_key" ON "OnlineRoomInvite"("roomId", "invitedUserId");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

