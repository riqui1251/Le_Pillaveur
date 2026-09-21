-- Plantages COTE JOUEUR : ce que les ecrans d'erreur React attrapent dans le
-- navigateur ne quittait jamais le telephone (console.error seulement). La
-- table recoit ce que POST /api/client-error a valide : nom de classe,
-- message tronque, chemin SANS query ni hash, sha de build, famille
-- d'appareil, langue. Une ligne par (name, message, path, buildSha) et par
-- fenetre de 10 min, les repetitions incrementent `count`. Purge a 30 jours
-- par le planificateur (tache « tables »).
-- RGPD : aucune donnee personnelle — ni IP, ni compte, ni UA brut, ni query
-- string ; rien ici ne se rattache a une personne.
-- IF NOT EXISTS : rejouable sans risque si la table a deja ete posee.
-- Noms = ceux que Prisma genere (`migrate diff` depuis le schema du lot 4),
-- sinon un futur diff verrait un ecart entre la base et le schema.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "digest" TEXT,
    "path" TEXT NOT NULL,
    "buildSha" TEXT,
    "device" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientError_createdAt_idx" ON "ClientError"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientError_name_path_idx" ON "ClientError"("name", "path");
