/*
  Warnings:

  - You are about to drop the column `categoryId` on the `JournalEntry` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_categoryId_fkey";

-- AlterTable
ALTER TABLE "JournalEntry" DROP COLUMN "categoryId";

-- CreateTable
CREATE TABLE "JournalEntryCategory" (
    "journalEntryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "JournalEntryCategory_pkey" PRIMARY KEY ("journalEntryId","categoryId")
);

-- AddForeignKey
ALTER TABLE "JournalEntryCategory" ADD CONSTRAINT "JournalEntryCategory_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryCategory" ADD CONSTRAINT "JournalEntryCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
