-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('VIDEO', 'AUDIO', 'IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowStage" AS ENUM ('PENDING', 'ANALYZING', 'PLANNING', 'SCRIPTING', 'COMPOSING', 'RENDERING', 'REVIEWING', 'REVISING', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('CONTENT_INTELLIGENCE', 'CREATIVE_DIRECTOR', 'SCRIPTWRITER', 'VIDEO_EDITOR', 'MOTION_DESIGNER', 'RENDERING', 'QUALITY_ASSURANCE', 'PUBLISHING', 'ANALYTICS');

-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('PORTRAIT_9_16', 'LANDSCAPE_16_9', 'SQUARE_1_1', 'PORTRAIT_4_5');

-- CreateEnum
CREATE TYPE "TargetPlatform" AS ENUM ('INSTAGRAM_REELS', 'TIKTOK', 'YOUTUBE_SHORTS', 'YOUTUBE_LONG', 'LINKEDIN', 'X_TWITTER', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'RENDERING', 'EXTRACTING_FRAMES', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "planTier" TEXT NOT NULL DEFAULT 'PRO',
    "monthlyTokenQuota" INTEGER NOT NULL DEFAULT 5000000,
    "monthlyRenderMinutesQuota" INTEGER NOT NULL DEFAULT 300,
    "monthlyStorageBytesQuota" BIGINT NOT NULL DEFAULT 53687091200,
    "autoPublishApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "logoAssetId" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#6366F1',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0F172A',
    "accentColor" TEXT NOT NULL DEFAULT '#22D3EE',
    "headingFont" TEXT NOT NULL DEFAULT 'Inter',
    "bodyFont" TEXT NOT NULL DEFAULT 'Inter',
    "toneOfVoice" TEXT NOT NULL DEFAULT 'Authoritative, engaging, concise',
    "editingStyle" TEXT NOT NULL DEFAULT 'Fast-paced dynamic cuts with kinetic captions',
    "captionStyleJson" JSONB NOT NULL,
    "musicPreferences" JSONB NOT NULL,
    "targetAudience" TEXT,
    "contentObjectives" TEXT,
    "guidelinesText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "folderPath" TEXT NOT NULL DEFAULT '/',
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DOUBLE PRECISION,
    "status" "AssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "tags" TEXT[],
    "aiSummary" TEXT,
    "aiMetadataJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDerivative" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "derivativeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDerivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "fullText" TEXT NOT NULL,
    "segmentsJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetScene" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sceneIndex" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "thumbnailKey" TEXT,
    "description" TEXT,
    "hookScore" DOUBLE PRECISION,
    "isBroll" BOOLEAN NOT NULL DEFAULT false,
    "speakerLabels" TEXT[],
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agentName" TEXT,
    "content" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT,
    "initiatedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "stage" "WorkflowStage" NOT NULL DEFAULT 'PENDING',
    "currentAgent" "AgentType",
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "qaIterationCount" INTEGER NOT NULL DEFAULT 0,
    "maxQaIterations" INTEGER NOT NULL DEFAULT 3,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "planJson" JSONB,
    "scriptJson" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "totalTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stage" "WorkflowStage" NOT NULL,
    "agent" "AgentType",
    "status" TEXT NOT NULL,
    "inputJson" JSONB,
    "outputJson" JSONB,
    "errorText" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "agent" "AgentType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Composition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT,
    "title" TEXT NOT NULL,
    "targetPlatform" "TargetPlatform" NOT NULL,
    "aspectRatio" "AspectRatio" NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1080,
    "height" INTEGER NOT NULL DEFAULT 1920,
    "fps" INTEGER NOT NULL DEFAULT 30,
    "durationInFrames" INTEGER NOT NULL DEFAULT 900,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Composition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositionVersion" (
    "id" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "specJson" JSONB NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompositionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "compositionVersionId" TEXT NOT NULL,
    "workflowId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "outputStorageKey" TEXT,
    "outputSizeBytes" BIGINT,
    "durationMs" INTEGER,
    "qaFrameKeys" TEXT[],
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaInspection" (
    "id" TEXT NOT NULL,
    "renderJobId" TEXT NOT NULL,
    "workflowId" TEXT,
    "passed" BOOLEAN NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "defectsJson" JSONB NOT NULL,
    "patchInstructionsJson" JSONB,
    "inspectorProvider" TEXT NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "TargetPlatform" NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountHandle" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "renderJobId" TEXT,
    "workflowId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "platform" "TargetPlatform" NOT NULL,
    "captionText" TEXT NOT NULL,
    "hashtags" TEXT[],
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "externalPostUrl" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "metricsJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL,
    "publishPostId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseJson" JSONB,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referenceId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_workspaceId_key" ON "BrandKit"("workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_createdAt_idx" ON "Project"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_projectId_idx" ON "Asset"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_checksumSha256_idx" ON "Asset"("workspaceId", "checksumSha256");

-- CreateIndex
CREATE INDEX "AssetDerivative_assetId_idx" ON "AssetDerivative"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_assetId_key" ON "Transcript"("assetId");

-- CreateIndex
CREATE INDEX "AssetScene_assetId_sceneIndex_idx" ON "AssetScene"("assetId", "sceneIndex");

-- CreateIndex
CREATE INDEX "Conversation_projectId_createdAt_idx" ON "Conversation"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_idempotencyKey_key" ON "Workflow"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Workflow_workspaceId_projectId_stage_idx" ON "Workflow"("workspaceId", "projectId", "stage");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_startedAt_idx" ON "WorkflowStep"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_workflowId_agent_idx" ON "AgentRun"("workflowId", "agent");

-- CreateIndex
CREATE INDEX "Composition_workspaceId_projectId_idx" ON "Composition"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "CompositionVersion_compositionId_idx" ON "CompositionVersion"("compositionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompositionVersion_compositionId_versionNumber_key" ON "CompositionVersion"("compositionId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RenderJob_idempotencyKey_key" ON "RenderJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RenderJob_workspaceId_status_idx" ON "RenderJob"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "QaInspection_renderJobId_idx" ON "QaInspection"("renderJobId");

-- CreateIndex
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_workspaceId_platform_externalAccountId_key" ON "SocialAccount"("workspaceId", "platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishPost_idempotencyKey_key" ON "PublishPost"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PublishPost_workspaceId_scheduledFor_status_idx" ON "PublishPost"("workspaceId", "scheduledFor", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PublishAttempt_idempotencyKey_key" ON "PublishAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PublishAttempt_publishPostId_idx" ON "PublishAttempt"("publishPostId");

-- CreateIndex
CREATE INDEX "UsageRecord_workspaceId_category_recordedAt_idx" ON "UsageRecord"("workspaceId", "category", "recordedAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDerivative" ADD CONSTRAINT "AssetDerivative_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScene" ADD CONSTRAINT "AssetScene_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionVersion" ADD CONSTRAINT "CompositionVersion_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_compositionVersionId_fkey" FOREIGN KEY ("compositionVersionId") REFERENCES "CompositionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaInspection" ADD CONSTRAINT "QaInspection_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishPost" ADD CONSTRAINT "PublishPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishPost" ADD CONSTRAINT "PublishPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishPost" ADD CONSTRAINT "PublishPost_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_publishPostId_fkey" FOREIGN KEY ("publishPostId") REFERENCES "PublishPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
