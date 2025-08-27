/*
  Warnings:

  - You are about to drop the `discord_announcements` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `discord_guilds` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `manga_releases` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `manga_subscriptions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "discord_announcements";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "discord_guilds";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "manga_releases";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "manga_subscriptions";
PRAGMA foreign_keys=on;
