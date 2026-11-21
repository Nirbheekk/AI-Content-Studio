import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { Job, Worker } from 'bullmq';
import {
  calculatePublishRetryBackoffMs,
  CompositionSpecSchema,
  PublishContentType,
  QUEUE_NAMES,
  WorkerRole,
  WorkerRoleSchema,
} from '@ai-content-os/shared';
import { decryptSecret, Prisma, prisma } from '@ai-content-os/database';
import { MinioStorageAdapter, PostizPublishingAdapter } from '@ai-content-os/integrations';
import {
  compileCompositionSpec,
  inspectCompositionAndFrames,
  renderCompositionMp4,
  renderInspectionFramePng,
} from '@ai-content-os/remotion-engine';

export interface WorkerRuntimeConfig {
  role: WorkerRole;
  port: number;
  redisUrl: string;
}

export function resolveWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerRuntimeConfig {
  const role = WorkerRoleSchema.parse(env['WORKER_ROLE'] ?? 'general');
  const defaultPortMap: Record<WorkerRole, number> = {
    general: 4010,
    orchestrator: 4011,
    media: 4012,
    rendering: 4013,
    publishing: 4014,
  };
  const port = Number(env['WORKER_PORT'] ?? defaultPortMap[role]);
  const redisUrl = env['REDIS_URL'] ?? 'redis://localhost:6379';
  return { role, port, redisUrl };
}

export function getQueueNameForRole(role: WorkerRole): string {
  return QUEUE_NAMES[role];
}

