-- Date du dernier ping d'un navigateur fait AVEC une session valide.
-- SitePresence.userId n'est jamais remis a null : il garde le DERNIER compte vu
-- sur ce navigateur. Sans cette date, la Supervision affichait "diablo - En
-- ligne" pour un navigateur actif dont le compte etait deconnecte depuis deux
-- jours. Connecte sur ce navigateur = userSeenAt >= lastSeen (meme date, sans marge). Aucune
-- donnee nouvelle : une date sur une ligne deja declaree (SitePresence, 6 mois).
-- Les lignes existantes restent a NULL jusqu'au prochain ping connecte.
ALTER TABLE "SitePresence" ADD COLUMN "userSeenAt" DATETIME;
