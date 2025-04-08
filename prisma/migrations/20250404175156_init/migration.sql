/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Session" DROP COLUMN "createdAt",
DROP COLUMN "expiresAt",
DROP COLUMN "isActive",
ADD COLUMN     "clusteredId" SERIAL NOT NULL,
ADD COLUMN     "otpExpiry" TIMESTAMP(3),
ADD COLUMN     "otpValue" TEXT,
ADD COLUMN     "otpVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refreshTokenExpiry" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sessionEnd" TIMESTAMP(3),
ADD COLUMN     "sessionStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sessionStatus" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
