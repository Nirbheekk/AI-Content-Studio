'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Send,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import { DistributionIntelligencePanel } from '../../components/distribution/distribution-intelligence-panel';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest, getApiBaseUrl } from '../../lib/api-client';

type Metrics = Record<string, number | null>;

interface PostRow {
  publishPostId: string;
  platform: string;
  title: string | null;
  caption: string;
  source: string;
  collectedAt: string;
  metrics: Metrics;
  engagementRate: number | null;
  unavailableMetrics: string[];
  unavailableReason: string | null;
}

interface Summary {
  postCount: number;
  totals: Metrics;
  avgEngagementRate: number | null;
  postsWithEngagementData: number;
}

interface Overview {
  range: { from: string; to: string };
  liveProviderConfigured: boolean;
  overall: Summary;
  platforms: Array<Summary & { platform: string }>;
  campaigns: Array<Summary & { campaign: string }>;
  trend: Array<Summary & { date: string }>;
  posts: PostRow[];
  notes: string;
}

interface Insight {
  kind: string;
  type: string;
  summary: string;
  sampleSize: number;
}

interface InsightResult {
  evidence: { insights: Insight[]; sampleSize: number };
  aiSuggestions: { items: Array<{ kind: string; text: string }>; note: string };
}

interface UsageData {
  periodStart: string;
  statuses: Array<{
    category: string;
    used: number;
    limit: number;
    percentUsed: number;
    exceeded: boolean;
    alert: boolean;
  }>;
  usageByProvider: Array<{
    provider: string;
    category: string;
    quantity: number;
    estimatedCostUsd: number;
  }>;
  workspace: { planTier: string; usageAlertThresholdPct: number };
  alerts: string[];
  costDisclosure: string;
}

interface InvoiceRow {
  id: string;
  periodStart: string;
  amountUsd: number;
  costKind: string;
  status: string;
}

const fmt = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined
    ? 'Unavailable'
    : v.toLocaleString(undefined, { maximumFractionDigits: digits });

const pct = (v: number | null) => (v === null ? 'Unavailable' : `${(v * 100).toFixed(2)}%`);

