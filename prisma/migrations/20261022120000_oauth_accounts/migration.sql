-- Connexion Discord et Facebook (22/10/2026) : un compte peut porter une
-- identite externe, reconnue par l'identifiant STABLE du fournisseur et non
-- par l'e-mail (qui change chez Discord). Sert aussi de preuve a la
-- suppression d'un compte sans mot de passe. Ni jeton ni e-mail recopies.
-- Table nouvelle, aucune ligne existante touchee.
-- IF NOT EXISTS : rejouable sans risque. Noms d'index = ceux que Prisma genere.

-- CreateTable
CREATE TABLE IF NOT EXISTS "OAuthAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
