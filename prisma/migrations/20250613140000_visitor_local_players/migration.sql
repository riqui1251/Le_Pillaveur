-- AlterTable
ALTER TABLE "SitePresence" ADD COLUMN "localPlayerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SitePresence" ADD COLUMN "localPlayerNames" TEXT;
