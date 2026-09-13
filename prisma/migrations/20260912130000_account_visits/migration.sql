-- VISITES d'un compte : une suite de battements (page visible et utilisee)
-- separes de moins de 30 min, tous onglets et appareils confondus. Ce n'est
-- pas Session (jeton d'authentification). Ecrite seulement avec le
-- consentement aux statistiques de visite ('2') et pour le role 'user'.
-- Ni IP, ni URL, ni jeu, ni pseudo, ni visitorId : des durees en secondes et
-- une categorie d'appareil. CASCADE : donnees d'usage du joueur, sans valeur
-- d'audit. Purge 6 mois apres startedAt (retention-sweep.ts).
-- Dates ecrites par le client Prisma, en millisecondes epoch.

-- CreateTable
CREATE TABLE "AccountVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibleSeconds" INTEGER NOT NULL DEFAULT 0,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "gameSeconds" INTEGER NOT NULL DEFAULT 0,
    "device" TEXT,
    CONSTRAINT "AccountVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AccountVisit_userId_lastBeatAt_idx" ON "AccountVisit"("userId", "lastBeatAt");

-- CreateIndex
CREATE INDEX "AccountVisit_startedAt_idx" ON "AccountVisit"("startedAt");
