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
