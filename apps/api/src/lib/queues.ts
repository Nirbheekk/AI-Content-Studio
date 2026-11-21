import { EventEmitter } from 'node:events';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, WorkflowSseEvent } from '@ai-content-os/shared';

class WorkflowEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  public emitWorkflowEvent(event: WorkflowSseEvent): void {
    this.emitter.emit(`workflow:${event.workflowId}`, event);
  }

  public subscribe(
    workflowId: string,
    listener: (event: WorkflowSseEvent) => void,
  ): () => void {
    const channel = `workflow:${workflowId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
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
