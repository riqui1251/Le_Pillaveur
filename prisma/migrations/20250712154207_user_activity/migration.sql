-- Dernière connexion et temps de présence estimé (pings analytics)
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "totalPresenceSeconds" INTEGER NOT NULL DEFAULT 0;
