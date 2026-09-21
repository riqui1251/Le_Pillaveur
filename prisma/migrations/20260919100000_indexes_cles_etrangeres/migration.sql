-- SQLite n'indexe pas les cles etrangeres. Chaque suppression de compte
-- (jusqu'a 100 par balayage de retention, cascade sur Session, ChatMessage,
-- OnlineRoomMember, OnlineRoom) lisait ces tables ENTIERES pour retrouver les
-- lignes de l'utilisateur ; les requetes chaudes aussi (`sessions: { none }`
-- du balayage des invites, « ma salle », purge des sessions echues).
-- @@unique(roomId, userId) sur OnlineRoomMember commence par roomId : il ne
-- couvre pas userId seul. Aucune donnee nouvelle, aucune ligne touchee.
-- IF NOT EXISTS : rejouable sans risque si un index a deja ete pose a la main.
-- Noms = ceux que Prisma genere pour @@index, sinon `migrate diff` verrait
-- un ecart entre la base et le schema.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_isGuest_lastSeenAt_idx" ON "User"("isGuest", "lastSeenAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnlineRoom_hostUserId_idx" ON "OnlineRoom"("hostUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnlineRoomMember_userId_idx" ON "OnlineRoomMember"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
