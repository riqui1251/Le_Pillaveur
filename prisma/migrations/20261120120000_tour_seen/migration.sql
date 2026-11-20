-- Tuto des nouveaux joueurs (20/11/2026).
-- Date a laquelle le compte a vu ou passe le tuto : le site ne le repropose
-- pas tout seul sur un autre appareil (la marque locale `lp-tour-seen` ne suit
-- pas le joueur d'un telephone a l'autre). Colonne nullable : aucun compte
-- existant n'est marque, rien a rattraper. Supprimee avec le compte.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tourSeenAt" DATETIME;
