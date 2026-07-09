-- Mode Alcool / Soft : préférence de compte, filtre le catalogue de jeux en ligne.
ALTER TABLE "User" ADD COLUMN "ambianceMode" TEXT NOT NULL DEFAULT 'alcool';
