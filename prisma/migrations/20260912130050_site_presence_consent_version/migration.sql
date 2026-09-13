-- Version du consentement aux statistiques sous laquelle une presence de
-- navigateur a ete ecrite : '2' pour toute ecriture du nouveau code
-- (recordVisitorPing). NULL pour les lignes existantes, toutes ecrites sous
-- l'ancien accord '1' (libelle "anonymes"), et pour celles que l'ancien
-- conteneur ecrirait encore pendant le deploiement (il ignore la colonne) :
-- la migration suivante et le filet de retention-sweep.ts s'appuient dessus.
-- Sert aussi la couverture "visites suivies sur N navigateurs sur M" de la
-- fiche compte.

-- AlterTable
ALTER TABLE "SitePresence" ADD COLUMN "consentVersion" TEXT;
