-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "ipAddress" TEXT NOT NULL DEFAULT 'Unknown';
