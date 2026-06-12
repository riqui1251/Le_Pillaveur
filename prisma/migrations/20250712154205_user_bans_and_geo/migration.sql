-- AlterTable
ALTER TABLE "User" ADD COLUMN "banType" TEXT;
ALTER TABLE "User" ADD COLUMN "bannedUntil" DATETIME;
ALTER TABLE "User" ADD COLUMN "banComment" TEXT;
ALTER TABLE "User" ADD COLUMN "bannedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "bannedById" TEXT;
ALTER TABLE "User" ADD COLUMN "lastCountry" TEXT;
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;

-- AlterTable
ALTER TABLE "SitePresence" ADD COLUMN "userId" TEXT;
ALTER TABLE "SitePresence" ADD COLUMN "country" TEXT;

-- CreateTable
CREATE TABLE "AccountBanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "bannedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountBanEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountBanEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AccountBanEvent_userId_createdAt_idx" ON "AccountBanEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SitePresence_userId_idx" ON "SitePresence"("userId");

-- CreateIndex
CREATE INDEX "SitePresence_country_idx" ON "SitePresence"("country");
