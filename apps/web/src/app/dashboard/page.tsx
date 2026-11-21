'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Film,
  FolderKanban,
  FolderPlus,
  Image as ImageIcon,
  Palette,
  Plus,
  RefreshCw,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AppShell, AuthScreen } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  Skeleton,
  StatusIndicator,
  Textarea,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest, DashboardDataDto, ProjectDto } from '../../lib/api-client';

interface PublishingOverviewSummary {
  upcomingScheduled: Array<{
    id: string;
    platform: string;
    title?: string | null;
    captionText: string;
    localScheduledLabel: string;
    timezone: string;
    socialAccount: { accountHandle: string };
  }>;
  recentlyPublished: Array<{
    id: string;
    platform: string;
    title?: string | null;
    captionText: string;
    localEffectiveLabel: string;
    isSimulated?: boolean;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? 'B'}`;
}

function formatCleanTitle(raw: string): string {
  return raw.replace(/[-_]\d{10,14}$/, '').trim() || raw;
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'Recently';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAuditAction(action: string, entityType: string): string {
  const friendly = action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${friendly} (${entityType})`;
}

const HERO_PLACEHOLDERS = [
  'Ask AI Studio to create a 15s SaaS product launch reel with a bold hook...',
  'Turn our founder podcast insights into a kinetic TikTok clip with captions...',
  'Create an educational YouTube Short explaining 3 AI creative workflows...',
  'Produce a 4:5 LinkedIn promo video highlighting our Q4 release...',
];

