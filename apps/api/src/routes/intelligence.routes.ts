import type { FastifyInstance } from 'fastify';
import {
  AnalyticsQuerySchema,
  computeEngagementRate,
  computeEvidenceInsights,
  EstimateCostRequestSchema,
  evaluateQuota,
  ForbiddenError,
  ImportMetricsSchema,
  InsightPostInput,
  listUnavailableMetrics,
  METRIC_KEYS,
  NotFoundError,
  PROVIDER_PRICING_REGISTRY,
  QuotaStatus,
  SnapshotMetrics,
  UpdateQuotasSchema,
  UpsertBudgetPolicyRequestSchema,
  UsageCategory,
  ValidationError,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { PostizPublishingAdapter } from '@ai-content-os/integrations';
import { UnifiedAIProviderRegistry } from '@ai-content-os/ai-providers';
import { z } from 'zod';
import { authorizeWorkspace } from '../middleware/auth.js';
import { getQueueDepths } from '../lib/queues.js';
import { metrics } from '../lib/observability.js';
import {
  estimateWorkflowPreflightCost,
  getEffectiveBudgetPolicy,
  upsertBudgetPolicyForWorkspace,
} from '../services/cost-estimator.service.js';

const postiz = new PostizPublishingAdapter();

type SnapshotRow = Prisma.AnalyticsSnapshotGetPayload<object>;

function rowMetrics(s: SnapshotRow): SnapshotMetrics {
  return {
    views: s.views,
    impressions: s.impressions,
    reach: s.reach,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    watchTimeSec: s.watchTimeSec,
    completionRate: s.completionRate,
    followerDelta: s.followerDelta,
  };
}

function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function computeQuotaStatuses(workspaceId: string): Promise<{
  statuses: QuotaStatus[];
  usageByCategory: Record<string, { quantity: number; estimatedCostUsd: number }>;
  usageByProvider: Array<{ provider: string; category: string; quantity: number; estimatedCostUsd: number }>;
  workspace: { planTier: string; usageAlertThresholdPct: number };
}> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const records = await prisma.usageRecord.findMany({
    where: { workspaceId, recordedAt: { gte: monthStart() } },
  });
  const usageByCategory: Record<string, { quantity: number; estimatedCostUsd: number }> = {};
  const byProvider = new Map<string, { provider: string; category: string; quantity: number; estimatedCostUsd: number }>();
  for (const r of records) {
    const c = usageByCategory[r.category] ?? { quantity: 0, estimatedCostUsd: 0 };
    c.quantity += Number(r.quantity);
    c.estimatedCostUsd += r.estimatedCostUsd;
    usageByCategory[r.category] = c;
    const k = `${r.provider}|${r.category}`;
    const p = byProvider.get(k) ?? { provider: r.provider, category: r.category, quantity: 0, estimatedCostUsd: 0 };
    p.quantity += Number(r.quantity);
    p.estimatedCostUsd += r.estimatedCostUsd;
    byProvider.set(k, p);
  }
  const limits: Record<string, number> = {
    LLM_TOKENS: ws.monthlyTokenQuota,
    RENDER_SECONDS: ws.monthlyRenderMinutesQuota * 60,
    STORAGE_BYTES: Number(ws.monthlyStorageBytesQuota),
  };
  const statuses = Object.entries(limits).map(([cat, limit]) =>
    evaluateQuota(cat as UsageCategory, usageByCategory[cat]?.quantity ?? 0, limit, ws.usageAlertThresholdPct),
  );
  return {
    statuses,
    usageByCategory,
    usageByProvider: [...byProvider.values()],
    workspace: { planTier: ws.planTier, usageAlertThresholdPct: ws.usageAlertThresholdPct },
  };
}

/** Throws 403 when the workspace has exhausted a monthly quota. */
export async function assertQuotaAvailable(workspaceId: string, category: UsageCategory): Promise<void> {
  const { statuses } = await computeQuotaStatuses(workspaceId);
  const s = statuses.find((x) => x.category === category);
  if (s?.exceeded) {
    metrics.raiseAlert('WARNING', 'quota', `Workspace ${workspaceId.slice(0, 8)} exceeded ${category} quota`);
    throw new ForbiddenError(
      `Monthly ${category} quota exceeded (${s.used} / ${s.limit}). Raise the quota or wait for the next billing period.`,
    );
  }
}

