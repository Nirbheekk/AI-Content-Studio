import { describe, expect, it } from 'vitest';
import { buildApiServer } from '../server.js';

describe('@ai-content-os/api health endpoint', () => {
  it('returns 200 healthy when all dependencies report healthy', async () => {
    const app = await buildApiServer({
      checkPostgres: async () => ({ status: 'healthy', latencyMs: 3 }),
      checkRedis: async () => ({ status: 'healthy', latencyMs: 1 }),
      checkMinio: async () => ({ status: 'healthy', latencyMs: 2 }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      data: { status: string; dependencies: Record<string, { status: string }> };
    };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.dependencies['postgres']?.status).toBe('healthy');
    expect(body.data.dependencies['redis']?.status).toBe('healthy');
    expect(body.data.dependencies['minio']?.status).toBe('healthy');
    await app.close();
  });

  it('returns 503 unhealthy when all dependencies fail', async () => {
    const app = await buildApiServer({
      checkPostgres: async () => ({ status: 'unhealthy', latencyMs: 5, message: 'down' }),
      checkRedis: async () => ({ status: 'unhealthy', latencyMs: 5, message: 'down' }),
      checkMinio: async () => ({ status: 'unhealthy', latencyMs: 5, message: 'down' }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json() as { success: boolean; data: { status: string } };
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('unhealthy');
    await app.close();
  });

  it('probes live PostgreSQL 16, Redis 7, and MinIO containers via /api/health and /api/v1/status', async () => {
    const app = await buildApiServer();

    const healthRes = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(healthRes.statusCode).toBe(200);
    const healthBody = healthRes.json() as {
      success: boolean;
      data: {
        status: string;
        dependencies: {
          postgres: { status: string };
          redis: { status: string };
          minio: { status: string };
        };
      };
    };
    expect(healthBody.success).toBe(true);
    expect(healthBody.data.status).toBe('healthy');
    expect(healthBody.data.dependencies.postgres.status).toBe('healthy');
    expect(healthBody.data.dependencies.redis.status).toBe('healthy');
    expect(healthBody.data.dependencies.minio.status).toBe('healthy');

    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/status',
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = statusRes.json() as {
      success: boolean;
      data: { counts: { workspaces: number; projects: number; compositions: number } };
    };
    expect(statusBody.success).toBe(true);
    expect(statusBody.data.counts.workspaces).toBeGreaterThanOrEqual(1);
    expect(statusBody.data.counts.projects).toBeGreaterThanOrEqual(1);
    expect(statusBody.data.counts.compositions).toBeGreaterThanOrEqual(1);

    await app.close();
  });
});