function DashboardContent() {
  const router = useRouter();
  const { user, accessToken, activeWorkspace, setFeedback } = useStudio();
  const [data, setData] = useState<DashboardDataDto | null>(null);
  const [pubSummary, setPubSummary] = useState<PublishingOverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Lovable-inspired Prompt-First Hero Composer state
  const [heroPrompt, setHeroPrompt] = useState('');
  const [heroProjectId, setHeroProjectId] = useState('');
  const [heroPlatform, setHeroPlatform] = useState('INSTAGRAM_REELS');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % HERO_PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleHeroLaunch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    const chosenProj = heroProjectId || data?.recentProjects[0]?.id || '';
    if (chosenProj) params.set('projectId', chosenProj);
    if (heroPrompt.trim()) params.set('prompt', heroPrompt.trim());
    if (heroPlatform) params.set('platform', heroPlatform);
    router.push(`/studio${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const loadDashboard = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    setLoading(true);
    try {
      const [dashRes, pubRes] = await Promise.allSettled([
        apiRequest<DashboardDataDto>({
          path: '/api/v1/dashboard',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<PublishingOverviewSummary>({
          path: '/api/v1/publishing/dashboard',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);

      if (dashRes.status === 'fulfilled') {
        setData(dashRes.value);
      } else {
        throw dashRes.reason;
      }

      if (pubRes.status === 'fulfilled') {
        setPubSummary(pubRes.value);
      } else {
        setPubSummary(null);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load dashboard',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeWorkspace, setFeedback]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !newProjectName.trim()) return;
    setCreating(true);
    try {
      const created = await apiRequest<ProjectDto>({
        method: 'POST',
        path: '/api/v1/projects',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          name: newProjectName.trim(),
          description: newProjectDesc.trim() || undefined,
        },
      });
      setFeedback({ type: 'success', message: `Project "${created.name}" created` });
      setNewProjectName('');
      setNewProjectDesc('');
      setShowNewProject(false);
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create project',
      });
    } finally {
      setCreating(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const firstName = user?.fullName?.split(' ')[0] ?? 'Creator';
  const pendingApprovals =
    data?.processingJobs.filter((wf) => wf.stage === 'AWAITING_APPROVAL') ?? [];
  const totalVideosCount =
    data?.workspace.counts?.compositions ??
    data?.recentProjects.reduce((acc, p) => acc + (p._count?.compositions ?? 0), 0) ??
    data?.processingJobs.filter(
      (wf) => wf.stage === 'AWAITING_APPROVAL' || wf.stage === 'APPROVED',
    ).length ??
    0;

  return (
    <div className="space-y-7">
      {/* A. Lovable-Inspired Prompt-First Hero Composer */}
      <section
        aria-label="Creative studio prompt launcher"
        className="aicos-hero-bloom relative overflow-hidden rounded-3xl border border-border/80 px-5 py-8 sm:px-10 sm:py-11"
      >
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-2">
            <Badge variant="ai" className="rounded-full px-3 py-1">
              <Sparkles className="h-3 w-3" />
              Welcome back, {firstName}
            </Badge>
            <Badge variant="outline" className="rounded-full bg-card/80 px-3 py-1 backdrop-blur-sm">
              {data?.workspace.name ?? activeWorkspace?.name ?? 'Creative Workspace'} •{' '}
              {data?.workspace.planTier ?? 'PRO'}
            </Badge>
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
            What will you create today?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Describe it. Create it. Refine it. Publish it — from creative brief to rendered MP4.
          </p>

          <form
            onSubmit={handleHeroLaunch}
            className="mt-6 overflow-hidden rounded-[24px] border border-border/80 bg-card text-left shadow-2xl ring-1 ring-black/5 transition-shadow focus-within:ring-2 focus-within:ring-primary/35 dark:ring-white/10"
          >
            <textarea
              rows={3}
              value={heroPrompt}
              onChange={(e) => setHeroPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleHeroLaunch();
                }
              }}
              placeholder={HERO_PLACEHOLDERS[placeholderIdx]}
              aria-label="Describe what you want AI Studio to create"
              className="w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-secondary/25 px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/library"
                  title="Upload source media"
                  aria-label="Upload source media"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"
                >
                  <Plus className="h-4 w-4" />
                </Link>

                <select
                  aria-label="Select project for prompt"
                  value={heroProjectId || data?.recentProjects[0]?.id || ''}
                  onChange={(e) => setHeroProjectId(e.target.value)}
                  className="h-8 max-w-[170px] truncate rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground focus:border-ring focus:outline-none"
                >
                  {data?.recentProjects.length ? (
                    data.recentProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatCleanTitle(p.name)}
                      </option>
                    ))
                  ) : (
                    <option value="">Default Workspace</option>
                  )}
                </select>

                <select
                  aria-label="Select target platform"
                  value={heroPlatform}
                  onChange={(e) => setHeroPlatform(e.target.value)}
                  className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground focus:border-ring focus:outline-none"
                >
                  <option value="INSTAGRAM_REELS">Reels 9:16</option>
                  <option value="TIKTOK">TikTok 9:16</option>
                  <option value="YOUTUBE_SHORTS">Shorts 9:16</option>
                  <option value="YOUTUBE_LONG">YouTube 16:9</option>
                  <option value="LINKEDIN">LinkedIn 4:5</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewProject(true)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  New Project
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  Create in Studio
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Workspace Data
            </Button>
          </div>
        </div>
      </section>

      {/* B. Key Metrics (6 Real Data-Backed KPIs) */}
      <section aria-label="Workspace metrics" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
        <MetricCard
          label="Total Projects"
          value={data?.stats.totalProjects ?? 0}
          sublabel={`${data?.stats.activeProjects ?? 0} active • ${data?.stats.archivedProjects ?? 0} archived`}
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <MetricCard
          label="Videos Created"
          value={totalVideosCount}
          tone="ai"
          sublabel={`${data?.processingJobs.length ?? 0} production runs`}
          icon={<Film className="h-4 w-4" />}
        />
        <MetricCard
          label="Assets Uploaded"
          value={data?.stats.totalAssets ?? 0}
          sublabel={`Storage: ${formatBytes(data?.stats.totalStorageBytes ?? 0)}`}
          icon={<ImageIcon className="h-4 w-4" />}
        />
        <MetricCard
          label="Pending Approvals"
          value={pendingApprovals.length}
          tone={pendingApprovals.length > 0 ? 'warning' : 'default'}
          sublabel={
            pendingApprovals.length > 0 ? 'Requires human review' : 'All workflows reviewed'
          }
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="Scheduled Posts"
          value={pubSummary ? pubSummary.upcomingScheduled.length : '—'}
          sublabel={pubSummary ? 'Queued in calendar' : 'Unavailable'}
          icon={<Calendar className="h-4 w-4" />}
        />
        <MetricCard
          label="Published Content"
          value={pubSummary ? pubSummary.recentlyPublished.length : '—'}
          tone="success"
          sublabel={pubSummary ? 'Confirmed deliveries' : 'Unavailable'}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </section>

      {/* D. Quick Creation Bar (5 Direct Creative Workflows) */}
      <section aria-label="Quick creation">
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Quick Creation</h2>
            <p className="text-xs text-muted-foreground">
              Jump directly into a production, repurposing, or publishing workflow.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Link
            href="/studio"
            className="group flex flex-col justify-between rounded-xl border border-primary/30 bg-ai-surface p-4 transition-all hover:border-primary"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-foreground">Create a Video</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Describe concept, plan storyboard &amp; render MP4
              </p>
            </div>
          </Link>

          <Link
            href="/publish"
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Send className="h-4 w-4 text-primary" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-foreground">Generate Social Content</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Prepare platform captions, hashtags &amp; schedule
              </p>
            </div>
          </Link>

          <Link
            href="/repurpose"
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Repeat className="h-4 w-4 text-info" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-foreground">Repurpose Content</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Convert one recording into Reels, Shorts &amp; posts
              </p>
            </div>
          </Link>

          <Link
            href="/library"
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Upload className="h-4 w-4 text-success" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-foreground">Upload Media</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ingest raw footage, audio &amp; transcribe hooks
              </p>
            </div>
          </Link>

          <Link
            href="/editor"
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Film className="h-4 w-4 text-warning" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-foreground">Open Video Editor</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Refine scenes, overlays, aspect ratios &amp; subtitles
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* C. Continue Working (Recent Projects & Active Sessions) */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Continue Working</h2>
              <p className="text-xs text-muted-foreground">
                Recently updated projects and creative campaigns in this workspace.
              </p>
            </div>
            <Link
              href="/projects"
              className="shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
            >
              View All Projects
            </Link>
          </div>

          {!data?.recentProjects.length ? (
            <div className="mt-4">
              <EmptyState
                title="No projects in this workspace yet"
                description="Create a project to organize raw assets, AI Studio scripts, and video compositions."
                action={
                  <Button size="sm" onClick={() => setShowNewProject(true)}>
                    Create First Project
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/35 p-3.5 transition-colors hover:border-primary/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-xs font-bold text-white shadow-sm"
                      style={{
                        backgroundColor: data.workspace.brandKit?.primaryColor ?? '#6956E8',
                      }}
                    >
                      {formatCleanTitle(proj.name).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          title={proj.name}
                          className="truncate text-sm font-semibold text-foreground"
                        >
                          {formatCleanTitle(proj.name)}
                        </span>
                        <Badge variant={proj.status === 'ACTIVE' ? 'success' : 'warning'}>
                          {proj.status}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                        <span>{proj._count?.assets ?? 0} assets</span>
                        <span>•</span>
                        <span>{proj._count?.conversations ?? 0} sessions</span>
                        <span>•</span>
                        <span>{proj._count?.workflows ?? 0} workflows</span>
                        <span>•</span>
                        <span>Updated {formatRelativeTime(proj.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/library?projectId=${proj.id}`}
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      Assets
                    </Link>
                    <Link
                      href={`/studio?projectId=${proj.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-95"
                    >
                      Continue
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Active AI Sessions & Workflow Pipeline */}
        <Card className="p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">AI Production Sessions</h2>
              <p className="text-xs text-muted-foreground">
                Recent AI Studio conversations and active agent workflows.
              </p>
            </div>
            <Link
              href="/studio"
              className="shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
            >
              Open AI Studio
            </Link>
          </div>

          {!data?.recentConversations.length && !data?.processingJobs.length ? (
            <div className="mt-4">
              <EmptyState
                icon={<Sparkles className="h-5 w-5 text-primary" />}
                title="No AI Studio sessions yet"
                description="Open AI Studio to describe a video concept and generate a multi-scene storyboard."
                action={
                  <Link
                    href="/studio"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Launch AI Studio
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data?.processingJobs.slice(0, 3).map((wf) => (
                <div
                  key={wf.id}
                  className="rounded-xl border border-border bg-secondary/35 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusIndicator
                      status={
                        wf.stage === 'APPROVED'
                          ? 'success'
                          : wf.stage === 'AWAITING_APPROVAL'
                            ? 'warning'
                            : wf.stage === 'FAILED'
                              ? 'error'
                              : 'processing'
                      }
                      label={wf.stage}
                    />
                    <span className="truncate text-[11px] text-muted-foreground">
                      {wf.project?.name ? formatCleanTitle(wf.project.name) : 'Project'}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-1 font-medium text-foreground">{wf.userPrompt}</p>
                </div>
              ))}

              {data?.recentConversations.slice(0, 3).map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-foreground">
                      {conv.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {conv.project?.name ? formatCleanTitle(conv.project.name) : 'Project'} •{' '}
                      {conv._count?.messages ?? 0} messages
                    </div>
                  </div>
                  <Link
                    href={`/studio?conversationId=${conv.id}`}
                    className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
                  >
                    Resume
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* E & F. Upcoming Publishing, Pending Approvals, Brand Kit & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Upcoming Publishing &amp; Approvals
              </h2>
              <p className="text-xs text-muted-foreground">
                Scheduled social posts and workflows awaiting human approval gate.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/calendar" className="text-xs font-medium text-primary hover:underline">
                Calendar
              </Link>
              <Link href="/publish" className="text-xs font-medium text-primary hover:underline">
                Publishing
              </Link>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {pendingApprovals.map((wf) => (
              <div
                key={wf.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-surface p-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">AWAITING APPROVAL</Badge>
                    <span className="truncate font-semibold text-foreground">
                      {wf.project?.name ? formatCleanTitle(wf.project.name) : 'AI Video'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">{wf.userPrompt}</p>
                </div>
                <Link
                  href={`/studio?projectId=${wf.projectId}`}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  Review &amp; Approve
                </Link>
              </div>
            ))}

            {pubSummary?.upcomingScheduled.slice(0, 3).map((post) => (
              <div
                key={post.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/35 p-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="ai">{post.platform}</Badge>
                    <span className="font-medium text-foreground">
                      {post.socialAccount.accountHandle}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                      <Clock className="h-3 w-3" />
                      {post.localScheduledLabel}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">
                    {post.title ? `${post.title} — ` : ''}
                    {post.captionText}
                  </p>
                </div>
                <Link
                  href="/calendar"
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Manage
                </Link>
              </div>
            ))}

            {pendingApprovals.length === 0 &&
              (!pubSummary || pubSummary.upcomingScheduled.length === 0) && (
                <EmptyState
                  icon={<Calendar className="h-5 w-5 text-muted-foreground" />}
                  title="No pending approvals or scheduled posts"
                  description="Approved compositions can be scheduled across connected social accounts in the Publishing Center."
                  action={
                    <Link
                      href="/publish"
                      className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Open Publishing Center
                    </Link>
                  }
                />
              )}
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-6">
          {/* Brand Kit Identity Card (Full Non-Truncated Summary) */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Workspace Brand Kit</h2>
              </div>
              <Link href="/brand-kit" className="text-xs font-medium text-primary hover:underline">
                Customize Brand Kit
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/35 p-3.5">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  {data?.workspace.brandKit?.brandName ?? data?.workspace.name}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tone: {data?.workspace.brandKit?.toneOfVoice ?? 'Authoritative, clear, modern'} •{' '}
                  Style: {data?.workspace.brandKit?.editingStyle ?? 'Dynamic kinetic cuts'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  data?.workspace.brandKit?.primaryColor ?? '#6956E8',
                  data?.workspace.brandKit?.secondaryColor ?? '#11131B',
                  data?.workspace.brandKit?.accentColor ?? '#15805B',
                ].map((hex, idx) => (
                  <span
                    key={idx}
                    title={hex}
                    className="inline-block h-6 w-6 rounded-md border border-border shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Recent Workspace Activity */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Recent Workspace Activity</h2>
            {!data?.recentActivity.length ? (
              <p className="mt-3 text-xs text-muted-foreground">No workspace activity recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {data.recentActivity.slice(0, 6).map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">
                        {formatAuditAction(act.action, act.entityType)}
                      </span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        by {act.user?.fullName ?? 'System'}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {formatRelativeTime(act.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {showNewProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
        >
          <Card className="w-full max-w-md p-6 shadow-xl">
            <h2 id="create-project-title" className="text-lg font-semibold text-foreground">
              Create New Project
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Projects group your raw media assets, AI Studio scripts, and rendered video versions.
            </p>
            <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Project Name
                </label>
                <Input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Q4 Product Launch Reels"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Creative Brief / Description
                </label>
                <Textarea
                  rows={3}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Target audience, key hooks, or campaign goals..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewProject(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useStudio();
  if (!user) {
    return <AuthScreen />;
  }
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
