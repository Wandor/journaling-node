/*
  Warnings:

  - You are about to drop the column `emotion` on the `SentimentScore` table. All the data in the column will be lost.
  - Added the required column `calculation` to the `SentimentScore` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mood` to the `SentimentScore` table without a default value. This is not possible if the table is not empty.
  - Added the required column `negativeWords` to the `SentimentScore` table without a default value. This is not possible if the table is not empty.
  - Added the required column `positiveWords` to the `SentimentScore` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SentimentScore" DROP COLUMN "emotion",
ADD COLUMN     "calculation" JSONB NOT NULL,
ADD COLUMN     "mood" TEXT NOT NULL,
ADD COLUMN     "negativeWords" TEXT NOT NULL,
ADD COLUMN     "positiveWords" TEXT NOT NULL;
