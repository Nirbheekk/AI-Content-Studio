import { EventEmitter } from 'node:events';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, WorkflowSseEvent } from '@ai-content-os/shared';

const WORKFLOW_REDIS_CHANNEL = 'aicos:workflow:events';

class WorkflowEventBus {
  private readonly emitter = new EventEmitter();
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private subInitialized = false;

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  private ensureSubscriber(): void {
    if (this.subInitialized || !process.env['REDIS_URL']) return;
    this.subInitialized = true;
    try {
      const sub = new Redis(process.env['REDIS_URL'], {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      sub.on('error', () => undefined);
      sub.on('message', (_channel, raw) => {
        try {
          const parsed = JSON.parse(raw) as WorkflowSseEvent;
          if (parsed?.workflowId) {
            this.emitter.emit(`workflow:${parsed.workflowId}`, parsed);
          }
        } catch {
          // Ignore malformed pubsub message
        }
      });
      void sub.connect().then(() => sub.subscribe(WORKFLOW_REDIS_CHANNEL)).catch(() => undefined);
      this.subClient = sub;
    } catch {
      // Fallback to local EventEmitter only
    }
  }

  public emitWorkflowEvent(event: WorkflowSseEvent): void {
    this.emitter.emit(`workflow:${event.workflowId}`, event);
    if (process.env['REDIS_URL']) {
      try {
        if (!this.pubClient) {
          this.pubClient = new Redis(process.env['REDIS_URL'], {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: true,
          });
          this.pubClient.on('error', () => undefined);
        }
        void this.pubClient.publish(WORKFLOW_REDIS_CHANNEL, JSON.stringify(event)).catch(() => undefined);
      } catch {
        // Best-effort Redis Pub/Sub
      }
    }
  }

  public subscribe(
    workflowId: string,
    listener: (event: WorkflowSseEvent) => void,
  ): () => void {
    this.ensureSubscriber();
    const channel = `workflow:${workflowId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  public async close(): Promise<void> {
    await Promise.all([
      this.pubClient?.quit().catch(() => undefined),
      this.subClient?.quit().catch(() => undefined),
    ]);
    this.pubClient = null;
    this.subClient = null;
  }
}

export const workflowEventBus = new WorkflowEventBus();

function createRedisConnectionConfig() {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: parsed.password } : {}),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  };
}

let mediaQueue: Queue | null = null;
let orchestratorQueue: Queue | null = null;
let publishingQueue: Queue | null = null;

export interface PublishingJobPayload {
  workspaceId: string;
  publishPostId: string;
  socialAccountId: string;
  platform: string;
  idempotencyKey: string;
  scheduledFor?: string | undefined;
  attemptNumber?: number | undefined;
}

export async function enqueuePublishingJob(
  payload: PublishingJobPayload,
  delayMs = 0,
): Promise<string | null> {
  try {
    if (!publishingQueue) {
      publishingQueue = new Queue(QUEUE_NAMES.publishing, {
        connection: createRedisConnectionConfig(),
      });
    }
    const safeDelay = Math.max(0, Math.round(delayMs));
    const jobId =
      payload.attemptNumber && payload.attemptNumber > 1
        ? `${payload.idempotencyKey}:retry:${payload.attemptNumber}`
        : payload.idempotencyKey;
    const job = await publishingQueue.add('publish.execute', payload, {
      jobId,
      delay: safeDelay,
      removeOnComplete: 200,
      removeOnFail: 200,
    });
    return job.id ?? null;
  } catch {
    return null;
  }
}

export async function cancelScheduledPublishingJob(idempotencyKey: string): Promise<boolean> {
  try {
    if (!publishingQueue) {
      publishingQueue = new Queue(QUEUE_NAMES.publishing, {
        connection: createRedisConnectionConfig(),
      });
    }
    const existing = await publishingQueue.getJob(idempotencyKey);
    if (existing) {
      await existing.remove();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function enqueueMediaProcessingJob(payload: {
  workspaceId: string;
  assetId: string;
  storageKey: string;
  mimeType: string;
  idempotencyKey: string;
}): Promise<string | null> {
  try {
    if (!mediaQueue) {
      mediaQueue = new Queue(QUEUE_NAMES.media, {
        connection: createRedisConnectionConfig(),
      });
    }
    const job = await mediaQueue.add('asset.inspect', payload, {
      jobId: payload.idempotencyKey,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    return job.id ?? null;
  } catch {
    return null;
  }
}

export async function enqueueOrchestratorWorkflowJob(payload: {
  workspaceId: string;
  projectId: string;
  workflowId: string;
  idempotencyKey: string;
}): Promise<string | null> {
  try {
    if (!orchestratorQueue) {
      orchestratorQueue = new Queue(QUEUE_NAMES.orchestrator, {
        connection: createRedisConnectionConfig(),
      });
    }
    const job = await orchestratorQueue.add('workflow.foundation', payload, {
      jobId: payload.idempotencyKey,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    return job.id ?? null;
  } catch {
    return null;
  }
}

export async function getQueueDepths(): Promise<
  Record<string, { available: boolean; waiting: number; active: number; delayed: number; failed: number }>
> {
  const out: Record<string, { available: boolean; waiting: number; active: number; delayed: number; failed: number }> = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    let q: Queue | null = null;
    try {
      q = new Queue(name, { connection: createRedisConnectionConfig() });
      const c = await q.getJobCounts('waiting', 'active', 'delayed', 'failed');
      out[name] = {
        available: true,
        waiting: c['waiting'] ?? 0,
        active: c['active'] ?? 0,
        delayed: c['delayed'] ?? 0,
        failed: c['failed'] ?? 0,
      };
    } catch {
      out[name] = { available: false, waiting: 0, active: 0, delayed: 0, failed: 0 };
    } finally {
      await q?.close().catch(() => null);
    }
  }
  return out;
}
