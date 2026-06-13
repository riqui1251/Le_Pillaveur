-- CreateTable
CREATE TABLE "IpSeenLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectKey" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "IpSeenLog_subjectKey_ip_key" ON "IpSeenLog"("subjectKey", "ip");
CREATE INDEX "IpSeenLog_subjectKey_idx" ON "IpSeenLog"("subjectKey");
CREATE INDEX "IpSeenLog_ip_idx" ON "IpSeenLog"("ip");

-- Backfill depuis les données existantes
INSERT OR IGNORE INTO "IpSeenLog" ("id", "subjectKey", "ip", "country", "firstSeen", "lastSeen")
SELECT
    lower(hex(randomblob(8)) || hex(randomblob(8))),
    'user:' || "id",
    "lastIp",
    "lastCountry",
    COALESCE("lastSeenAt", "updatedAt"),
    COALESCE("lastSeenAt", "updatedAt")
FROM "User"
WHERE "lastIp" IS NOT NULL AND "lastIp" != '';

INSERT OR IGNORE INTO "IpSeenLog" ("id", "subjectKey", "ip", "country", "firstSeen", "lastSeen")
SELECT
    lower(hex(randomblob(8)) || hex(randomblob(8))),
    CASE
        WHEN "userId" IS NOT NULL THEN 'user:' || "userId"
        ELSE 'visitor:' || "visitorId"
    END,
    "lastIp",
    "country",
    "firstSeen",
    "lastSeen"
FROM "SitePresence"
WHERE "lastIp" IS NOT NULL AND "lastIp" != '';
