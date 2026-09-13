-- Motif de fermeture d'une partie journalisee : dit si sa duree est SURE
-- ('finished', 'rematch'), ESTIMEE ('left', 'staff', 'abandoned') ou INCONNUE
-- ('unknown' : salle disparue sans fermeture, endedAt = startedAt).
-- Jusqu'ici une partie non terminee etait datee a l'heure ou la Supervision
-- lisait le journal. Aucune donnee personnelle.
-- Pas de rattrapage : les lignes existantes restent a NULL = fiabilite inconnue.
ALTER TABLE "OnlineGameSession" ADD COLUMN "endReason" TEXT;
