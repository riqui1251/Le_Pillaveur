-- Comptes utilisateur et sessions (sync joueurs locaux)

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
