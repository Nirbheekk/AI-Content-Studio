import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  CompleteAssetUploadSchema,
  detectMimeTypeFromMagicBytes,
  inferAssetTypeFromMime,
  ListAssetsQuerySchema,
  MAX_ASSET_SIZE_BYTES,
  NotFoundError,
  RequestUploadUrlSchema,
  sanitizeAssetFilename,
  sanitizeFolderPath,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { enqueueMediaProcessingJob } from '../lib/queues.js';
import { authorizeWorkspace } from '../middleware/auth.js';

export async function registerAssetRoutes(
  app: FastifyInstance,
  storage: MinioStorageAdapter = new MinioStorageAdapter(),
): Promise<void> {
  app.post('/api/v1/assets/upload-url', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = RequestUploadUrlSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid upload request payload', parsed.error.flatten());
    }

    const { originalName, mimeType, sizeBytes, projectId, folderPath, checksumSha256, tags } =
      parsed.data;

    let cleanFolder: string;
    try {
      cleanFolder = sanitizeFolderPath(folderPath);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Invalid folder path');
    }

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) {
        throw new NotFoundError('Project', projectId);
      }
    }

    await storage.ensureAllBuckets();
    const safeFilename = sanitizeAssetFilename(originalName);
    const assetId = randomUUID();
    const bucketName = storage.getConfig().rawBucket;
    const storageKey = `workspaces/${ctx.workspaceId}/projects/${projectId ?? 'unassigned'}/${assetId}-${safeFilename}`;
    const assetType = inferAssetTypeFromMime(mimeType);
    const initialChecksum =
      checksumSha256 ?? createHash('sha256').update(`${assetId}:${safeFilename}`).digest('hex');

    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        workspaceId: ctx.workspaceId,
        projectId: projectId ?? null,
        folderPath: cleanFolder,
        originalName: safeFilename,
        storageKey,
        bucketName,
        mimeType,
        assetType,
        sizeBytes: BigInt(sizeBytes),
        checksumSha256: initialChecksum,
        status: 'UPLOADING',
        tags,
      },
    });

    const uploadUrl = storage.createPresignedUrl({
      method: 'PUT',
      bucket: bucketName,
      storageKey,
      expiresInSec: 900,
      usePublicEndpoint: true,
    });

    return reply.status(201).send({
      success: true,
      data: {
        asset: {
          ...asset,
          sizeBytes: Number(asset.sizeBytes),
        },
        uploadUrl,
        directUploadPath: `/api/v1/assets/${asset.id}/upload`,
        expiresInSec: 900,
      },
    });
  });

  app.put('/api/v1/assets/:assetId/upload', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { assetId } = request.params as { assetId: string };

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, workspaceId: ctx.workspaceId },
    });
    if (!asset) {
      throw new NotFoundError('Asset', assetId);
    }

    const rawBody = request.body;
    let bodyBytes: Uint8Array;
    if (Buffer.isBuffer(rawBody)) {
      bodyBytes = new Uint8Array(rawBody);
    } else if (rawBody instanceof Uint8Array) {
      bodyBytes = rawBody;
    } else if (typeof rawBody === 'string') {
      bodyBytes = new Uint8Array(Buffer.from(rawBody, 'utf8'));
    } else {
      throw new ValidationError('Binary upload body is required');
    }

    if (bodyBytes.byteLength === 0 || bodyBytes.byteLength > MAX_ASSET_SIZE_BYTES) {
      throw new ValidationError(
        `Uploaded payload size (${bodyBytes.byteLength} bytes) is outside allowed bounds`,
      );
    }

    await storage.putObject({
      bucket: asset.bucketName,
      storageKey: asset.storageKey,
      body: bodyBytes,
      contentType: asset.mimeType,
    });

    const computedSha256 = createHash('sha256').update(bodyBytes).digest('hex');
    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        sizeBytes: BigInt(bodyBytes.byteLength),
        checksumSha256: computedSha256,
        status: 'UPLOADED',
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        ...updated,
        sizeBytes: Number(updated.sizeBytes),
      },
    });
  });

  app.post('/api/v1/assets/:assetId/complete', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { assetId } = request.params as { assetId: string };
    const parsed = CompleteAssetUploadSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid upload completion payload', parsed.error.flatten());
    }

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, workspaceId: ctx.workspaceId },
    });
    if (!asset) {
      throw new NotFoundError('Asset', assetId);
    }

    const headInfo = await storage.headObject({
      bucket: asset.bucketName,
      storageKey: asset.storageKey,
    });
    if (!headInfo.exists || headInfo.sizeBytes <= 0) {
      throw new ValidationError('Uploaded object was not found in MinIO storage');
    }

    if (headInfo.sizeBytes > MAX_ASSET_SIZE_BYTES) {
      await storage.deleteObject({ bucket: asset.bucketName, storageKey: asset.storageKey });
      throw new ValidationError('Uploaded object exceeds maximum allowed file size');
    }

    const headerBytes = await storage.getObjectHeaderBytes({
      bucket: asset.bucketName,
      storageKey: asset.storageKey,
      byteCount: 64,
    });

    const detectedMime = detectMimeTypeFromMagicBytes(headerBytes);
    if (!detectedMime) {
      await storage.deleteObject({ bucket: asset.bucketName, storageKey: asset.storageKey });
      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'FAILED' },
      });
      throw new ValidationError(
        'File failed magic-byte signature inspection and was rejected for security',
      );
    }

    const actualAssetType = inferAssetTypeFromMime(detectedMime);

    // Check duplicate by checksum in the same workspace
    const finalChecksum = parsed.data.checksumSha256 ?? asset.checksumSha256;
    const duplicate = await prisma.asset.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        checksumSha256: finalChecksum,
        id: { not: asset.id },
        status: 'READY',
      },
    });

    const finalized = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id: asset.id },
        data: {
          mimeType: detectedMime,
          assetType: actualAssetType,
          sizeBytes: BigInt(headInfo.sizeBytes),
          checksumSha256: finalChecksum,
          status: 'READY',
          ...(parsed.data.durationSec !== undefined
            ? { durationSec: parsed.data.durationSec }
            : {}),
          ...(parsed.data.width !== undefined ? { width: parsed.data.width } : {}),
          ...(parsed.data.height !== undefined ? { height: parsed.data.height } : {}),
          ...(parsed.data.fps !== undefined ? { fps: parsed.data.fps } : {}),
          ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
          aiMetadataJson: {
            magicByteVerified: true,
            detectedMime,
            isDuplicate: Boolean(duplicate),
            duplicateOfAssetId: duplicate?.id ?? null,
            extractedAt: new Date().toISOString(),
          },
        },
      });

      await tx.usageRecord.create({
        data: {
          workspaceId: ctx.workspaceId,
          category: 'STORAGE_BYTES',
          provider: 'minio',
          quantity: BigInt(headInfo.sizeBytes),
          estimatedCostUsd: 0,
          referenceId: updated.id,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'ASSET_UPLOAD_COMPLETED',
          entityType: 'Asset',
          entityId: updated.id,
          detailsJson: {
            originalName: updated.originalName,
            mimeType: updated.mimeType,
            sizeBytes: headInfo.sizeBytes,
          },
        },
      });

      return updated;
    });

    await enqueueMediaProcessingJob({
      workspaceId: ctx.workspaceId,
      assetId: finalized.id,
      storageKey: finalized.storageKey,
      mimeType: finalized.mimeType,
      idempotencyKey: `media-inspect-${finalized.id}`,
    });

    const downloadUrl = storage.createPresignedUrl({
      method: 'GET',
      bucket: finalized.bucketName,
      storageKey: finalized.storageKey,
      expiresInSec: 3600,
      usePublicEndpoint: true,
    });

    return reply.status(200).send({
      success: true,
      data: {
        ...finalized,
        sizeBytes: Number(finalized.sizeBytes),
        downloadUrl,
        isDuplicate: Boolean(duplicate),
      },
    });
  });

  app.get('/api/v1/assets', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsedQuery = ListAssetsQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      throw new ValidationError('Invalid asset query parameters', parsedQuery.error.flatten());
    }

    const { projectId, assetType, status, folderPath, search, page, pageSize } = parsedQuery.data;
    const whereClause = {
      workspaceId: ctx.workspaceId,
      ...(projectId ? { projectId } : {}),
      ...(assetType ? { assetType } : {}),
      ...(status ? { status } : {}),
      ...(folderPath ? { folderPath } : {}),
      ...(search
        ? {
            originalName: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.asset.count({ where: whereClause }),
      prisma.asset.findMany({
        where: whereClause,
        include: {
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: items.map((asset) => ({
        ...asset,
        sizeBytes: Number(asset.sizeBytes),
        downloadUrl:
          asset.status === 'READY' || asset.status === 'UPLOADED'
            ? storage.createPresignedUrl({
                method: 'GET',
                bucket: asset.bucketName,
                storageKey: asset.storageKey,
                expiresInSec: 3600,
                usePublicEndpoint: true,
              })
            : null,
      })),
      meta: {
        page,
        pageSize,
        total,
      },
    });
  });

  app.get('/api/v1/assets/:assetId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { assetId } = request.params as { assetId: string };

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, workspaceId: ctx.workspaceId },
      include: {
        project: { select: { id: true, name: true } },
        derivatives: true,
        transcript: true,
        scenes: { orderBy: { sceneIndex: 'asc' } },
      },
    });

    if (!asset) {
      throw new NotFoundError('Asset', assetId);
    }

    const downloadUrl = storage.createPresignedUrl({
      method: 'GET',
      bucket: asset.bucketName,
      storageKey: asset.storageKey,
      expiresInSec: 3600,
      usePublicEndpoint: true,
    });

    return reply.status(200).send({
      success: true,
      data: {
        ...asset,
        sizeBytes: Number(asset.sizeBytes),
        derivatives: asset.derivatives.map((d) => ({
          ...d,
          sizeBytes: Number(d.sizeBytes),
        })),
        downloadUrl,
      },
    });
  });

  app.delete('/api/v1/assets/:assetId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { assetId } = request.params as { assetId: string };

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, workspaceId: ctx.workspaceId },
    });
    if (!asset) {
      throw new NotFoundError('Asset', assetId);
    }

    await storage.deleteObject({
      bucket: asset.bucketName,
      storageKey: asset.storageKey,
    });

    await prisma.$transaction([
      prisma.asset.delete({ where: { id: asset.id } }),
      prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'ASSET_DELETED',
          entityType: 'Asset',
          entityId: asset.id,
          detailsJson: { originalName: asset.originalName },
        },
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: { deletedAssetId: asset.id },
    });
  });
}
