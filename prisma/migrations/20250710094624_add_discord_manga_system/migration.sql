-- CreateTable
CREATE TABLE "discord_guilds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordGuildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "inviteLink" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "discord_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordGuildId" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorUsername" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" DATETIME NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "discord_announcements_discordGuildId_fkey" FOREIGN KEY ("discordGuildId") REFERENCES "discord_guilds" ("discordGuildId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "manga_releases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordAnnouncementId" TEXT,
    "title" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "url" TEXT,
    "site" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "releaseDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "manga_releases_discordAnnouncementId_fkey" FOREIGN KEY ("discordAnnouncementId") REFERENCES "discord_announcements" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "manga_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "manga_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_guilds_discordGuildId_key" ON "discord_guilds"("discordGuildId");

-- CreateIndex
CREATE UNIQUE INDEX "discord_announcements_discordMessageId_key" ON "discord_announcements"("discordMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "discord_announcements_discordGuildId_discordMessageId_key" ON "discord_announcements"("discordGuildId", "discordMessageId");

-- CreateIndex
CREATE INDEX "manga_releases_title_idx" ON "manga_releases"("title");

-- CreateIndex
CREATE INDEX "manga_releases_site_idx" ON "manga_releases"("site");

-- CreateIndex
CREATE INDEX "manga_releases_releaseDate_idx" ON "manga_releases"("releaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "manga_releases_title_chapter_site_key" ON "manga_releases"("title", "chapter", "site");

-- CreateIndex
CREATE UNIQUE INDEX "manga_subscriptions_userId_title_key" ON "manga_subscriptions"("userId", "title");