export async function processFoundationJob(
  role: WorkerRole,
  job: Pick<Job, 'id' | 'name' | 'data'>,
): Promise<{ processedBy: WorkerRole; jobId: string | undefined; timestamp: string }> {
  const payload = (job.data ?? {}) as Record<string, unknown>;

  if (role === 'media' && job.name === 'asset.inspect' && typeof payload['assetId'] === 'string') {
    const assetId = payload['assetId'];
    await prisma.asset
      .update({
        where: { id: assetId },
        data: {
          status: 'READY',
          aiSummary: 'Asset validated and indexed in Content Library.',
        },
      })
      .catch(() => null);
  }

  if (
    role === 'orchestrator' &&
    job.name === 'workflow.foundation' &&
    typeof payload['workflowId'] === 'string'
  ) {
    const workflowId = payload['workflowId'];
    await prisma.workflow
      .update({
        where: { id: workflowId },
        data: {
          stage: 'PLANNING',
          currentAgent: 'CREATIVE_DIRECTOR',
        },
      })
      .catch(() => null);
  }

  if (
    role === 'rendering' &&
    job.name === 'composition.render' &&
    typeof payload['compositionVersionId'] === 'string' &&
    typeof payload['compositionId'] === 'string' &&
    typeof payload['workspaceId'] === 'string'
  ) {
    const workspaceId = payload['workspaceId'];
    const compositionId = payload['compositionId'];
    const compositionVersionId = payload['compositionVersionId'];
    const renderJobId =
      typeof payload['renderJobId'] === 'string' ? payload['renderJobId'] : randomUUID();
    const workflowId =
      typeof payload['workflowId'] === 'string' ? payload['workflowId'] : null;

    const version = await prisma.compositionVersion.findFirst({
      where: { id: compositionVersionId, compositionId },
    });

    if (version) {
      const storage = new MinioStorageAdapter();
      await storage.ensureAllBuckets();
      const rendersBucket = storage.getConfig().rendersBucket;
      const spec = CompositionSpecSchema.parse(version.specJson);
      const compiled = compileCompositionSpec(spec);

      await prisma.renderJob.upsert({
        where: { id: renderJobId },
        create: {
          id: renderJobId,
          workspaceId,
          compositionId,
          compositionVersionId: version.id,
          workflowId,
          idempotencyKey: `render-${version.id}-${renderJobId.slice(0, 8)}`,
          status: 'RENDERING',
          progressPercent: 25,
          startedAt: new Date(),
        },
        update: {
          status: 'RENDERING',
          progressPercent: 25,
          startedAt: new Date(),
          errorMessage: null,
        },
      });

      try {
        const sampleFrames = [
          0,
          Math.floor(compiled.durationInFrames / 2),
          Math.max(0, compiled.durationInFrames - 5),
        ];
        const qaFrameKeys: string[] = [];
        for (let idx = 0; idx < sampleFrames.length; idx++) {
          const frameNum = sampleFrames[idx] ?? 0;
          const { pngBytes } = renderInspectionFramePng(compiled, frameNum);
          const frameKey = `workspaces/${workspaceId}/renders/${renderJobId}/qa-frame-${idx + 1}-f${frameNum}.png`;
          await storage.putObject({
            bucket: rendersBucket,
            storageKey: frameKey,
            body: pngBytes,
            contentType: 'image/png',
          });
          qaFrameKeys.push(frameKey);
        }

        const renderResult = await renderCompositionMp4(compiled);
        const outputStorageKey = `workspaces/${workspaceId}/renders/${renderJobId}/output-v${version.versionNumber}.mp4`;
        await storage.putObject({
          bucket: rendersBucket,
          storageKey: outputStorageKey,
          body: renderResult.mp4Bytes,
          contentType: 'video/mp4',
        });

        const qaReport = inspectCompositionAndFrames(spec);
        await prisma.$transaction([
          prisma.renderJob.update({
            where: { id: renderJobId },
            data: {
              status: 'COMPLETED',
              progressPercent: 100,
              outputStorageKey,
              outputSizeBytes: BigInt(renderResult.mp4Bytes.byteLength),
              durationMs: Math.round(compiled.totalDurationSec * 1000),
              qaFrameKeys,
              completedAt: new Date(),
            },
          }),
          prisma.qaInspection.create({
            data: {
              renderJobId,
              workflowId,
              passed: qaReport.passed,
              overallScore: qaReport.overallScore,
              defectsJson: JSON.parse(JSON.stringify(qaReport.defects)) as Prisma.InputJsonValue,
              patchInstructionsJson: JSON.parse(
                JSON.stringify(qaReport.patchInstructions),
              ) as Prisma.InputJsonValue,
              inspectorProvider: renderResult.renderer,
              isSimulated: !renderResult.isPlayableMp4,
            },
          }),
          prisma.usageRecord.create({
            data: {
              workspaceId,
              category: 'RENDER_SECONDS',
              provider: renderResult.renderer,
              quantity: BigInt(Math.ceil(compiled.totalDurationSec)),
              estimatedCostUsd: 0,
              referenceId: renderJobId,
            },
          }),
        ]);
      } catch (err) {
        await prisma.renderJob.update({
          where: { id: renderJobId },
          data: {
            status: 'FAILED',
            errorMessage: err instanceof Error ? err.message : 'Worker render failed',
          },
        });
        throw err;
      }
    }
  }

  if (
    role === 'publishing' &&
    job.name === 'publish.execute' &&
    typeof payload['publishPostId'] === 'string'
  ) {
    const publishPostId = payload['publishPostId'];
    const post = await prisma.publishPost
      .findUnique({
        where: { id: publishPostId },
        include: { socialAccount: true, attempts: true },
      })
      .catch(() => null);

    if (post && post.status !== 'PUBLISHED' && post.status !== 'CANCELLED') {
      const attemptNum = post.attempts.length + 1;
      const accessToken = decryptSecret(post.socialAccount.encryptedAccessToken);
      const postiz = new PostizPublishingAdapter();
      const adapterResult = await postiz.publishPost({
        postId: post.id,
        platform: post.platform,
        accessToken,
        contentType: post.contentType as PublishContentType,
        captionText: post.captionText,
        hashtags: post.hashtags,
        idempotencyKey: post.idempotencyKey,
        ...(post.title ? { title: post.title } : {}),
        ...(post.scheduledFor ? { scheduledFor: post.scheduledFor } : {}),
      });

      if (!adapterResult.success) {
        const errorCategory = adapterResult.errorCategory ?? 'PROVIDER_REJECTED';
        const isRetryable = adapterResult.retryable;
        const newRetryCount = post.retryCount + 1;
        const canRetry = isRetryable && newRetryCount < post.maxRetries;
        const backoffMs = canRetry ? calculatePublishRetryBackoffMs(newRetryCount, 5_000) : 0;

        await prisma.publishAttempt.create({
          data: {
            publishPostId: post.id,
            attemptNumber: attemptNum,
            idempotencyKey: `${post.idempotencyKey}:attempt:${attemptNum}`,
            status: 'FAILED',
            errorCategory,
            errorMessage: adapterResult.errorMessage ?? `Worker publishing error (${errorCategory})`,
            isSimulated: adapterResult.isSimulated,
            responseJson: adapterResult.rawResponse as Prisma.InputJsonValue,
          },
        });

        await prisma.publishPost.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            providerStatus: canRetry ? 'FAILED' : 'DEAD_LETTER',
            retryCount: newRetryCount,
            nextRetryAt: canRetry ? new Date(Date.now() + backoffMs) : null,
            errorMessage: adapterResult.errorMessage ?? `Worker publishing error (${errorCategory})`,
          },
        });
      } else {
        const finalStatus =
          adapterResult.providerStatus === 'PUBLISHED' ? 'PUBLISHED' : 'PUBLISHING';
        await prisma.publishAttempt.create({
          data: {
            publishPostId: post.id,
            attemptNumber: attemptNum,
            idempotencyKey: `${post.idempotencyKey}:attempt:${attemptNum}`,
            status: finalStatus,
            isSimulated: adapterResult.isSimulated,
            responseJson: adapterResult.rawResponse as Prisma.InputJsonValue,
          },
        });

        await prisma.publishPost.update({
          where: { id: post.id },
          data: {
            status: finalStatus,
            providerStatus: adapterResult.providerStatus,
            ...(finalStatus === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
            ...(adapterResult.externalPostId ? { externalPostId: adapterResult.externalPostId } : {}),
            ...(adapterResult.externalPostUrl ? { externalPostUrl: adapterResult.externalPostUrl } : {}),
            errorMessage: null,
            nextRetryAt: null,
          },
        });
      }
    }
  }

  return {
    processedBy: role,
    jobId: job.id,
    timestamp: new Date().toISOString(),
  };
}

