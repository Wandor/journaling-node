/*
  Warnings:

  - You are about to drop the column `twoFactorEnabled` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "twoFactorEnabled";

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