async function latestSnapshotsInRange(workspaceId: string, from: Date, to: Date, platform?: string) {
  const snaps = await prisma.analyticsSnapshot.findMany({
    where: {
      workspaceId,
      collectedAt: { gte: from, lte: to },
      ...(platform ? { platform: platform as never } : {}),
    },
    orderBy: { collectedAt: 'desc' },
  });
  const latest = new Map<string, SnapshotRow>();
  for (const s of snaps) if (!latest.has(s.publishPostId)) latest.set(s.publishPostId, s);
  return { latest, all: snaps };
}

function sumMetric(rows: SnapshotRow[], key: keyof SnapshotMetrics): number | null {
  const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
}

function summarize(rows: SnapshotRow[]) {
  const totals: Record<string, number | null> = {};
  for (const k of METRIC_KEYS) totals[k] = sumMetric(rows, k);
  const ers = rows
    .map((r) => computeEngagementRate(rowMetrics(r)))
    .filter((v): v is number => v !== null);
  return {
    postCount: rows.length,
    totals,
    avgEngagementRate: ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null,
    postsWithEngagementData: ers.length,
  };
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralize spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function registerIntelligenceRoutes(app: FastifyInstance): Promise<void> {
  // ---- Readiness (public, no secrets) ----
  app.get('/api/ready', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.status(200).send({ success: true, data: { ready: true } });
    } catch {
      return reply.status(503).send({ success: false, error: { code: 'NOT_READY', message: 'Database unavailable' } });
    }
  });

  // ---- Analytics collection from provider (never fabricates) ----
  app.post('/api/v1/analytics/collect', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const posts = await prisma.publishPost.findMany({
      where: { workspaceId, status: 'PUBLISHED' },
      take: 200,
    });
    const results: Array<{ postId: string; source: string; available: boolean; reason?: string | undefined }> = [];
    let rateLimited = false;
    for (const post of posts) {
      if (rateLimited) {
        results.push({ postId: post.id, source: 'UNAVAILABLE', available: false, reason: 'Skipped after provider rate limit.' });
        continue;
      }
      if (post.isSimulated || !post.externalPostId) {
        await prisma.analyticsSnapshot.create({
          data: {
            workspaceId,
            publishPostId: post.id,
            platform: post.platform,
            source: 'UNAVAILABLE',
            unavailableMetrics: [...METRIC_KEYS],
            unavailableReason: 'Post was published in the simulated sandbox; no real provider post exists to measure.',
          },
        });
        results.push({ postId: post.id, source: 'UNAVAILABLE', available: false, reason: 'simulated post' });
        continue;
      }
      const res = await postiz.fetchPostMetrics({ platform: post.platform, externalPostId: post.externalPostId });
      rateLimited = Boolean(res.rateLimited);
      const m = res.metrics;
      const row: SnapshotMetrics = {
        views: m['views'] ?? null,
        impressions: m['impressions'] ?? null,
        reach: m['reach'] ?? null,
        likes: m['likes'] ?? null,
        comments: m['comments'] ?? null,
        shares: m['shares'] ?? null,
        watchTimeSec: m['watchTimeSec'] ?? null,
        completionRate: m['completionRate'] ?? null,
        followerDelta: m['followerDelta'] ?? null,
      };
      await prisma.analyticsSnapshot.create({
        data: {
          workspaceId,
          publishPostId: post.id,
          platform: post.platform,
          source: res.available ? 'POSTIZ_API' : 'UNAVAILABLE',
          ...row,
          unavailableMetrics: listUnavailableMetrics(row),
          unavailableReason: res.reason ?? null,
        },
      });
      results.push({ postId: post.id, source: res.available ? 'POSTIZ_API' : 'UNAVAILABLE', available: res.available, reason: res.reason });
    }
    return reply.status(200).send({
      success: true,
      data: { attempted: posts.length, collectedAt: new Date().toISOString(), liveProviderConfigured: postiz.isLiveConfigured(), results },
    });
  });

  // ---- Manual metric import (user-supplied, labeled MANUAL_IMPORT) ----
  app.post('/api/v1/analytics/import', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const parsed = z.object({ snapshots: z.array(ImportMetricsSchema).min(1).max(500) }).safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid analytics import payload', parsed.error.flatten());
    let created = 0;
    for (const s of parsed.data.snapshots) {
      const post = await prisma.publishPost.findFirst({ where: { id: s.publishPostId, workspaceId } });
      if (!post) throw new NotFoundError('PublishPost', s.publishPostId);
      if (post.status !== 'PUBLISHED') throw new ValidationError(`Post ${post.id} is not PUBLISHED; metrics cannot exist yet.`);
      const row: SnapshotMetrics = {
        views: s.views ?? null,
        impressions: s.impressions ?? null,
        reach: s.reach ?? null,
        likes: s.likes ?? null,
        comments: s.comments ?? null,
        shares: s.shares ?? null,
        watchTimeSec: s.watchTimeSec ?? null,
        completionRate: s.completionRate ?? null,
        followerDelta: s.followerDelta ?? null,
      };
      await prisma.analyticsSnapshot.create({
        data: {
          workspaceId,
          publishPostId: post.id,
          platform: post.platform,
          source: 'MANUAL_IMPORT',
          collectedAt: s.collectedAt ? new Date(s.collectedAt) : new Date(),
          ...row,
          unavailableMetrics: listUnavailableMetrics(row),
        },
      });
      created += 1;
    }
    await prisma.auditLog.create({
      data: { workspaceId, userId, action: 'ANALYTICS_IMPORTED', entityType: 'AnalyticsSnapshot', entityId: workspaceId, detailsJson: { count: created } },
    });
    return reply.status(201).send({ success: true, data: { created, source: 'MANUAL_IMPORT' } });
  });

  // ---- Overview / platform / campaign / post analytics, JSON or CSV export ----
  app.get('/api/v1/analytics/overview', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const q = AnalyticsQuerySchema.safeParse(request.query ?? {});
    if (!q.success) throw new ValidationError('Invalid analytics query', q.error.flatten());
    const to = q.data.to ? new Date(q.data.to) : new Date();
    const from = q.data.from ? new Date(q.data.from) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);

    const { latest, all } = await latestSnapshotsInRange(workspaceId, from, to, q.data.platform);
    const postIds = [...latest.keys()];
    const posts = await prisma.publishPost.findMany({ where: { id: { in: postIds }, workspaceId } });
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const compIds = [...new Set(posts.map((p) => p.compositionId).filter((x): x is string => Boolean(x)))];
    const comps = await prisma.composition.findMany({ where: { id: { in: compIds }, workspaceId }, include: { project: true } });
    const compMap = new Map(comps.map((c) => [c.id, c]));

    const latestRows = [...latest.values()];
    const perPost = latestRows.map((s) => {
      const p = postMap.get(s.publishPostId);
      const m = rowMetrics(s);
      return {
        publishPostId: s.publishPostId,
        platform: s.platform,
        title: p?.title ?? null,
        caption: p?.captionText.slice(0, 120) ?? '',
        publishedAt: p?.publishedAt?.toISOString() ?? null,
        source: s.source,
        collectedAt: s.collectedAt.toISOString(),
        metrics: m,
        engagementRate: computeEngagementRate(m),
        unavailableMetrics: listUnavailableMetrics(m),
        unavailableReason: s.unavailableReason,
      };
    });

    const platforms = [...new Set(latestRows.map((r) => r.platform))].map((pl) => ({
      platform: pl,
      ...summarize(latestRows.filter((r) => r.platform === pl)),
    }));

    const campaignGroups = new Map<string, SnapshotRow[]>();
    for (const s of latestRows) {
      const p = postMap.get(s.publishPostId);
      const name = (p?.compositionId && compMap.get(p.compositionId)?.project.name) || 'Uncategorized';
      campaignGroups.set(name, [...(campaignGroups.get(name) ?? []), s]);
    }
    const campaigns = [...campaignGroups.entries()].map(([name, rows]) => ({ campaign: name, ...summarize(rows) }));

    // Daily trend: for each day, sum of snapshots collected that day (non-null only)
    const byDay = new Map<string, SnapshotRow[]>();
    for (const s of all) {
      const day = s.collectedAt.toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), s]);
    }
    const trend = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => ({ date, ...summarize(rows) }));

    if (q.data.format === 'csv') {
      const header = ['publishPostId', 'platform', 'title', 'publishedAt', 'source', 'collectedAt', ...METRIC_KEYS, 'engagementRate', 'unavailableReason'];
      const lines = [header.join(',')];
      for (const r of perPost) {
        lines.push(
          [r.publishPostId, r.platform, r.title, r.publishedAt, r.source, r.collectedAt, ...METRIC_KEYS.map((k) => r.metrics[k]), r.engagementRate, r.unavailableReason]
            .map(csvEscape)
            .join(','),
        );
      }
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="analytics-report.csv"')
        .send(lines.join('\n'));
    }

    return reply.status(200).send({
      success: true,
      data: {
        range: { from: from.toISOString(), to: to.toISOString() },
        liveProviderConfigured: postiz.isLiveConfigured(),
        overall: summarize(latestRows),
        platforms,
        campaigns,
        trend,
        posts: perPost,
        notes: 'Metrics set to null are unavailable from the provider and are never estimated.',
      },
    });
  });

  app.get('/api/v1/analytics/posts/:postId', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const { postId } = request.params as { postId: string };
    const post = await prisma.publishPost.findFirst({ where: { id: postId, workspaceId } });
    if (!post) throw new NotFoundError('PublishPost', postId);
    const snaps = await prisma.analyticsSnapshot.findMany({
      where: { publishPostId: postId, workspaceId },
      orderBy: { collectedAt: 'asc' },
    });
    return reply.status(200).send({
      success: true,
      data: {
        postId,
        platform: post.platform,
        history: snaps.map((s) => ({
          id: s.id,
          source: s.source,
          collectedAt: s.collectedAt.toISOString(),
          metrics: rowMetrics(s),
          engagementRate: computeEngagementRate(rowMetrics(s)),
          unavailableMetrics: s.unavailableMetrics,
          unavailableReason: s.unavailableReason,
        })),
      },
    });
  });

  // ---- Content intelligence ----
  app.post('/api/v1/analytics/insights', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 3600 * 1000);
    const { latest } = await latestSnapshotsInRange(workspaceId, from, to);
    const posts = await prisma.publishPost.findMany({
      where: { id: { in: [...latest.keys()] }, workspaceId },
    });
    const inputs: InsightPostInput[] = posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      contentType: p.contentType,
      title: p.title,
      captionText: p.captionText,
      hashtags: p.hashtags,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      metrics: rowMetrics(latest.get(p.id) as SnapshotRow),
    }));
    const evidence = computeEvidenceInsights(inputs);

    // AI suggestions: only with live LLM credentials; always labeled AI_SUGGESTION and never presented as evidence.
    const registry = new UnifiedAIProviderRegistry();
    const aiStatus = registry.getConfiguredProviderStatus();
    let suggestions: Array<{ kind: 'AI_SUGGESTION'; text: string }> = [];
    let aiNote = 'Live LLM credentials not configured; no AI suggestions generated.';
    if (aiStatus.hasLiveLlmCredentials && evidence.insights.length > 0) {
      try {
        const out = await registry.generateStructured({
          agentName: 'ANALYTICS',
          systemPrompt:
            'You are a social content strategist. Using ONLY the evidence provided, propose 3-5 concrete content recommendations. Do not invent metrics.',
          userPrompt: JSON.stringify(evidence.insights.map((i) => i.summary)),
          schema: z.object({ recommendations: z.array(z.string().min(5).max(400)).max(6) }),
          fallbackFactory: () => ({ recommendations: [] }),
        });
        if (!out.telemetry.isSimulated) {
          suggestions = out.data.recommendations.map((text) => ({ kind: 'AI_SUGGESTION' as const, text }));
          aiNote = `Generated by ${out.telemetry.provider}/${out.telemetry.model}. Suggestions are hypotheses, not measured results.`;
        }
      } catch (err) {
        aiNote = `AI suggestion generation failed: ${err instanceof Error ? err.message : 'unknown error'}`;
      }
    }

    const report = await prisma.insightReport.create({
      data: {
        workspaceId,
        rangeStart: from,
        rangeEnd: to,
        evidenceJson: evidence as unknown as Prisma.InputJsonValue,
        suggestionsJson: { suggestions, aiNote } as unknown as Prisma.InputJsonValue,
      },
    });
    return reply.status(201).send({
      success: true,
      data: {
        id: report.id,
        generatedAt: report.generatedAt.toISOString(),
        evidence,
        aiSuggestions: { items: suggestions, note: aiNote },
        legend: 'EVIDENCE = computed from stored metric snapshots. AI_SUGGESTION = model-generated hypothesis.',
      },
    });
  });

  app.get('/api/v1/analytics/insights', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const reports = await prisma.insightReport.findMany({ where: { workspaceId }, orderBy: { generatedAt: 'desc' }, take: 10 });
    return reply.status(200).send({
      success: true,
      data: {
        reports: reports.map((r) => ({
          id: r.id,
          generatedAt: r.generatedAt.toISOString(),
          evidence: r.evidenceJson,
          suggestions: r.suggestionsJson,
        })),
      },
    });
  });

  // ---- Usage, quotas, billing foundations ----
  app.get('/api/v1/usage', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const q = await computeQuotaStatuses(workspaceId);
    return reply.status(200).send({
      success: true,
      data: {
        periodStart: monthStart().toISOString(),
        ...q,
        alerts: q.statuses.filter((s) => s.alert).map((s) => `${s.category} at ${s.percentUsed}% of quota`),
        costDisclosure: 'All costs are ESTIMATES derived from token/duration counts. They are not confirmed provider charges.',
      },
    });
  });

  app.put('/api/v1/usage/quotas', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const parsed = UpdateQuotasSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid quota update', parsed.error.flatten());
    const data = parsed.data;
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(data.monthlyTokenQuota !== undefined ? { monthlyTokenQuota: data.monthlyTokenQuota } : {}),
        ...(data.monthlyRenderMinutesQuota !== undefined ? { monthlyRenderMinutesQuota: data.monthlyRenderMinutesQuota } : {}),
        ...(data.usageAlertThresholdPct !== undefined ? { usageAlertThresholdPct: data.usageAlertThresholdPct } : {}),
        ...(data.planTier !== undefined ? { planTier: data.planTier } : {}),
      },
    });
    await prisma.auditLog.create({
      data: { workspaceId, userId, action: 'QUOTAS_UPDATED', entityType: 'Workspace', entityId: workspaceId, detailsJson: data },
    });
    return reply.status(200).send({ success: true, data: await computeQuotaStatuses(workspaceId) });
  });

  const PLAN_BASE_USD: Record<string, number> = { FREE: 0, PRO: 49, BUSINESS: 199 };

  app.post('/api/v1/billing/invoices/generate', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const q = await computeQuotaStatuses(workspaceId);
    const usageCost = Object.values(q.usageByCategory).reduce((a, c) => a + c.estimatedCostUsd, 0);
    const base = PLAN_BASE_USD[q.workspace.planTier] ?? 0;
    const start = monthStart();
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const invoice = await prisma.invoice.create({
      data: {
        workspaceId,
        periodStart: start,
        periodEnd: end,
        planTier: q.workspace.planTier,
        amountUsd: Math.round((base + usageCost) * 100) / 100,
        costKind: 'ESTIMATED',
        status: 'DRAFT',
        detailsJson: { planBaseUsd: base, estimatedUsageUsd: usageCost, usageByProvider: q.usageByProvider } as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.auditLog.create({
      data: { workspaceId, userId, action: 'INVOICE_DRAFT_CREATED', entityType: 'Invoice', entityId: invoice.id },
    });
    return reply.status(201).send({
      success: true,
      data: { invoice, disclosure: 'ESTIMATED draft only. No payment processor is integrated; nothing has been charged.' },
    });
  });

  app.get('/api/v1/billing/invoices', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const invoices = await prisma.invoice.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 24 });
    return reply.status(200).send({ success: true, data: { invoices } });
  });

  // ---- Observability: workspace-scoped admin metrics ----
  app.get('/api/v1/admin/metrics', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [wfGroups, renders, pubGroups, ai, queues] = await Promise.all([
      prisma.workflow.groupBy({ by: ['stage'], where: { workspaceId }, _count: true }),
      prisma.renderJob.findMany({ where: { workspaceId, createdAt: { gte: since } }, select: { status: true, durationMs: true } }),
      prisma.publishPost.groupBy({ by: ['status'], where: { workspaceId }, _count: true }),
      prisma.agentRun.findMany({ where: { workflow: { workspaceId }, createdAt: { gte: since } }, select: { provider: true, status: true, latencyMs: true, isSimulated: true } }),
      getQueueDepths(),
    ]);
    const renderDur = renders.map((r) => r.durationMs).filter((d): d is number => typeof d === 'number');
    const aiByProvider = new Map<string, { runs: number; failures: number; totalMs: number; simulated: boolean }>();
    for (const r of ai) {
      const e = aiByProvider.get(r.provider) ?? { runs: 0, failures: 0, totalMs: 0, simulated: r.isSimulated };
      e.runs += 1;
      e.totalMs += r.latencyMs;
      if (r.status === 'FAILED') e.failures += 1;
      aiByProvider.set(r.provider, e);
    }
    const publishStats = Object.fromEntries(pubGroups.map((g) => [g.status, g._count]));
    const failed = publishStats['FAILED'] ?? 0;
    if (failed >= 5) metrics.raiseAlert('CRITICAL', 'publishing', `${failed} publishing jobs in FAILED state`);
    for (const [name, d] of Object.entries(queues)) {
      if (d.available && d.failed >= 10) metrics.raiseAlert('CRITICAL', `queue:${name}`, `${d.failed} failed jobs`);
    }
    return reply.status(200).send({
      success: true,
      data: {
        process: metrics.snapshot(),
        workflows: Object.fromEntries(wfGroups.map((g) => [g.stage, g._count])),
        rendering: {
          last24h: renders.length,
          failed: renders.filter((r) => r.status === 'FAILED').length,
          avgDurationMs: renderDur.length ? Math.round(renderDur.reduce((a, b) => a + b, 0) / renderDur.length) : null,
        },
        publishing: publishStats,
        aiProviders: [...aiByProvider.entries()].map(([provider, v]) => ({
          provider,
          runs: v.runs,
          failures: v.failures,
          avgLatencyMs: Math.round(v.totalMs / Math.max(1, v.runs)),
          simulated: v.simulated,
        })),
        queues,
      },
    });
  });

  // Stage 2D: Pre-Flight Cost Estimator & Budget Policies
  app.post('/api/v1/billing/estimate', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsed = EstimateCostRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid cost estimate payload', parsed.error.flatten());
    }
    const estimate = await estimateWorkflowPreflightCost({
      workspaceId: ctx.workspaceId,
      projectId: parsed.data.projectId,
      operations: parsed.data.operations,
    });
    return reply.status(200).send({
      success: true,
      data: {
        ...estimate,
        pricingRegistryCount: PROVIDER_PRICING_REGISTRY.length,
      },
    });
  });

  app.get('/api/v1/billing/budget-policy', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as { projectId?: string };
    const policy = await getEffectiveBudgetPolicy(ctx.workspaceId, query.projectId ?? null);
    return reply.status(200).send({
      success: true,
      data: {
        policy,
        pricingRegistry: PROVIDER_PRICING_REGISTRY,
      },
    });
  });

  app.put('/api/v1/billing/budget-policy', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const parsed = UpsertBudgetPolicyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid budget policy payload', parsed.error.flatten());
    }
    const saved = await upsertBudgetPolicyForWorkspace({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(200).send({
      success: true,
      data: { policy: saved },
    });
  });
}
