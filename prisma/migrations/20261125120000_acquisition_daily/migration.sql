-- Provenance des visites (25/11/2026) : le site ne savait pas d'ou viennent
-- ses visiteurs. AcquisitionDaily compte les arrivees (1re vue d'une session
-- de navigateur, statistiques de visite acceptees) par jour de Paris, canal
-- (google, direct, autre...), hote d'origine (canaux 'autre' et 'app'
-- seulement), parametres utm et page d'arrivee. Aucun identifiant : ni
-- navigateur, ni IP, ni compte. Chaines vides plutot que NULL, pour que la cle
-- composite reste unique sous SQLite. La cle primaire commence par "day" : elle
-- sert d'index de date (lectures par periode, purge a 13 mois par
-- retention-sweep). Table neuve : aucune ligne existante touchee.
-- IF NOT EXISTS : rejouable sans risque.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AcquisitionDaily" (
    "day" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmMedium" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "landingPath" TEXT NOT NULL DEFAULT '',
    "visits" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "channel", "host", "utmSource", "utmMedium", "utmCampaign", "landingPath")
);
