-- AlterTable
ALTER TABLE "documents" ADD COLUMN "processingStatus" TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE "documents" ADD COLUMN "processingError" TEXT;
ALTER TABLE "documents" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "documents" ADD COLUMN "processedAt" TIMESTAMP(3);
