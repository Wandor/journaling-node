-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "summary" TEXT,
ALTER COLUMN "title" DROP NOT NULL;
