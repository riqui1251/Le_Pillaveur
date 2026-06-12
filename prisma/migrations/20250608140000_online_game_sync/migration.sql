-- Paramètres lobby (difficulté) + état de partie synchronisé + tour actif

ALTER TABLE "OnlineRoom" ADD COLUMN "settingsJson" TEXT;
ALTER TABLE "OnlineRoom" ADD COLUMN "gameStateJson" TEXT;
ALTER TABLE "OnlineRoom" ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OnlineRoom" ADD COLUMN "currentTurnUserId" TEXT;
