-- CreateTable
CREATE TABLE "ModerationTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "locale" TEXT,
    "note" TEXT,
    "addedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ModerationTerm_term_locale_key" ON "ModerationTerm"("term", "locale");

-- CreateIndex
CREATE INDEX "ModerationTerm_locale_idx" ON "ModerationTerm"("locale");
