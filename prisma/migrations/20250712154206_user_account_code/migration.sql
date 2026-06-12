-- AlterTable
ALTER TABLE "User" ADD COLUMN "accountCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_accountCode_key" ON "User"("accountCode");
