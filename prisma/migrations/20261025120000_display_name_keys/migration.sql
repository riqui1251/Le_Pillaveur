-- Unicité des pseudos (25/10/2026) : isDisplayNameTaken comparait la clé JS
-- (minuscules Unicode) à LOWER() de SQLite, qui ne replie que l'ASCII ; un
-- second « Élodie » passait, comme un « Kеvin » au е cyrillique. La clé est
-- désormais calculée en JS (NFKC, invisibles retirés, homoglyphes, minuscules)
-- et stockée, pour displayName et pour le pseudo en ligne (colonne `name`).
-- Index NON uniques : des homonymes au sens de la clé existent peut-être déjà.
-- Lignes existantes : seuls les pseudos en ASCII imprimable reçoivent ici leur
-- clé, lower(trim()) y donnant exactement la clé JS. Les autres restent NULL
-- (isDisplayNameTaken les compare encore à l'ancienne) jusqu'au passage de
-- scripts/backfill-display-name-keys.mjs, à lancer après le déploiement.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayNameKey" TEXT;
ALTER TABLE "User" ADD COLUMN "onlineDisplayNameKey" TEXT;

UPDATE "User" SET "displayNameKey" = lower(trim("displayName"))
WHERE "displayName" NOT GLOB '*[^ -~]*';

UPDATE "User" SET "onlineDisplayNameKey" = lower(trim("name"))
WHERE "name" IS NOT NULL AND "name" NOT GLOB '*[^ -~]*';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_displayNameKey_idx" ON "User"("displayNameKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_onlineDisplayNameKey_idx" ON "User"("onlineDisplayNameKey");
