import { z } from 'zod';

// -----------------------------------------------------------------------------
// 1. Analytics metrics (never fabricated: unavailable metrics are null)
// -----------------------------------------------------------------------------

export const METRIC_KEYS = [
  'views',
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'watchTimeSec',
  'completionRate',
  'followerDelta',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type SnapshotMetrics = Record<MetricKey, number | null>;

export const ImportMetricsSchema = z.object({
  publishPostId: z.string().uuid(),
  collectedAt: z.string().datetime().optional(),
  views: z.number().int().nonnegative().nullable().optional(),
  impressions: z.number().int().nonnegative().nullable().optional(),
  reach: z.number().int().nonnegative().nullable().optional(),
  likes: z.number().int().nonnegative().nullable().optional(),
  comments: z.number().int().nonnegative().nullable().optional(),
  shares: z.number().int().nonnegative().nullable().optional(),
  watchTimeSec: z.number().nonnegative().nullable().optional(),
  completionRate: z.number().min(0).max(1).nullable().optional(),
  followerDelta: z.number().int().nullable().optional(),
});
export type ImportMetricsInput = z.infer<typeof ImportMetricsSchema>;

export const AnalyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  platform: z.string().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/** Engagement rate = (likes + comments + shares) / best available reach denominator. Null when not computable. */
export function computeEngagementRate(m: SnapshotMetrics): number | null {
  if (m.likes === null && m.comments === null && m.shares === null) return null;
  const denom = m.impressions ?? m.views ?? m.reach;
  if (denom === null || denom <= 0) return null;
  const interactions = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);
  return interactions / denom;
}

export function listUnavailableMetrics(m: SnapshotMetrics): MetricKey[] {
  return METRIC_KEYS.filter((k) => m[k] === null);
}

// -----------------------------------------------------------------------------
// 2. Evidence-based insight engine (deterministic; derived only from stored snapshots)
// -----------------------------------------------------------------------------

export interface InsightPostInput {
  id: string;
  platform: string;
  contentType: string;
  title: string | null;
  captionText: string;
  hashtags: string[];
  publishedAt: string | null;
  metrics: SnapshotMetrics;
}

