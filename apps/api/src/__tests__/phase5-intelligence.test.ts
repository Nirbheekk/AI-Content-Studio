import { describe, expect, it } from 'vitest';
import { prisma } from '@ai-content-os/database';
import { buildApiServer } from '../server.js';

describe('@ai-content-os/api Phase 5 Analytics, Intelligence, Usage, Observability & Security', () => {
  const suffix = Date.now();

  it('runs Publish -> Collect (unavailable) -> Import -> Analytics -> Insights -> Export -> Quotas -> Security & Isolation', async () => {
    const app = await buildApiServer();
    const reg = async (tag: string) => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: `p5.${tag}.${suffix}@aicontent.studio`, password: 'Phase5Password!2026', fullName: `P5 ${tag}`, workspaceName: `P5 ${tag} WS` },
      });
      expect(r.statusCode).toBe(201);
      return (r.json() as { data: { accessToken: string; activeWorkspaceId: string; user: { id: string } } }).data;
    };
    const owner = await reg('owner');
    const outsider = await reg('outsider');
    const viewer = await reg('viewer');
    await prisma.workspaceMember.create({ data: { workspaceId: owner.activeWorkspaceId, userId: viewer.user.id, role: 'VIEWER' } });

    const H = (u: { accessToken: string }, ws: string) => ({ Authorization: `Bearer ${u.accessToken}`, 'X-Workspace-Id': ws });
    const ownerH = H(owner, owner.activeWorkspaceId);

    // Connect account & publish 4 posts (sandbox provider)
    const acc = await app.inject({
      method: 'POST', url: '/api/v1/publishing/accounts/connect', headers: ownerH,
      payload: { platform: 'LINKEDIN', code: 'code_li_p5', accountName: 'P5 LI', accountHandle: '@p5li' },
    });
    expect(acc.statusCode).toBe(201);
    const accountId = (acc.json() as { data: { account: { id: string } } }).data.account.id;

    const captions = [
      'Why do posts flop? Here is how to fix it.',
      'Why is retention low? Three fixes inside.',
      'Announcing a long product update for everyone reading this today',
      'Another long unremarkable status update post for everyone today',
    ];
    const postIds: string[] = [];
    for (const c of captions) {
      const r = await app.inject({
        method: 'POST', url: '/api/v1/publishing/posts', headers: ownerH,
        payload: { socialAccountId: accountId, contentType: 'WRITTEN', captionText: c, hashtags: ['ai'], publishImmediately: true, explicitApprovalConfirmed: true },
      });
      expect(r.statusCode).toBe(201);
      const post = (r.json() as { data: { post: { id: string; status: string } } }).data.post;
      expect(post.status).toBe('PUBLISHED');
      postIds.push(post.id);
    }

    // Collection on sandbox posts must NOT fabricate: all UNAVAILABLE
    const collect = await app.inject({ method: 'POST', url: '/api/v1/analytics/collect', headers: ownerH, payload: {} });
    expect(collect.statusCode).toBe(200);
    const cd = (collect.json() as { data: { liveProviderConfigured: boolean; results: Array<{ source: string; available: boolean }> } }).data;
    expect(cd.results).toHaveLength(4);
    expect(cd.results.every((x) => x.source === 'UNAVAILABLE' && !x.available)).toBe(true);

    const ov0 = await app.inject({ method: 'GET', url: '/api/v1/analytics/overview', headers: ownerH });
    const ov0d = (ov0.json() as { data: { overall: { totals: Record<string, number | null>; avgEngagementRate: number | null } } }).data;
    expect(ov0d.overall.totals['views']).toBeNull();
    expect(ov0d.overall.avgEngagementRate).toBeNull();

    // Insights with no usable data: only DATA_QUALITY evidence, no fabricated claims
    const ins0 = await app.inject({ method: 'POST', url: '/api/v1/analytics/insights', headers: ownerH, payload: {} });
    expect(ins0.statusCode).toBe(201);
    const ins0d = (ins0.json() as { data: { evidence: { insights: Array<{ type: string }>; sampleSize: number } } }).data;
    expect(ins0d.evidence.sampleSize).toBe(0);
    expect(ins0d.evidence.insights.every((i) => i.type === 'DATA_QUALITY')).toBe(true);

    // User-supplied import (labeled MANUAL_IMPORT) enables real aggregation
    const importRes = await app.inject({
      method: 'POST', url: '/api/v1/analytics/import', headers: ownerH,
      payload: {
        snapshots: [
          { publishPostId: postIds[0], impressions: 1000, likes: 120, comments: 10, shares: 10, views: 900 },
          { publishPostId: postIds[1], impressions: 1000, likes: 100, comments: 5, shares: 5, views: 800 },
          { publishPostId: postIds[2], impressions: 1000, likes: 10, comments: 1, shares: 0 },
          { publishPostId: postIds[3], impressions: 1000, likes: 5, comments: 0, shares: 0 },
        ],
      },
    });
    expect(importRes.statusCode).toBe(201);

    const ov = await app.inject({ method: 'GET', url: '/api/v1/analytics/overview', headers: ownerH });
    const ovd = (ov.json() as { data: { overall: { postCount: number; totals: Record<string, number | null>; avgEngagementRate: number }; platforms: unknown[]; posts: Array<{ source: string; metrics: Record<string, number | null> }> } }).data;
    expect(ovd.overall.totals['impressions']).toBe(4000);
    expect(ovd.overall.totals['reach']).toBeNull(); // never provided -> unavailable, not zero
    expect(ovd.overall.avgEngagementRate).toBeGreaterThan(0);
    expect(ovd.posts.every((p) => p.source === 'MANUAL_IMPORT')).toBe(true);

    const hist = await app.inject({ method: 'GET', url: `/api/v1/analytics/posts/${postIds[0]}`, headers: ownerH });
    expect((hist.json() as { data: { history: unknown[] } }).data.history).toHaveLength(2); // unavailable + import

    const ins = await app.inject({ method: 'POST', url: '/api/v1/analytics/insights', headers: ownerH, payload: {} });
    const insd = (ins.json() as { data: { evidence: { insights: Array<{ type: string; kind: string; basedOnPostIds: string[] }>; sampleSize: number }; aiSuggestions: { items: unknown[]; note: string } } }).data;
    expect(insd.evidence.sampleSize).toBe(4);
    expect(insd.evidence.insights.find((i) => i.type === 'TOP_PERFORMER')?.basedOnPostIds[0]).toBe(postIds[0]);
    expect(insd.evidence.insights.every((i) => i.kind === 'EVIDENCE')).toBe(true);
    expect(typeof insd.aiSuggestions.note).toBe('string');

    // CSV export
    const csv = await app.inject({ method: 'GET', url: '/api/v1/analytics/overview?format=csv', headers: ownerH });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.split('\n')[0]).toContain('engagementRate');

    // Import validation & RBAC & tenant isolation
    const badImport = await app.inject({ method: 'POST', url: '/api/v1/analytics/import', headers: ownerH, payload: { snapshots: [{ publishPostId: postIds[0], likes: -5 }] } });
    expect(badImport.statusCode).toBe(400);
    const viewerImport = await app.inject({ method: 'POST', url: '/api/v1/analytics/import', headers: H(viewer, owner.activeWorkspaceId), payload: { snapshots: [{ publishPostId: postIds[0], likes: 1 }] } });
    expect(viewerImport.statusCode).toBe(403);
    const viewerOv = await app.inject({ method: 'GET', url: '/api/v1/analytics/overview', headers: H(viewer, owner.activeWorkspaceId) });
    expect(viewerOv.statusCode).toBe(200);
    const crossWs = await app.inject({ method: 'GET', url: `/api/v1/analytics/posts/${postIds[0]}`, headers: H(outsider, owner.activeWorkspaceId) });
    expect(crossWs.statusCode).toBe(403);
    const crossPost = await app.inject({ method: 'GET', url: `/api/v1/analytics/posts/${postIds[0]}`, headers: H(outsider, outsider.activeWorkspaceId) });
    expect(crossPost.statusCode).toBe(404);
    const crossImport = await app.inject({ method: 'POST', url: '/api/v1/analytics/import', headers: H(outsider, outsider.activeWorkspaceId), payload: { snapshots: [{ publishPostId: postIds[0], likes: 1 }] } });
    expect(crossImport.statusCode).toBe(404);

    // Usage, quotas (enforced), invoices (ESTIMATED), admin metrics
    const usage0 = await app.inject({ method: 'GET', url: '/api/v1/usage', headers: ownerH });
    expect(usage0.statusCode).toBe(200);
    expect((usage0.json() as { data: { costDisclosure: string } }).data.costDisclosure).toContain('ESTIMATES');

    const viewerQuota = await app.inject({ method: 'PUT', url: '/api/v1/usage/quotas', headers: H(viewer, owner.activeWorkspaceId), payload: { monthlyTokenQuota: 10 } });
    expect(viewerQuota.statusCode).toBe(403);
    const setQuota = await app.inject({ method: 'PUT', url: '/api/v1/usage/quotas', headers: ownerH, payload: { monthlyTokenQuota: 1000, usageAlertThresholdPct: 50 } });
    expect(setQuota.statusCode).toBe(200);
    await prisma.usageRecord.create({ data: { workspaceId: owner.activeWorkspaceId, category: 'LLM_TOKENS', provider: 'test-ledger', quantity: BigInt(5000), estimatedCostUsd: 0.5 } });
    const usage1 = await app.inject({ method: 'GET', url: '/api/v1/usage', headers: ownerH });
    const u1 = (usage1.json() as { data: { statuses: Array<{ category: string; exceeded: boolean; alert: boolean }>; alerts: string[] } }).data;
    expect(u1.statuses.find((s) => s.category === 'LLM_TOKENS')?.exceeded).toBe(true);
    expect(u1.alerts.length).toBeGreaterThan(0);
    const blocked = await app.inject({ method: 'POST', url: '/api/v1/workflows/produce', headers: ownerH, payload: {} });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.body).toContain('quota exceeded');

    const inv = await app.inject({ method: 'POST', url: '/api/v1/billing/invoices/generate', headers: ownerH, payload: {} });
    expect(inv.statusCode).toBe(201);
    const invd = (inv.json() as { data: { invoice: { costKind: string; status: string }; disclosure: string } }).data;
    expect(invd.invoice.costKind).toBe('ESTIMATED');
    expect(invd.disclosure).toContain('nothing has been charged');

    const adminMetrics = await app.inject({ method: 'GET', url: '/api/v1/admin/metrics', headers: ownerH });
    expect(adminMetrics.statusCode).toBe(200);
    const am = (adminMetrics.json() as { data: { process: { requests: { total: number } }; publishing: Record<string, number>; queues: Record<string, unknown> } }).data;
    expect(am.process.requests.total).toBeGreaterThan(0);
    expect(am.publishing['PUBLISHED']).toBe(4);
    expect(Object.keys(am.queues).length).toBeGreaterThan(0);
    const viewerMetrics = await app.inject({ method: 'GET', url: '/api/v1/admin/metrics', headers: H(viewer, owner.activeWorkspaceId) });
    expect(viewerMetrics.statusCode).toBe(403);

    // Security: headers, CORS allowlist, query-token restriction, validation, readiness
    const health = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(health.statusCode).toBe(200);
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-frame-options']).toBe('DENY');
    const evilCors = await app.inject({ method: 'OPTIONS', url: '/api/v1/usage', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(evilCors.headers['access-control-allow-origin']).toBeUndefined();
    const okCors = await app.inject({ method: 'OPTIONS', url: '/api/v1/usage', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' } });
    expect(okCors.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const queryToken = await app.inject({ method: 'GET', url: `/api/v1/usage?accessToken=${owner.accessToken}&workspaceId=${owner.activeWorkspaceId}` });
    expect(queryToken.statusCode).toBe(401);
    const badStatus = await app.inject({ method: 'GET', url: '/api/v1/publishing/posts?status=BOGUS', headers: ownerH });
    expect(badStatus.statusCode).toBe(400);
    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/analytics/overview' });
    expect(noAuth.statusCode).toBe(401);

    // Account responses never leak credentials
    const accounts = await app.inject({ method: 'GET', url: '/api/v1/publishing/accounts', headers: ownerH });
    expect(accounts.body).not.toContain('encryptedAccessToken');
    expect(accounts.body).not.toContain('pzs_acc_');

    await app.close();
  });
});
