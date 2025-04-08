/*
  Warnings:

  - Added the required column `averageSentenceLength` to the `AnalyticsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `categoriesCount` to the `AnalyticsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entryDate` to the `AnalyticsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `readingTime` to the `AnalyticsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sentenceCount` to the `AnalyticsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tagsCount` to the `AnalyticsData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AnalyticsData" ADD COLUMN     "averageSentenceLength" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "categoriesCount" INTEGER NOT NULL,
ADD COLUMN     "entryDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "readingTime" INTEGER NOT NULL,
ADD COLUMN     "sentenceCount" INTEGER NOT NULL,
ADD COLUMN     "tagsCount" INTEGER NOT NULL;
