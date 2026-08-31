-- Série quotidienne : jours consécutifs avec au moins une partie comptée
-- (bonus XP à la première partie du jour), dernier jour crédité (date Paris).
ALTER TABLE "User" ADD COLUMN "streakCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "streakLastDay" TEXT;
