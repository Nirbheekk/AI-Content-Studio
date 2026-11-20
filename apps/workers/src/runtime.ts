import { createServer, Server } from 'node:http';
import { Job, Worker } from 'bullmq';
import { QUEUE_NAMES, WorkerRole, WorkerRoleSchema } from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';

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

  return { worker, server };
}
