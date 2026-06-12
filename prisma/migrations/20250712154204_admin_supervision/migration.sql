-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "SitePresence" (
    "visitorId" TEXT NOT NULL PRIMARY KEY,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyVisitor" (
    "visitorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,

    PRIMARY KEY ("visitorId", "date")
);

-- CreateIndex
CREATE INDEX "SitePresence_lastSeen_idx" ON "SitePresence"("lastSeen");

-- CreateIndex
CREATE INDEX "DailyVisitor_date_idx" ON "DailyVisitor"("date");
