-- AlterTable
ALTER TABLE "Composition" ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT;

-- CreateTable
CREATE TABLE "CompositionComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "sceneId" TEXT,
    "frameIndex" INTEGER,
    "content" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompositionComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompositionComment_compositionId_versionNumber_idx" ON "CompositionComment"("compositionId", "versionNumber");

-- CreateIndex
CREATE INDEX "CompositionComment_workspaceId_idx" ON "CompositionComment"("workspaceId");

-- AddForeignKey
ALTER TABLE "CompositionComment" ADD CONSTRAINT "CompositionComment_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionComment" ADD CONSTRAINT "CompositionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
