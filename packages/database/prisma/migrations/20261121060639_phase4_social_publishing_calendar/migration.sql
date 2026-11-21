-- AlterTable
ALTER TABLE "PublishAttempt" ADD COLUMN     "errorCategory" TEXT,
ADD COLUMN     "isSimulated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PublishPost" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "compositionId" TEXT,
ADD COLUMN     "contentType" TEXT NOT NULL DEFAULT 'VIDEO',
ADD COLUMN     "isSimulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "providerStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "connectionError" TEXT,
ADD COLUMN     "lastHealthCheckAt" TIMESTAMP(3),
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
