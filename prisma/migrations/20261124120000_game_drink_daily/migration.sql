-- « Quel jeu fait le plus boire ? » tous joueurs confondus (24/11/2026).
-- GameDrinkDaily : gorgees et participations par jour de Paris, par jeu et
-- par mode ('local' | 'online'), sans aucune donnee personnelle (ni compte,
-- ni appareil, ni IP). Purge a 13 mois par retention-sweep, comme
-- LocalGameDaily. Table neuve : rien a rattraper, rien a reconstruire.
-- IF NOT EXISTS : rejouable sans risque.

-- CreateTable
CREATE TABLE IF NOT EXISTS "GameDrinkDaily" (
    "day" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "drinks" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "gameId", "mode")
);
