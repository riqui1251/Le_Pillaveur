-- Avis de 1re partie : 10 avis en 4 mois avec le seul bouton « Signaler »,
-- alors qu'une note en un geste a la fin de la 1re partie dit tout de suite si
-- le premier contact a plu. POST /api/feedback/first-game ecrit une ligne
-- UserFeedback de type 'first-game' portant la note (1..5), le jeu et le mode
-- (online | local) ; sans commentaire, elle reste hors de la boite de tri
-- (FEEDBACK_INBOX_WHERE) et ne nourrit que le resume de la Supervision.
-- User.firstFeedbackAskedAt : date ou la carte a ete notee ou refusee, pour ne
-- pas la reproposer. RGPD / minimisation : une date, ni la note ni le choix ;
-- l'avis ne recopie pas l'e-mail du compte (contactEmail reste null).
-- Colonnes nullables : aucune ligne existante touchee, rien a reecrire.
-- Index (type, createdAt) : le resume filtre sur le type et borne sur 30 j.
-- IF NOT EXISTS sur l'index : rejouable sans risque s'il a deja ete pose.
-- Nom = celui que Prisma genere pour @@index, sinon `migrate diff` verrait un
-- ecart entre la base et le schema.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "firstFeedbackAskedAt" DATETIME;

-- AlterTable
ALTER TABLE "UserFeedback" ADD COLUMN "gameId" TEXT;
ALTER TABLE "UserFeedback" ADD COLUMN "playMode" TEXT;
ALTER TABLE "UserFeedback" ADD COLUMN "rating" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserFeedback_type_createdAt_idx" ON "UserFeedback"("type", "createdAt");
