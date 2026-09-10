-- Visibilite de la table AU LANCEMENT, recopiee depuis OnlineRoom.visibility.
-- Le guichet public (/jeux) montre les 10 dernieres parties lancees : une
-- table qui n'etait pas publique n'y livre ni son jeu ni son effectif, exactement
-- comme le panneau des parties en cours. Les lignes deja journalisees valent
-- 'unknown' -- on ignore leur visibilite, donc on ne les detaille pas non plus.
ALTER TABLE "OnlineGameSession" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'unknown';
