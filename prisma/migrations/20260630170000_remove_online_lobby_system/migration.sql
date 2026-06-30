-- Supprime le système "online lobbies" (Système B) abandonné : moteur Socket.IO + tables non utilisées.
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OnlineLobby";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OnlineLobbyPlayer";
PRAGMA foreign_keys=on;
