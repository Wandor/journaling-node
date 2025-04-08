/*
  Warnings:

  - You are about to drop the `EntryAnalytics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Sentiment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EntryAnalytics" DROP CONSTRAINT "EntryAnalytics_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "Sentiment" DROP CONSTRAINT "Sentiment_journalEntryId_fkey";

-- DropTable
DROP TABLE "EntryAnalytics";

-- DropTable
DROP TABLE "Sentiment";

-- CreateTable
CREATE TABLE "AnalyticsData" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "timeOfDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentimentScore" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "emotion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsData_journalId_key" ON "AnalyticsData"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "SentimentScore_journalId_key" ON "SentimentScore"("journalId");

-- AddForeignKey
ALTER TABLE "AnalyticsData" ADD CONSTRAINT "AnalyticsData_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentScore" ADD CONSTRAINT "SentimentScore_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
