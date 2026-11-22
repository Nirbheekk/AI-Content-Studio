import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';

describe('Stage 7 — Client Collaboration, Secure Review Links, Version-Bound Approvals & Notifications', () => {
  let app: FastifyInstance;
  const storage = new MinioStorageAdapter();

  let tokenA = '';
  let workspaceA = '';
  let projectA = '';
  let compositionAId = '';
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
        email: `stage7-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage7 Agency A',
        workspaceName: `Stage7 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Client Approval Deliverable' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage7-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage7 Agency B',
        workspaceName: `Stage7 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;

    // Seed composition v1
    const compId = randomUUID();
    const verId = randomUUID();
    await prisma.composition.create({
      data: {
        id: compId,
        workspaceId: workspaceA,
        projectId: projectA,
        title: 'Client Launch Cut',
        targetPlatform: 'INSTAGRAM_REELS',
        aspectRatio: 'PORTRAIT_9_16',
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 300,
        currentVersionId: verId,
      },
    });
    await prisma.compositionVersion.create({
      data: {
        id: verId,
        compositionId: compId,
        versionNumber: 1,
        specJson: { schemaVersion: '1.0' },
        changeSummary: 'Initial cut v1',
        createdByType: 'USER',
      },
    });
    compositionAId = compId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces password-protected public review, timestamped comments, version-bound approval, revocation, and workspace isolation', async () => {
    // 1. Create password-protected review link
    const linkRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collaboration/review-links',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        compositionId: compositionAId,
        permission: 'APPROVE',
        password: 'client-secret',
        expiresInHours: 48,
      },
    });
    expect(linkRes.statusCode).toBe(201);
    const created = linkRes.json() as { data: { id: string; token: string; reviewPath: string } };
    expect(created.data.reviewPath).toContain('/review/');

    // 2. Access without password must return 401
    const noPw = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review/${created.data.token}`,
    });
    expect(noPw.statusCode).toBe(401);

    // 3. Access with password returns ONLY scoped public review (no workspaceId/members leaked)
    const okAccess = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review/${created.data.token}?password=client-secret`,
    });
    expect(okAccess.statusCode).toBe(200);
    const reviewPayload = okAccess.json() as {
      data: {
        workspaceId?: string;
        composition: { currentVersionNumber: number; isCurrentVersionApproved: boolean };
      };
    };
    expect(reviewPayload.data.workspaceId).toBeUndefined();
    expect(reviewPayload.data.composition.currentVersionNumber).toBe(1);
    expect(reviewPayload.data.composition.isCurrentVersionApproved).toBe(false);

    // 4. Client posts timestamped comment
    const commentRes = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review/${created.data.token}/comments`,
      payload: {
        reviewerName: 'Client Sarah',
        timestampSec: 4.5,
        body: 'Make the hook caption larger at 4.5s.',
        password: 'client-secret',
      },
    });
    expect(commentRes.statusCode).toBe(201);
    expect((commentRes.json() as { data: { frameIndex: number } }).data.frameIndex).toBe(135);

    // 5. Client approves v1 -> version-bound ApprovalRecord created
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review/${created.data.token}/decision`,
      payload: {
        reviewerName: 'Client Sarah',
        decision: 'APPROVED',
        notes: 'v1 looks great!',
        password: 'client-secret',
      },
    });
    expect(approveRes.statusCode).toBe(201);

    // 6. Verify v2 does NOT inherit v1 approval silently!
    const v2Id = randomUUID();
    await prisma.compositionVersion.create({
      data: {
        id: v2Id,
        compositionId: compositionAId,
        versionNumber: 2,
        specJson: { schemaVersion: '1.0' },
        changeSummary: 'Material revision v2',
        createdByType: 'USER',
      },
    });
    await prisma.composition.update({
      where: { id: compositionAId },
      data: { currentVersionId: v2Id },
    });

    const v2Access = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review/${created.data.token}?password=client-secret`,
    });
    const v2Body = v2Access.json() as {
      data: { composition: { currentVersionNumber: number; isCurrentVersionApproved: boolean } };
    };
    expect(v2Body.data.composition.currentVersionNumber).toBe(2);
    expect(v2Body.data.composition.isCurrentVersionApproved).toBe(false);

    // 7. Notifications recorded for workspace A
    const notifRes = await app.inject({
      method: 'GET',
      url: '/api/v1/collaboration/notifications',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(notifRes.statusCode).toBe(200);
    expect(
      (notifRes.json() as { data: { notifications: unknown[] } }).data.notifications.length,
    ).toBeGreaterThanOrEqual(2);

    // 8. Cross-workspace revoke must fail (404)
    const crossRevoke = await app.inject({
      method: 'POST',
      url: `/api/v1/collaboration/review-links/${created.data.id}/revoke`,
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
      payload: {},
    });
    expect(crossRevoke.statusCode).toBe(404);

    // 9. Owner revokes link -> subsequent public access returns 403
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/collaboration/review-links/${created.data.id}/revoke`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {},
    });
    expect(revokeRes.statusCode).toBe(200);

    const afterRevoke = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review/${created.data.token}?password=client-secret`,
    });
    expect(afterRevoke.statusCode).toBe(403);
  });
});
