-- AlterTable
ALTER TABLE "User" ADD COLUMN "nameModerationWarnedAt" DATETIME;

-- CreateTable
CREATE TABLE "NameModerationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "visitorId" TEXT,
    "attemptedName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NameModerationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NameModerationAttempt_userId_createdAt_idx" ON "NameModerationAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NameModerationAttempt_visitorId_createdAt_idx" ON "NameModerationAttempt"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "NameModerationAttempt_reason_createdAt_idx" ON "NameModerationAttempt"("reason", "createdAt");

-- CreateIndex
CREATE INDEX "NameModerationAttempt_createdAt_idx" ON "NameModerationAttempt"("createdAt");