function TrendChart({ data }: { data: Array<{ date: string; value: number | null }> }) {
  const pts = data.filter((d) => d.value !== null) as Array<{ date: string; value: number }>;
  if (pts.length === 0) {
    return (
      <p className="py-4 text-xs text-muted-foreground">
        No measured metric snapshots in this date range to chart.
      </p>
    );
  }
  const max = Math.max(...pts.map((p) => p.value), 1);
  return (
    <div
      role="img"
      aria-label="Engagement trend chart"
      className="flex h-36 items-end gap-1.5 rounded-xl border border-border bg-secondary/35 p-3"
    >
      {pts.map((p) => (
        <div key={p.date} className="group flex flex-1 flex-col items-center justify-end">
          <div
            className="w-full rounded-t bg-primary transition-opacity group-hover:opacity-90"
            style={{ height: `${Math.max(6, (p.value / max) * 100)}%` }}
            title={`${p.date}: ${p.value}`}
          />
          <span className="mt-1.5 font-mono text-xs text-muted-foreground tabular-nums">
            {p.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { activeWorkspace, accessToken, setFeedback } = useStudio();
  const [tab, setTab] = useState<'overview' | 'insights' | 'usage'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<InsightResult | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [platform, setPlatform] = useState('');
  const [selectedPost, setSelectedPost] = useState<PostRow | null>(null);
  const [tokenQuota, setTokenQuota] = useState('');
  const [renderQuota, setRenderQuota] = useState('');
  const canAdmin = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const query = useCallback(() => {
    const p = new URLSearchParams({
      from: new Date(`${from}T00:00:00.000Z`).toISOString(),
      to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    });
    if (platform) p.set('platform', platform);
    return p;
  }, [from, to, platform]);

  const load = useCallback(async () => {
    if (!activeWorkspace || !accessToken) return;
    setLoading(true);
    try {
      const ov = await apiRequest<Overview>(`/api/v1/analytics/overview?${query().toString()}`, {
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setOverview(ov);
      const us = await apiRequest<UsageData>('/api/v1/usage', {
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setUsage(us);
      if (canAdmin) {
        const inv = await apiRequest<{ invoices: InvoiceRow[] }>('/api/v1/billing/invoices', {
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setInvoices(inv.invoices);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load analytics',
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, accessToken, query, canAdmin, setFeedback]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (path: string, method: 'POST' | 'PUT', body: unknown, okMsg: string) => {
    if (!activeWorkspace || !accessToken) return null;
    try {
      const res = await apiRequest<unknown>(path, {
        method,
        accessToken,
        workspaceId: activeWorkspace.id,
        body,
      });
      setFeedback({ type: 'success', message: okMsg });
      return res;
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Request failed',
      });
      return null;
    }
  };

  const collect = async () => {
    const res = (await call(
      '/api/v1/analytics/collect',
      'POST',
      {},
      'Collection finished. Unavailable metrics are shown explicitly.',
    )) as {
      attempted: number;
    } | null;
    if (res) await load();
  };

  const generateInsights = async () => {
    const res = (await call(
      '/api/v1/analytics/insights',
      'POST',
      {},
      'Insight report generated.',
    )) as InsightResult | null;
    if (res) {
      setInsights(res);
      setTab('insights');
    }
  };

  const exportCsv = async () => {
    if (!activeWorkspace || !accessToken) return;
    const p = query();
    p.set('format', 'csv');
    const res = await fetch(`${getApiBaseUrl()}/api/v1/analytics/overview?${p.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Workspace-Id': activeWorkspace.id },
      credentials: 'include',
    });
    if (!res.ok) {
      setFeedback({ type: 'error', message: `Export failed (HTTP ${res.status})` });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analytics-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, number> = {};
    if (tokenQuota) body['monthlyTokenQuota'] = Number(tokenQuota);
    if (renderQuota) body['monthlyRenderMinutesQuota'] = Number(renderQuota);
    if (Object.keys(body).length === 0) return;
    if (await call('/api/v1/usage/quotas', 'PUT', body, 'Quotas updated.')) await load();
  };

  const generateInvoice = async () => {
    if (
      await call(
        '/api/v1/billing/invoices/generate',
        'POST',
        {},
        'Draft invoice created (ESTIMATED).',
      )
    )
      await load();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Analytics &amp; Intelligence"
          description="Real stored metric snapshots only. Unavailable platform metrics are explicitly reported and never fabricated."
          badge={
            overview && !overview.liveProviderConfigured ? (
              <Badge variant="warning">
                Sandbox Mode — Automatic Collection Returns &quot;Unavailable&quot;
              </Badge>
            ) : (
              <Badge variant="success">Live Metrics Active</Badge>
            )
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => void collect()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Collect Metrics
              </Button>
              <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button variant="ai" size="sm" onClick={() => void generateInsights()}>
                <Sparkles className="h-3.5 w-3.5" />
                Generate Insights
              </Button>
            </>
          }
        />

        {/* Navigation Tabs & Date/Platform Filter Bar */}
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-secondary/50 p-1">
            {(
              [
                ['overview', 'Performance'],
                ['insights', 'AI Insights'],
                ['usage', 'Usage & Billing'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  tab === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>From</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>To</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </label>
            <div className="w-44">
              <Select
                aria-label="Platform filter"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
              <option value="">All Platforms</option>
              {[
                'INSTAGRAM_REELS',
                'TIKTOK',
                'YOUTUBE_SHORTS',
                'YOUTUBE_LONG',
                'LINKEDIN',
                'X_TWITTER',
                'FACEBOOK',
              ].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            </div>
          </div>
        </Card>

        {loading && !overview && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}

        {tab === 'overview' && overview && (
          <div className="space-y-6">
            {/* Always render the 6 core KPI headers with real totals or honest Unavailable/0 state */}
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
              {(['views', 'impressions', 'reach', 'likes', 'comments', 'shares'] as const).map(
                (k) => (
                  <MetricCard
                    key={k}
                    label={k.charAt(0).toUpperCase() + k.slice(1)}
                    value={
                      overview.overall.postCount === 0
                        ? '0'
                        : fmt(overview.overall.totals[k])
                    }
                    sublabel={
                      overview.overall.postCount === 0
                        ? '0 snapshots in range'
                        : `${overview.overall.postCount} tracked post(s)`
                    }
                  />
                ),
              )}
            </div>

            {overview.overall.postCount === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-5 w-5 text-primary" />}
                title="No metric snapshots in this date range"
                description="Publish content in the Publishing Center, then click Collect Metrics to record verified snapshot totals. AI Content Studio never fabricates analytics data."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href="/publish"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Open Publishing Center
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => void collect()}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Collect Metrics Now
                    </Button>
                  </div>
                }
              />
            ) : (
              <>
                <Card className="p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      Average Engagement Rate:{' '}
                      <span className="text-primary tabular-nums">
                        {pct(overview.overall.avgEngagementRate)}
                      </span>
                    </h2>
                    <Badge variant="outline">
                      {overview.overall.postsWithEngagementData} of {overview.overall.postCount}{' '}
                      posts have engagement data
                    </Badge>
                  </div>
                  <TrendChart
                    data={overview.trend.map((t) => ({
                      date: t.date,
                      value: t.totals['likes'] ?? null,
                    }))}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Daily likes across verified snapshots collected on each date.
                  </p>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="p-5">
                    <h2 className="mb-2.5 text-sm font-semibold text-foreground">
                      Performance by Platform
                    </h2>
                    {overview.platforms.map((p) => (
                      <div
                        key={p.platform}
                        className="flex items-center justify-between border-t border-border py-2 text-xs text-foreground"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="ai">{p.platform}</Badge>
                          <span className="text-muted-foreground">({p.postCount} posts)</span>
                        </div>
                        <span className="font-mono font-semibold tabular-nums">
                          {pct(p.avgEngagementRate)}
                        </span>
                      </div>
                    ))}
                  </Card>

                  <Card className="p-5">
                    <h2 className="mb-2.5 text-sm font-semibold text-foreground">
                      Performance by Campaign (Project)
                    </h2>
                    {overview.campaigns.map((c) => (
                      <div
                        key={c.campaign}
                        className="flex items-center justify-between border-t border-border py-2 text-xs text-foreground"
                      >
                        <span>
                          {c.campaign}{' '}
                          <span className="text-muted-foreground">({c.postCount} posts)</span>
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {pct(c.avgEngagementRate)}
                        </span>
                      </div>
                    ))}
                  </Card>
                </div>

                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      Post Performance Breakdown
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Click any post row to inspect snapshot details
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-foreground">
                      <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3">Post</th>
                          <th className="py-2 pr-3">Platform</th>
                          <th className="py-2 pr-3">Source</th>
                          <th className="py-2 pr-3">Views</th>
                          <th className="py-2 pr-3">Likes</th>
                          <th className="py-2">Eng. Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.posts.map((p) => (
                          <tr
                            key={p.publishPostId}
                            onClick={() => setSelectedPost(p)}
                            className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/50"
                          >
                            <td className="max-w-64 truncate py-2.5 pr-3 font-medium">
                              {p.title ?? p.caption}
                            </td>
                            <td className="py-2.5 pr-3">
                              <Badge variant="ai">{p.platform}</Badge>
                            </td>
                            <td className="py-2.5 pr-3">
                              <Badge variant="outline">{p.source}</Badge>
                            </td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums">
                              {fmt(p.metrics['views'])}
                            </td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums">
                              {fmt(p.metrics['likes'])}
                            </td>
                            <td className="py-2.5 font-mono font-semibold tabular-nums">
                              {pct(p.engagementRate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {tab === 'insights' && (
          <div className="space-y-4">
            {!insights ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5 text-primary" />}
                title="No AI Insight Report generated yet"
                description="Click Generate Insights to analyze stored metric snapshots and compare evidence-backed observations with creative recommendations."
                action={
                  <Button variant="ai" size="sm" onClick={() => void generateInsights()}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Insights Now
                  </Button>
                }
              />
            ) : (
              <>
                <Card className="border-success/35 bg-success-surface/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-success">
                      Evidence-Based Insights (Computed Directly from Stored Snapshots)
                    </h2>
                    <Badge variant="success">Measured Data • n={insights.evidence.sampleSize}</Badge>
                  </div>
                  {insights.evidence.insights.length === 0 ? (
                    <p className="mt-2.5 text-xs text-muted-foreground">
                      Not enough measured snapshot data yet to compute statistical evidence.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {insights.evidence.insights.map((i, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-success/25 bg-card p-3 text-xs text-foreground"
                        >
                          <Badge variant="success">
                            EVIDENCE • {i.type} • n={i.sampleSize}
                          </Badge>
                          <span>{i.summary}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="border-warning/35 bg-warning-surface/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-warning">
                      AI-Generated Creative Suggestions (Speculative Hypotheses, Not Measured)
                    </h2>
                    <Badge variant="warning">Speculative Recommendation</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {insights.aiSuggestions.note}
                  </p>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-foreground">
                    {insights.aiSuggestions.items.map((s, idx) => (
                      <li key={idx}>{s.text}</li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </div>
        )}

        {tab === 'usage' && usage && (
          <div className="space-y-4">
            <Card className="flex items-center justify-between gap-3 p-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span>{usage.costDisclosure}</span>
              </div>
              <Badge variant="ai">Plan: {usage.workspace.planTier}</Badge>
            </Card>

            {usage.alerts.map((a) => (
              <div
                key={a}
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-surface px-4 py-2.5 text-xs text-warning"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{a}</span>
              </div>
            ))}

            <div className="grid gap-3.5 sm:grid-cols-3">
              {usage.statuses.map((s) => (
                <Card key={s.category} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{s.category}</span>
                    <Badge
                      variant={s.exceeded ? 'destructive' : s.alert ? 'warning' : 'success'}
                    >
                      {s.percentUsed}% used
                    </Badge>
                  </div>
                  <div className="mt-2 font-mono text-base font-semibold text-foreground tabular-nums">
                    {s.used.toLocaleString()} / {s.limit.toLocaleString()}
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${
                        s.exceeded
                          ? 'bg-destructive'
                          : s.alert
                            ? 'bg-warning'
                            : 'bg-success'
                      }`}
                      style={{ width: `${Math.min(100, s.percentUsed)}%` }}
                    />
                  </div>
                  {s.exceeded && (
                    <div className="mt-1.5 text-xs font-semibold text-destructive">
                      QUOTA EXCEEDED
                    </div>
                  )}
                </Card>
              ))}
            </div>

            <Card className="p-5">
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">
                Estimated Cost by Provider (Current Billing Period)
              </h2>
              {usage.usageByProvider.length === 0 ? (
                <p className="text-xs text-muted-foreground">No provider usage recorded yet.</p>
              ) : (
                usage.usageByProvider.map((u) => (
                  <div
                    key={`${u.provider}-${u.category}`}
                    className="flex items-center justify-between border-t border-border py-2 text-xs text-foreground"
                  >
                    <span>
                      <strong>{u.provider}</strong> • {u.category}
                    </span>
                    <span className="font-mono tabular-nums">
                      {u.quantity.toLocaleString()} units • est. $
                      {u.estimatedCostUsd.toFixed(4)}
                    </span>
                  </div>
                ))
              )}
            </Card>

            {canAdmin ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-foreground">
                    Workspace Quota Limits (Plan: {usage.workspace.planTier})
                  </h2>
                  <form onSubmit={saveQuotas} className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Monthly LLM Token Quota
                      </label>
                      <Input
                        aria-label="Monthly token quota"
                        type="number"
                        min={1}
                        value={tokenQuota}
                        onChange={(e) => setTokenQuota(e.target.value)}
                        placeholder="Monthly LLM token quota"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Monthly Render Minutes Quota
                      </label>
                      <Input
                        aria-label="Monthly render minutes quota"
                        type="number"
                        min={1}
                        value={renderQuota}
                        onChange={(e) => setRenderQuota(e.target.value)}
                        placeholder="Monthly render minutes quota"
                      />
                    </div>
                    <Button type="submit" size="sm">
                      Save Quotas
                    </Button>
                  </form>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      Estimated Usage Invoices (Drafts)
                    </h2>
                    <Button variant="outline" size="sm" onClick={() => void generateInvoice()}>
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Generate Draft
                    </Button>
                  </div>
                  {invoices.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">No draft invoices yet.</p>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {invoices.map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between border-t border-border py-2 text-xs text-foreground"
                        >
                          <span className="font-mono tabular-nums">
                            {i.periodStart.slice(0, 7)} • {i.status}
                          </span>
                          <Badge variant="outline">
                            ${i.amountUsd.toFixed(2)} ({i.costKind})
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Quota and billing management requires ADMIN or OWNER role.
              </p>
            )}
          </div>
        )}
      </div>

        <DistributionIntelligencePanel
          accessToken={accessToken}
          workspaceId={activeWorkspace?.id ?? null}
        />

      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-analytics-title"
        >
          <Card className="w-full max-w-md p-6 text-xs text-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 id="post-analytics-title" className="text-sm font-semibold text-foreground">
                {selectedPost.platform} Post Analytics Snapshot
              </h3>
              <Button variant="outline" size="sm" onClick={() => setSelectedPost(null)}>
                Close
              </Button>
            </div>
            <p className="mt-3 font-medium">{selectedPost.caption}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Source: {selectedPost.source} • Collected {selectedPost.collectedAt}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-border bg-secondary/35 p-3">
              {Object.entries(selectedPost.metrics).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs capitalize text-muted-foreground">{k}</dt>
                  <dd className="font-mono font-semibold text-foreground tabular-nums">
                    {fmt(v, 2)}
                  </dd>
                </div>
              ))}
            </dl>
            {selectedPost.unavailableReason && (
              <p className="mt-3 rounded-lg border border-warning/35 bg-warning-surface px-3 py-2 text-warning">
                Unavailable Reason: {selectedPost.unavailableReason}
              </p>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
