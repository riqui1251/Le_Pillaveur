-- Briefing tuto synchronisé avant chaque partie : { startedAt, acks: string[] }.
ALTER TABLE "OnlineRoom" ADD COLUMN "briefingJson" TEXT;
