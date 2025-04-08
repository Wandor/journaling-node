-- DropForeignKey
ALTER TABLE "JournalEntryCategory" DROP CONSTRAINT "JournalEntryCategory_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "JournalEntryTag" DROP CONSTRAINT "JournalEntryTag_journalEntryId_fkey";

-- AddForeignKey
ALTER TABLE "JournalEntryCategory" ADD CONSTRAINT "JournalEntryCategory_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryTag" ADD CONSTRAINT "JournalEntryTag_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
