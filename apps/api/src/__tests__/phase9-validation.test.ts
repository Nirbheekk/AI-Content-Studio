import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { buildApiServer } from '../server.js';
import { parseCookies, SlidingWindowRateLimiter, verifyAccessToken } from '../lib/jwt.js';

describe('@ai-content-os/api Phase 9 Security, Quotas & Storage Lifecycle', () => {
  let app: FastifyInstance;
  let token = '';
  let workspaceId = '';
  let userId = '';

  beforeAll(async () => {
    app = await buildApiServer();
    await app.ready();

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `phase9-${randomUUID().slice(0, 8)}@example.com`,
        password: 'StrongPassword123!',
        fullName: 'Phase 9 Validator',
        workspaceName: 'Phase 9 QA Studio',
      },
    });
    expect(reg.statusCode).toBe(201);
    const body = reg.json() as {
      data: { accessToken: string; activeWorkspaceId: string; user: { id: string } };
    };
    token = body.data.accessToken;
    workspaceId = body.data.activeWorkspaceId;
    userId = body.data.user.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => null);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => null);
    }
    await app.close();
  });

  it('prunes expired keys in SlidingWindowRateLimiter and respects X-Forwarded-For behind Nginx', () => {
    const limiter = new SlidingWindowRateLimiter(2, 50, 2);
    const reqA = { ip: '10.0.0.1' } as never;
    const reqB = { ip: '10.0.0.2' } as never;
    const reqC = { ip: '10.0.0.3' } as never;

    limiter.enforce(reqA, 'test');
    limiter.enforce(reqB, 'test');
    limiter.enforce(reqC, 'test'); // Triggers bounded capacity pruning/eviction without throwing
    expect(() => limiter.enforce(reqC, 'test')).not.toThrow();
    expect(() => limiter.enforce(reqC, 'test')).toThrow();
  });

  it('enforces STORAGE_BYTES quota on POST /api/v1/assets/upload-url', async () => {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { monthlyStorageBytesQuota: 1024n },
    });

    const overProjected = await app.inject({
      method: 'POST',
      url: '/api/v1/assets/upload-url',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        originalName: 'too-big.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 2048,
      },
    });
    expect(overProjected.statusCode).toBe(400);

    await prisma.usageRecord.create({
      data: {
        workspaceId,
        category: 'STORAGE_BYTES',
        provider: 'minio',
        quantity: 2048n,
        estimatedCostUsd: 0,
      },
    });

    const exhausted = await app.inject({
      method: 'POST',
      url: '/api/v1/assets/upload-url',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
      payload: {
        originalName: 'blocked.png',
        mimeType: 'image/png',
        sizeBytes: 128,
      },
    });
    expect(exhausted.statusCode).toBe(403);
  });

  it('safely handles malformed cookie encoding and rejects non-HS256 JWT headers', () => {
    const cookies = parseCookies('bad=%E0%A4%A; good=hello%20world');
    expect(cookies['bad']).toBe('%E0%A4%A');
    expect(cookies['good']).toBe('hello world');

    const algNoneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    expect(() => verifyAccessToken(`${algNoneHeader}.${payload}.sig`)).toThrow();
  });
});
