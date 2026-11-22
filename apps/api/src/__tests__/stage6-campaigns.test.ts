import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';

describe('Stage 6 — Autonomous Creative Campaigns & Production DAG', () => {
  let app: FastifyInstance;
  const storage = new MinioStorageAdapter();

  let tokenA = '';
  let workspaceA = '';
  let projectA = '';
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
        email: `stage6-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage6 Director A',
        workspaceName: `Stage6 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Q4 Product Launch' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage6-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage6 Director B',
        workspaceName: `Stage6 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('plans campaign from NL brief, blocks production before plan approval, executes DAG, and transitions to READY_TO_SCHEDULE after human approval', async () => {
    // 1. Create campaign from NL brief
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        briefText:
          'Create a 14-day launch campaign for our new product across Instagram Reels, YouTube Shorts, and LinkedIn. Keep tone confident and educational.',
        deliverableCount: 3,
        budgetCapUsd: 40,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as {
      data: {
        id: string;
        status: string;
        tasks: Array<{ id: string; nodeKey: string; status: string }>;
        deliverables: Array<{ id: string; hook: string; status: string }>;
      };
    };
    expect(created.data.status).toBe('AWAITING_PLAN_APPROVAL');
    expect(created.data.tasks).toHaveLength(8);
    expect(created.data.deliverables).toHaveLength(3);

    const campaignId = created.data.id;

    // 2. Production MUST be blocked before plan approval
    const blockedProd = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/produce`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {},
    });
    expect(blockedProd.statusCode).toBe(400);

    // 3. Cross-workspace access must be denied (404)
    const crossWs = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
    });
    expect(crossWs.statusCode).toBe(404);

    // 4. Approve plan -> status becomes PRODUCING
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/approve-plan`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {},
    });
    expect(approveRes.statusCode).toBe(200);
    expect((approveRes.json() as { data: { status: string } }).data.status).toBe('PRODUCING');

    // 5. Run production DAG -> creates editable compositions + Creative QA -> AWAITING_APPROVAL
    const prodRes = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/produce`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {},
    });
    expect(prodRes.statusCode).toBe(200);
    const produced = prodRes.json() as {
      data: {
        status: string;
        tasks: Array<{ id: string; status: string }>;
        deliverables: Array<{ id: string; compositionId: string | null; creativeQaScore: number | null }>;
      };
    };
    expect(produced.data.status).toBe('AWAITING_APPROVAL');
    expect(produced.data.tasks.every((t) => t.status === 'COMPLETED')).toBe(true);
    expect(produced.data.deliverables.every((d) => d.compositionId !== null)).toBe(true);
    expect(produced.data.deliverables.every((d) => (d.creativeQaScore ?? 0) >= 80)).toBe(true);

    // 6. Retry a DAG task safely (idempotent)
    const firstTaskId = produced.data.tasks[produced.data.tasks.length - 1]!.id;
    const retryRes = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/tasks/${firstTaskId}/retry`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {},
    });
    expect(retryRes.statusCode).toBe(200);

    // 7. Approve all deliverables -> transitions campaign to READY_TO_SCHEDULE (never auto-publishes)
    let latestStatus = 'AWAITING_APPROVAL';
    for (const deliv of produced.data.deliverables) {
      const dec = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/deliverables/${deliv.id}/decision`,
        headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
        payload: { decision: 'APPROVED' },
      });
      expect(dec.statusCode).toBe(200);
      latestStatus = (dec.json() as { data: { status: string } }).data.status;
    }
    expect(latestStatus).toBe('READY_TO_SCHEDULE');
  });
});
