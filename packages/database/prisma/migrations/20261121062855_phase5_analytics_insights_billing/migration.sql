-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "usageAlertThresholdPct" INTEGER NOT NULL DEFAULT 80;

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "publishPostId" TEXT NOT NULL,
    "platform" "TargetPlatform" NOT NULL,
    "source" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER,
    "impressions" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "watchTimeSec" DOUBLE PRECISION,
    "completionRate" DOUBLE PRECISION,
    "followerDelta" INTEGER,
    "unavailableMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unavailableReason" TEXT,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "suggestionsJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "planTier" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "costKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_workspaceId_collectedAt_idx" ON "AnalyticsSnapshot"("workspaceId", "collectedAt");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_publishPostId_collectedAt_idx" ON "AnalyticsSnapshot"("publishPostId", "collectedAt");

-- CreateIndex
CREATE INDEX "InsightReport_workspaceId_generatedAt_idx" ON "InsightReport"("workspaceId", "generatedAt");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_periodStart_idx" ON "Invoice"("workspaceId", "periodStart");

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_publishPostId_fkey" FOREIGN KEY ("publishPostId") REFERENCES "PublishPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightReport" ADD CONSTRAINT "InsightReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
