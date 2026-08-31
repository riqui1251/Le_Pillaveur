-- Succès : contrainte d'unicité (un succès ne se débloque qu'une fois) et
-- suppression en cascade avec le compte (SQLite → reconstruction de table).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Achievement" ("id", "userId", "type", "unlockedAt")
  SELECT "id", "userId", "type", "unlockedAt" FROM "Achievement";
DROP TABLE "Achievement";
ALTER TABLE "new_Achievement" RENAME TO "Achievement";
CREATE UNIQUE INDEX "Achievement_userId_type_key" ON "Achievement"("userId", "type");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