export interface EvidenceInsight {
  kind: 'EVIDENCE';
  type:
    | 'TOP_PERFORMER'
    | 'UNDERPERFORMER'
    | 'PLATFORM_COMPARISON'
    | 'BEST_PUBLISH_HOUR'
    | 'CONTENT_TYPE'
    | 'HASHTAG'
    | 'HOOK_PATTERN'
    | 'DATA_QUALITY';
  summary: string;
  basedOnPostIds: string[];
  sampleSize: number;
  data: Record<string, unknown>;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function hookFeatures(caption: string): { question: boolean; hasNumber: boolean; shortHook: boolean } {
  const first = caption.trim().split(/[.!?\n]/)[0] ?? '';
  return {
    question: /\?/.test(caption.trim().slice(0, 140)),
    hasNumber: /\d/.test(first),
    shortHook: first.trim().split(/\s+/).filter(Boolean).length <= 8,
  };
}

export function computeEvidenceInsights(posts: InsightPostInput[]): {
  insights: EvidenceInsight[];
  sampleSize: number;
  postsWithoutEngagementData: number;
} {
  const insights: EvidenceInsight[] = [];
  const scored = posts
    .map((p) => ({ p, er: computeEngagementRate(p.metrics) }))
    .filter((x): x is { p: InsightPostInput; er: number } => x.er !== null);
  const missing = posts.length - scored.length;

  if (missing > 0) {
    insights.push({
      kind: 'EVIDENCE',
      type: 'DATA_QUALITY',
      summary: `${missing} of ${posts.length} published posts have no computable engagement rate (metrics unavailable) and are excluded from analysis.`,
      basedOnPostIds: posts.filter((p) => computeEngagementRate(p.metrics) === null).map((p) => p.id),
      sampleSize: posts.length,
      data: { missing },
    });
  }
  if (scored.length === 0) return { insights, sampleSize: 0, postsWithoutEngagementData: missing };

  const ers = scored.map((s) => s.er);
  const med = median(ers);
  const ranked = [...scored].sort((a, b) => b.er - a.er);

  const top = ranked.slice(0, Math.min(3, ranked.length));
  insights.push({
    kind: 'EVIDENCE',
    type: 'TOP_PERFORMER',
    summary: `Top ${top.length} post(s) by engagement rate: ${top
      .map((t) => `${t.p.platform} ${pct(t.er)}`)
      .join(', ')} (median ${pct(med)}).`,
    basedOnPostIds: top.map((t) => t.p.id),
    sampleSize: scored.length,
    data: { medianEngagementRate: med },
  });

  const under = scored.filter((s) => scored.length >= 3 && s.er < med * 0.5);
  if (under.length > 0) {
    insights.push({
      kind: 'EVIDENCE',
      type: 'UNDERPERFORMER',
      summary: `${under.length} post(s) performed below 50% of the median engagement rate (${pct(med)}).`,
      basedOnPostIds: under.map((u) => u.p.id),
      sampleSize: scored.length,
      data: { threshold: med * 0.5 },
    });
  }

  const group = (keyFn: (p: InsightPostInput) => string[]) => {
    const map = new Map<string, { ids: string[]; ers: number[] }>();
    for (const s of scored) {
      for (const k of keyFn(s.p)) {
        const e = map.get(k) ?? { ids: [], ers: [] };
        e.ids.push(s.p.id);
        e.ers.push(s.er);
        map.set(k, e);
      }
    }
    return [...map.entries()].map(([key, v]) => ({ key, ids: v.ids, avg: mean(v.ers), n: v.ers.length }));
  };

  const byPlatform = group((p) => [p.platform]).sort((a, b) => b.avg - a.avg);
  if (byPlatform.length > 1) {
    insights.push({
      kind: 'EVIDENCE',
      type: 'PLATFORM_COMPARISON',
      summary: `Average engagement rate by platform: ${byPlatform.map((g) => `${g.key} ${pct(g.avg)} (n=${g.n})`).join('; ')}.`,
      basedOnPostIds: byPlatform.flatMap((g) => g.ids),
      sampleSize: scored.length,
      data: { platforms: byPlatform.map((g) => ({ platform: g.key, avg: g.avg, n: g.n })) },
    });
  }

  const byType = group((p) => [p.contentType]).sort((a, b) => b.avg - a.avg);
  if (byType.length > 1) {
    insights.push({
      kind: 'EVIDENCE',
      type: 'CONTENT_TYPE',
      summary: `Content formats ranked by engagement: ${byType.map((g) => `${g.key} ${pct(g.avg)} (n=${g.n})`).join('; ')}.`,
      basedOnPostIds: byType.flatMap((g) => g.ids),
      sampleSize: scored.length,
      data: { types: byType.map((g) => ({ type: g.key, avg: g.avg, n: g.n })) },
    });
  }

  const byHour = group((p) => (p.publishedAt ? [String(new Date(p.publishedAt).getUTCHours())] : [])).sort(
    (a, b) => b.avg - a.avg,
  );
  if (byHour.length > 0) {
    const best = byHour[0] as (typeof byHour)[number];
    insights.push({
      kind: 'EVIDENCE',
      type: 'BEST_PUBLISH_HOUR',
      summary: `Best observed publish hour is ${best.key.padStart(2, '0')}:00 UTC (avg ${pct(best.avg)}, n=${best.n}).${
        best.n < 3 ? ' Sample is small; treat as weak evidence.' : ''
      }`,
      basedOnPostIds: best.ids,
      sampleSize: best.n,
      data: { hoursUtc: byHour.map((g) => ({ hour: Number(g.key), avg: g.avg, n: g.n })) },
    });
  }

  const byTag = group((p) => p.hashtags.map((h) => h.toLowerCase())).filter((g) => g.n >= 2).sort((a, b) => b.avg - a.avg);
  if (byTag.length > 0) {
    insights.push({
      kind: 'EVIDENCE',
      type: 'HASHTAG',
      summary: `Hashtags used in 2+ posts ranked by engagement: ${byTag
        .slice(0, 5)
        .map((g) => `#${g.key} ${pct(g.avg)} (n=${g.n})`)
        .join('; ')}.`,
      basedOnPostIds: byTag.flatMap((g) => g.ids),
      sampleSize: scored.length,
      data: { hashtags: byTag.slice(0, 5).map((g) => ({ tag: g.key, avg: g.avg, n: g.n })) },
    });
  }

  for (const [label, test] of [
    ['opens with a question', (c: string) => hookFeatures(c).question],
    ['has a number in the first sentence', (c: string) => hookFeatures(c).hasNumber],
    ['has a short hook (8 words or fewer)', (c: string) => hookFeatures(c).shortHook],
  ] as const) {
    const yes = scored.filter((s) => test(s.p.captionText));
    const no = scored.filter((s) => !test(s.p.captionText));
    if (yes.length >= 2 && no.length >= 2) {
      const a = mean(yes.map((s) => s.er));
      const b = mean(no.map((s) => s.er));
      insights.push({
        kind: 'EVIDENCE',
        type: 'HOOK_PATTERN',
        summary: `Posts whose caption ${label} averaged ${pct(a)} vs ${pct(b)} for others (n=${yes.length} vs ${no.length}).`,
        basedOnPostIds: [...yes, ...no].map((s) => s.p.id),
        sampleSize: scored.length,
        data: { pattern: label, withPattern: a, without: b },
      });
    }
  }

  return { insights, sampleSize: scored.length, postsWithoutEngagementData: missing };
}

// -----------------------------------------------------------------------------
// 3. Log redaction (no secrets or tokens in logs)
// -----------------------------------------------------------------------------

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|encryption|credential|hash/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') return value.replace(BEARER, 'Bearer [REDACTED]').replace(JWT, '[REDACTED_JWT]');
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redactSensitive(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Strips accessToken query parameters from a URL before logging. */
export function sanitizeUrlForLog(url: string): string {
  return url.replace(/([?&](?:accessToken|token|code)=)[^&]*/gi, '$1[REDACTED]');
}

// -----------------------------------------------------------------------------
// 4. Quotas
// -----------------------------------------------------------------------------

export type UsageCategory = 'LLM_TOKENS' | 'RENDER_SECONDS' | 'STORAGE_BYTES' | 'STT_SECONDS' | 'TTS_CHARS';

export interface QuotaStatus {
  category: UsageCategory;
  used: number;
  limit: number;
  percentUsed: number;
  exceeded: boolean;
  alert: boolean;
}

export function evaluateQuota(
  category: UsageCategory,
  used: number,
  limit: number,
  alertThresholdPct: number,
): QuotaStatus {
  const percentUsed = limit > 0 ? (used / limit) * 100 : 100;
  return {
    category,
    used,
    limit,
    percentUsed: Math.round(percentUsed * 100) / 100,
    exceeded: used >= limit,
    alert: percentUsed >= alertThresholdPct,
  };
}

export const UpdateQuotasSchema = z.object({
  monthlyTokenQuota: z.number().int().positive().optional(),
  monthlyRenderMinutesQuota: z.number().int().positive().optional(),
  usageAlertThresholdPct: z.number().int().min(1).max(100).optional(),
  planTier: z.enum(['FREE', 'PRO', 'BUSINESS']).optional(),
});
