import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';

describe('Stage 8 — Distribution Capabilities, Deliverable Validation, Rescheduling & Analytics Intelligence', () => {
  let app: FastifyInstance;
  const storage = new MinioStorageAdapter();

  let tokenA = '';
  let workspaceA = '';
  let projectA = '';
  let publishPostId = '';
  let compositionId = '';
  let tokenB = '';
  let workspaceB = '';

  beforeAll(async () => {
    app = await buildApiServer({ storage });
    await app.ready();

    const suffix = randomUUID().slice(0, 8);
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage8-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage8 Dist A',
        workspaceName: `Stage8 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Distribution Rollout' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage8-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage8 Dist B',
        workspaceName: `Stage8 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;

    const comp = await prisma.composition.create({
      data: {
        workspaceId: workspaceA,
        projectId: projectA,
        title: 'Unapproved Draft Cut',
        targetPlatform: 'INSTAGRAM_REELS',
        aspectRatio: 'PORTRAIT_9_16',
        approvalStatus: 'DRAFT',
      },
    });
    compositionId = comp.id;

    const acct = await prisma.socialAccount.create({
      data: {
        workspaceId: workspaceA,
        platform: 'INSTAGRAM_REELS',
        accountName: 'Studio Demo',
        accountHandle: '@studio-demo',
        externalAccountId: `ext-${suffix}`,
        encryptedAccessToken: 'encrypted-demo-token',
      },
    });

    const post = await prisma.publishPost.create({
      data: {
        workspaceId: workspaceA,
        socialAccountId: acct.id,
        idempotencyKey: `idem-stage8-${suffix}`,
        platform: 'INSTAGRAM_REELS',
        captionText: 'Launch teaser clip',
        hashtags: ['#launch'],
        status: 'SCHEDULED',
        scheduledFor: new Date(Date.now() + 86_400_000),
      },
    });
    publishPostId = post.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns all 6 social platform capabilities with honest integration state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/distribution/capabilities',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { platforms: Array<{ platform: string; maxCaptionChars: number }> };
    };
    expect(body.data.platforms).toHaveLength(6);
    const xSpec = body.data.platforms.find((p) => p.platform === 'X');
    expect(xSpec?.maxCaptionChars).toBe(280);
  });

  it('validates platform constraints and blocks unapproved compositions or oversized captions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/distribution/validate',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        platform: 'X',
        compositionId,
        aspectRatio: 'PORTRAIT_9_16',
        durationSec: 200, // exceeds 140s X limit
        caption: 'A'.repeat(300), // exceeds 280 char X limit
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { valid: boolean; blockingReasons: string[] } };
    expect(body.data.valid).toBe(false);
    expect(body.data.blockingReasons.length).toBeGreaterThanOrEqual(3);
  });

  it('persists timezone-aware rescheduling and enforces workspace isolation', async () => {
    const targetIso = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const crossWs = await app.inject({
      method: 'PATCH',
      url: `/api/v1/distribution/posts/${publishPostId}/reschedule`,
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
      payload: { scheduledFor: targetIso, timezone: 'America/New_York' },
    });
    expect(crossWs.statusCode).toBe(404);

    const ok = await app.inject({
      method: 'PATCH',
      url: `/api/v1/distribution/posts/${publishPostId}/reschedule`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { scheduledFor: targetIso, timezone: 'America/New_York' },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { data: { timezone: string } }).data.timezone).toBe('America/New_York');
  });

  it('imports provenance-labeled metrics and generates content intelligence without auto-modifying campaigns', async () => {
    // Low sample size initially
    const lowRes = await app.inject({
      method: 'GET',
      url: '/api/v1/distribution/intelligence',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(lowRes.statusCode).toBe(200);
    expect((lowRes.json() as { data: { confidenceLevel: string } }).data.confidenceLevel).toBe(
      'LOW_SAMPLE_SIZE',
    );

    // Import 2 authorized USER_IMPORTED snapshots
    for (const views of [1200, 2400]) {
      const imp = await app.inject({
        method: 'POST',
        url: '/api/v1/distribution/analytics/import',
        headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
        payload: {
          platform: 'INSTAGRAM_REELS',
          publishPostId,
          provenance: 'USER_IMPORTED',
          views,
          likes: Math.round(views * 0.08),
          comments: 15,
          shares: 25,
        },
      });
      expect(imp.statusCode).toBe(201);
    }

    const modRes = await app.inject({
      method: 'GET',
      url: '/api/v1/distribution/intelligence',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(modRes.statusCode).toBe(200);
    const intel = modRes.json() as {
      data: {
        sampleSize: number;
        confidenceLevel: string;
        autoCampaignModificationEnabled: boolean;
        provenanceBreakdown: { userImportedCount: number };
      };
    };
    expect(intel.data.sampleSize).toBe(2);
    expect(intel.data.confidenceLevel).toBe('MODERATE');
    expect(intel.data.provenanceBreakdown.userImportedCount).toBe(2);
    expect(intel.data.autoCampaignModificationEnabled).toBe(false);
  });
});
