'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
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
  statuses: Array<{ category: string; used: number; limit: number; percentUsed: number; exceeded: boolean; alert: boolean }>;
  usageByProvider: Array<{ provider: string; category: string; quantity: number; estimatedCostUsd: number }>;
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
  v === null || v === undefined ? 'Unavailable' : v.toLocaleString(undefined, { maximumFractionDigits: digits });
const pct = (v: number | null) => (v === null ? 'Unavailable' : `${(v * 100).toFixed(2)}%`);

function TrendChart({ data }: { data: Array<{ date: string; value: number | null }> }) {
  const pts = data.filter((d) => d.value !== null) as Array<{ date: string; value: number }>;
  if (pts.length === 0) {
    return <p className="text-xs text-zinc-500">No metric data in this range to chart.</p>;
  }
  const max = Math.max(...pts.map((p) => p.value), 1);
  return (
    <div role="img" aria-label="Engagement trend chart" className="flex h-32 items-end gap-1">
      {pts.map((p) => (
        <div key={p.date} className="group flex flex-1 flex-col items-center justify-end">
          <div
            className="w-full rounded-t bg-indigo-500/80"
            style={{ height: `${Math.max(4, (p.value / max) * 100)}%` }}
            title={`${p.date}: ${p.value}`}
          />
          <span className="mt-1 text-[9px] text-zinc-500">{p.date.slice(5)}</span>
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
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
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
      const us = await apiRequest<UsageData>('/api/v1/usage', { accessToken, workspaceId: activeWorkspace.id });
      setUsage(us);
      if (canAdmin) {
        const inv = await apiRequest<{ invoices: InvoiceRow[] }>('/api/v1/billing/invoices', {
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setInvoices(inv.invoices);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load analytics' });
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
      const res = await apiRequest<unknown>(path, { method, accessToken, workspaceId: activeWorkspace.id, body });
      setFeedback({ type: 'success', message: okMsg });
      return res;
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Request failed' });
      return null;
    }
  };

  const collect = async () => {
    const res = (await call('/api/v1/analytics/collect', 'POST', {}, 'Collection finished. Unavailable metrics are shown explicitly.')) as {
      attempted: number;
    } | null;
    if (res) await load();
  };

  const generateInsights = async () => {
    const res = (await call('/api/v1/analytics/insights', 'POST', {}, 'Insight report generated.')) as InsightResult | null;
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
    if (await call('/api/v1/billing/invoices/generate', 'POST', {}, 'Draft invoice created (ESTIMATED).')) await load();
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === id ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Analytics &amp; Intelligence</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Real stored metric snapshots only. Unavailable metrics are never estimated.
              {overview && !overview.liveProviderConfigured && (
                <span className="ml-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                  No live Postiz provider configured: automatic collection returns &quot;Unavailable&quot;
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void collect()} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800">
              Collect Metrics
            </button>
            <button type="button" onClick={() => void exportCsv()} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800">
              Export CSV
            </button>
            <button type="button" onClick={() => void generateInsights()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500">
              Generate Insights
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {tabBtn('overview', 'Performance')}
            {tabBtn('insights', 'AI Insights')}
            {tabBtn('usage', 'Usage & Billing')}
          </div>
          <label className="text-[11px] text-zinc-400">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-white" />
          </label>
          <label className="text-[11px] text-zinc-400">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-white" />
          </label>
          <select aria-label="Platform filter" value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-white">
            <option value="">All platforms</option>
            {['INSTAGRAM_REELS', 'TIKTOK', 'YOUTUBE_SHORTS', 'YOUTUBE_LONG', 'LINKEDIN', 'X_TWITTER', 'FACEBOOK'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {loading && !overview && <p className="text-xs text-zinc-500">Loading analytics...</p>}

        {tab === 'overview' && overview && (
          <div className="space-y-6">
            {overview.overall.postCount === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-400">
                No metric snapshots in this range. Publish content, then use &quot;Collect Metrics&quot;.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {['views', 'impressions', 'reach', 'likes', 'comments', 'shares'].map((k) => (
                    <div key={k} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                      <div className="text-[11px] capitalize text-zinc-400">{k}</div>
                      <div className="mt-1 text-lg font-bold text-white">{fmt(overview.overall.totals[k])}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h2 className="mb-3 text-sm font-semibold text-white">
                    Average engagement rate: {pct(overview.overall.avgEngagementRate)}
                    <span className="ml-2 text-[11px] font-normal text-zinc-500">
                      ({overview.overall.postsWithEngagementData} of {overview.overall.postCount} posts have data)
                    </span>
                  </h2>
                  <TrendChart data={overview.trend.map((t) => ({ date: t.date, value: t.totals['likes'] ?? null }))} />
                  <p className="mt-1 text-[10px] text-zinc-500">Daily likes across snapshots collected that day.</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <h2 className="mb-2 text-sm font-semibold text-white">By platform</h2>
                    {overview.platforms.map((p) => (
                      <div key={p.platform} className="flex justify-between border-t border-zinc-800 py-1.5 text-xs text-zinc-300">
                        <span>{p.platform} ({p.postCount})</span>
                        <span>{pct(p.avgEngagementRate)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <h2 className="mb-2 text-sm font-semibold text-white">By campaign (project)</h2>
                    {overview.campaigns.map((c) => (
                      <div key={c.campaign} className="flex justify-between border-t border-zinc-800 py-1.5 text-xs text-zinc-300">
                        <span>{c.campaign} ({c.postCount})</span>
                        <span>{pct(c.avgEngagementRate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h2 className="mb-2 text-sm font-semibold text-white">Post performance</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="text-zinc-500">
                        <tr><th className="py-1">Post</th><th>Platform</th><th>Source</th><th>Views</th><th>Likes</th><th>Eng. rate</th></tr>
                      </thead>
                      <tbody>
                        {overview.posts.map((p) => (
                          <tr key={p.publishPostId} onClick={() => setSelectedPost(p)} className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-800/40">
                            <td className="max-w-[240px] truncate py-1.5">{p.title ?? p.caption}</td>
                            <td>{p.platform}</td>
                            <td>{p.source}</td>
                            <td>{fmt(p.metrics['views'])}</td>
                            <td>{fmt(p.metrics['likes'])}</td>
                            <td>{pct(p.engagementRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'insights' && (
          <div className="space-y-4">
            {!insights ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-400">
                Click &quot;Generate Insights&quot; to analyze stored snapshots.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <h2 className="text-sm font-semibold text-emerald-300">Evidence-based insights (computed from your data)</h2>
                  {insights.evidence.insights.length === 0 && <p className="mt-2 text-xs text-zinc-400">Not enough data.</p>}
                  <ul className="mt-2 space-y-2">
                    {insights.evidence.insights.map((i, idx) => (
                      <li key={idx} className="text-xs text-zinc-200">
                        <span className="mr-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">EVIDENCE · {i.type} · n={i.sampleSize}</span>
                        {i.summary}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <h2 className="text-sm font-semibold text-amber-300">AI-generated suggestions (hypotheses, not measured)</h2>
                  <p className="mt-1 text-[11px] text-zinc-400">{insights.aiSuggestions.note}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {insights.aiSuggestions.items.map((s, idx) => (
                      <li key={idx} className="text-xs text-zinc-200">{s.text}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'usage' && usage && (
          <div className="space-y-4">
            <p className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">{usage.costDisclosure}</p>
            {usage.alerts.map((a) => (
              <div key={a} role="alert" className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{a}</div>
            ))}
            <div className="grid gap-3 sm:grid-cols-3">
              {usage.statuses.map((s) => (
                <div key={s.category} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="text-[11px] text-zinc-400">{s.category}</div>
                  <div className="mt-1 text-sm font-bold text-white">{s.used.toLocaleString()} / {s.limit.toLocaleString()}</div>
                  <div className="mt-2 h-2 rounded bg-zinc-800">
                    <div className={`h-2 rounded ${s.exceeded ? 'bg-red-500' : s.alert ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, s.percentUsed)}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500">{s.percentUsed}% used{s.exceeded ? ' · QUOTA EXCEEDED' : ''}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold text-white">Estimated cost by provider (this month)</h2>
              {usage.usageByProvider.length === 0 && <p className="text-xs text-zinc-500">No usage recorded.</p>}
              {usage.usageByProvider.map((u) => (
                <div key={`${u.provider}-${u.category}`} className="flex justify-between border-t border-zinc-800 py-1.5 text-xs text-zinc-300">
                  <span>{u.provider} · {u.category}</span>
                  <span>{u.quantity.toLocaleString()} · est. ${u.estimatedCostUsd.toFixed(4)}</span>
                </div>
              ))}
            </div>
            {canAdmin ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <form onSubmit={saveQuotas} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h2 className="text-sm font-semibold text-white">Quotas (plan: {usage.workspace.planTier})</h2>
                  <input aria-label="Monthly token quota" type="number" min={1} value={tokenQuota} onChange={(e) => setTokenQuota(e.target.value)} placeholder="Monthly LLM token quota" className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" />
                  <input aria-label="Monthly render minutes quota" type="number" min={1} value={renderQuota} onChange={(e) => setRenderQuota(e.target.value)} placeholder="Monthly render minutes quota" className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" />
                  <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Save Quotas</button>
                </form>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">Invoices (drafts)</h2>
                    <button type="button" onClick={() => void generateInvoice()} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800">Generate draft</button>
                  </div>
                  {invoices.length === 0 && <p className="mt-2 text-xs text-zinc-500">No invoices yet.</p>}
                  {invoices.map((i) => (
                    <div key={i.id} className="flex justify-between border-t border-zinc-800 py-1.5 text-xs text-zinc-300">
                      <span>{i.periodStart.slice(0, 7)} · {i.status}</span>
                      <span>${i.amountUsd.toFixed(2)} ({i.costKind})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Quota and billing management requires ADMIN or OWNER role.</p>
            )}
          </div>
        )}
      </div>

      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-xs text-zinc-300">
            <div className="flex justify-between">
              <h3 className="text-sm font-semibold text-white">{selectedPost.platform} post analytics</h3>
              <button type="button" onClick={() => setSelectedPost(null)} className="text-zinc-400 hover:text-white">Close</button>
            </div>
            <p className="mt-2">{selectedPost.caption}</p>
            <p className="mt-2 text-zinc-500">Source: {selectedPost.source} · collected {selectedPost.collectedAt}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(selectedPost.metrics).map(([k, v]) => (
                <div key={k}><dt className="text-zinc-500">{k}</dt><dd>{fmt(v, 2)}</dd></div>
              ))}
            </dl>
            {selectedPost.unavailableReason && <p className="mt-3 text-amber-300">Unavailable: {selectedPost.unavailableReason}</p>}
          </div>
        </div>
      )}
    </AppShell>
  );
}
