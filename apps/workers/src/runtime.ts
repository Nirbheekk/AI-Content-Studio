import { createServer, Server } from 'node:http';
import { Job, Worker } from 'bullmq';
import {
  calculatePublishRetryBackoffMs,
  QUEUE_NAMES,
  WorkerRole,
  WorkerRoleSchema,
} from '@ai-content-os/shared';
import { decryptSecret, prisma } from '@ai-content-os/database';

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
      const isRevoked =
        accessToken.includes('REVOKED') ||
        post.captionText.includes('[SIMULATE_AUTH_REVOKED]') ||
        post.socialAccount.status === 'REVOKED';
      const isRateLimited = post.captionText.includes('[SIMULATE_RATE_LIMIT]');
      const isTransient = post.captionText.includes('[SIMULATE_TRANSIENT_ERROR]');

      if (isRevoked || isRateLimited || isTransient) {
        const errorCategory = isRevoked
          ? 'AUTH_REVOKED'
          : isRateLimited
            ? 'RATE_LIMIT'
            : 'TRANSIENT_NETWORK';
        const httpStatus = isRevoked ? 401 : isRateLimited ? 429 : 503;
        const newRetryCount = post.retryCount + 1;
        const canRetry = !isRevoked && newRetryCount < post.maxRetries;
        const backoffMs = canRetry ? calculatePublishRetryBackoffMs(newRetryCount, 5_000) : 0;

        await prisma.publishAttempt.create({
          data: {
            publishPostId: post.id,
            attemptNumber: attemptNum,
            idempotencyKey: `${post.idempotencyKey}:attempt:${attemptNum}`,
            status: 'FAILED',
            errorCategory,
            errorMessage: `Worker publishing error (${errorCategory})`,
            isSimulated: true,
            responseJson: { errorCategory, httpStatus },
          },
        });

        await prisma.publishPost.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            providerStatus: canRetry ? 'FAILED' : 'DEAD_LETTER',
            retryCount: newRetryCount,
            nextRetryAt: canRetry ? new Date(Date.now() + backoffMs) : null,
            errorMessage: `Worker publishing error (${errorCategory})`,
          },
        });
      } else {
        const externalPostId = `sim_postiz_${post.platform.toLowerCase()}_${post.idempotencyKey.slice(0, 14)}`;
        await prisma.publishAttempt.create({
          data: {
            publishPostId: post.id,
            attemptNumber: attemptNum,
            idempotencyKey: `${post.idempotencyKey}:attempt:${attemptNum}`,
            status: 'PUBLISHED',
            isSimulated: true,
            responseJson: {
              provider: 'postiz-sandbox-worker',
              httpStatus: 200,
              externalPostId,
              confirmedAt: new Date().toISOString(),
            },
          },
        });

        await prisma.publishPost.update({
          where: { id: post.id },
          data: {
            status: 'PUBLISHED',
            providerStatus: 'PUBLISHED',
            publishedAt: new Date(),
            externalPostId,
            externalPostUrl: `https://sandbox.postiz.local/${post.platform.toLowerCase()}/${externalPostId}`,
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
