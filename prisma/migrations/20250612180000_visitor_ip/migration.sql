-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastIp" TEXT;

-- AlterTable
ALTER TABLE "SitePresence" ADD COLUMN "lastIp" TEXT;

-- CreateIndex
CREATE INDEX "SitePresence_lastIp_idx" ON "SitePresence"("lastIp");
