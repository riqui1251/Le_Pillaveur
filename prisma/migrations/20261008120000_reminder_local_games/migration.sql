-- Lot « propositions » du 08/10/2026.
-- 1) Rappel « On remet ça ? » du vendredi par e-mail, sur accord explicite :
--    date de l'accord (null = aucun rappel), dernier envoi (un par semaine au
--    plus) et jeton aleatoire du lien de desinscription en un clic. Colonnes
--    nullables : aucun compte existant n'est inscrit, rien a rattraper.
-- 2) LocalGameDaily : compteurs agreges des parties LOCALES (lancees /
--    terminees) par jour et par jeu, sans aucune donnee personnelle (ni
--    compte, ni visiteur, ni IP). Purge a 13 mois par retention-sweep.
-- La serie hebdomadaire reutilise streakCount/streakLastDay : pas de colonne.
-- IF NOT EXISTS : rejouable sans risque. Noms d'index = ceux que Prisma genere.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "reminderLastSentAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "reminderOptInAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "reminderToken" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LocalGameDaily" (
    "day" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "ends" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "gameId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_reminderToken_key" ON "User"("reminderToken");
