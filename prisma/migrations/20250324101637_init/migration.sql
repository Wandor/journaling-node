-- DropIndex
DROP INDEX "Session_userId_key";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
