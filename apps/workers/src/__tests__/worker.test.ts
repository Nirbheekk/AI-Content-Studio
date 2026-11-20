import { describe, expect, it } from 'vitest';
import {
  createWorkerHealthServer,
  getQueueNameForRole,
  processFoundationJob,
  resolveWorkerConfig,
} from '../runtime.js';

describe('@ai-content-os/workers runtime', () => {
  it('resolves role, queue name, and default health port accurately', () => {
    const cfg = resolveWorkerConfig({ WORKER_ROLE: 'rendering' });
    expect(cfg.role).toBe('rendering');
    expect(cfg.port).toBe(4013);
    expect(getQueueNameForRole(cfg.role)).toBe('render-queue');
  });

  it('processes a foundation job deterministically', async () => {
    const result = await processFoundationJob('orchestrator', {
      id: 'job-001',
      name: 'workflow.step',
      data: { workflowId: 'wf-123' },
    });
    expect(result.processedBy).toBe('orchestrator');
    expect(result.jobId).toBe('job-001');
  });

  it('serves HTTP 200 on /health endpoint', async () => {
    const server = createWorkerHealthServer('media', 'media-queue');
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; role: string; queueName: string };
    expect(body.success).toBe(true);
    expect(body.role).toBe('media');
    expect(body.queueName).toBe('media-queue');

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
