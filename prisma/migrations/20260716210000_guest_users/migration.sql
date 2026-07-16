-- Comptes invités (rejoindre via QR sans inscription) : pseudo temporaire,
-- purgé après inactivité par le retention sweep.
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