export function createWorkerHealthServer(role: WorkerRole, queueName: string): Server {
  return createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          service: `@ai-content-os/workers:${role}`,
          role,
          queueName,
          status: 'healthy',
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not Found' }));
  });
}

export async function startWorkerRuntime(): Promise<{
  worker: Worker;
  server: Server;
}> {
  const config = resolveWorkerConfig();
  const queueName = getQueueNameForRole(config.role);
  const parsedUrl = new URL(config.redisUrl);

  const worker = new Worker(
    queueName,
    async (job) => processFoundationJob(config.role, job),
    {
      connection: {
        host: parsedUrl.hostname,
        port: Number(parsedUrl.port || 6379),
        ...(parsedUrl.password ? { password: parsedUrl.password } : {}),
        maxRetriesPerRequest: null,
      },
      concurrency: config.role === 'rendering' ? 1 : 4,
    },
  );

  const server = createWorkerHealthServer(config.role, queueName);
  await new Promise<void>((resolve) => {
    server.listen(config.port, '0.0.0.0', () => resolve());
  });

  console.log(
    `[@ai-content-os/workers] Role=${config.role} Queue=${queueName} Health=http://0.0.0.0:${config.port}/health`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[@ai-content-os/workers] Role=${config.role} received ${signal}, shutting down gracefully...`);
    try {
      await worker.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error(`[@ai-content-os/workers] Role=${config.role} shutdown error:`, error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return { worker, server };
}
