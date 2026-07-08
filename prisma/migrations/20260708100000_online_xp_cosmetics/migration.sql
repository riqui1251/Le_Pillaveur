-- XP en ligne : cumul par compte (niveau dérivé côté code, jamais stocké).
ALTER TABLE "User" ADD COLUMN "onlineXp" INTEGER NOT NULL DEFAULT 0;

-- Déblocage manuel d'un cosmétique par un fondateur (clé `kind:id`).
CREATE TABLE "CosmeticGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cosmeticKey" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CosmeticGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CosmeticGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CosmeticGrant_userId_cosmeticKey_key" ON "CosmeticGrant"("userId", "cosmeticKey");
