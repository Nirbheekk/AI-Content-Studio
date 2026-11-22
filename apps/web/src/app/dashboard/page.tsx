'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  Film,
  FolderKanban,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AppShell, AuthScreen } from '@/components/app-shell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  ErrorState,
  Input,
  Label,
  MetricCard,
  NativeSelect,
  PageHeader,
  Skeleton,
  StatusIndicator,
  Textarea,
  WorkflowStepper,
} from '@/components/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStudio } from '@/context/studio-context';
import { apiRequest, DashboardDataDto, ProjectDto } from '@/lib/api-client';

interface PublishingOverviewSummary {
  upcomingScheduled: Array<{
    id: string;
    platform: string;
    title?: string | null;
    captionText: string;
    localScheduledLabel: string;
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

const STARTER_PROMPTS = [
  '15s SaaS launch reel with a bold hook and 3 feature scenes',
  'Founder podcast insights turned into a kinetic TikTok clip',
  'Educational YouTube Short explaining 3 AI content workflows',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] ?? 'B'}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return 'Recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function DashboardContent() {
  const router = useRouter();
  const {
    user,
    accessToken,
    activeWorkspace,
    activeProjectId,
    setActiveProjectId,
    setFeedback,
  } = useStudio();
  const [data, setData] = useState<DashboardDataDto | null>(null);
  const [pubSummary, setPubSummary] = useState<PublishingOverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [heroPrompt, setHeroPrompt] = useState('');
  const [heroProjectId, setHeroProjectId] = useState(activeProjectId ?? '');
  const [heroPlatform, setHeroPlatform] = useState('INSTAGRAM_REELS');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, pub] = await Promise.all([
        apiRequest<DashboardDataDto>({
          path: '/api/v1/dashboard',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<PublishingOverviewSummary>({
          path: '/api/v1/publishing/dashboard',
          accessToken,
          workspaceId: activeWorkspace.id,
        }).catch(() => null),
      ]);
      setData(dash);
      setPubSummary(pub);
      const preferred =
        (activeProjectId && dash.recentProjects.some((p) => p.id === activeProjectId)
          ? activeProjectId
          : null) ?? dash.recentProjects[0]?.id;
      if (!heroProjectId && preferred) {
        setHeroProjectId(preferred);
        setActiveProjectId(preferred);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
      setLoadError(msg);
      setFeedback({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeWorkspace, activeProjectId, heroProjectId, setActiveProjectId, setFeedback]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleLaunchStudio = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (heroProjectId) {
      setActiveProjectId(heroProjectId);
      params.set('projectId', heroProjectId);
    }
    if (heroPrompt.trim()) params.set('prompt', heroPrompt.trim());
    params.set('platform', heroPlatform);
    router.push(`/studio?${params.toString()}`);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !projectName.trim()) return;
    setCreating(true);
    try {
      const created = await apiRequest<ProjectDto>({
        method: 'POST',
        path: '/api/v1/projects',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { name: projectName.trim(), description: projectDesc.trim() || undefined },
      });
      setFeedback({ type: 'success', message: `Project "${created.name}" created` });
      setProjectName('');
      setProjectDesc('');
      setNewProjectOpen(false);
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

  const stats = data?.stats;
  const projects = data?.recentProjects ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Command Center`}
        description={`Welcome back, ${user?.fullName ?? 'Creator'}. Launch a brief or resume an active production.`}
        badge={activeWorkspace ? <Badge variant="outline">{activeWorkspace.name}</Badge> : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setNewProjectOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Project
            </Button>
          </>
        }
      />

      <WorkflowStepper activeStep="brief" projectId={heroProjectId || undefined} />

      {loadError && (
        <ErrorState
          title="Could not load Command Center"
          message={loadError}
          onRetry={() => void loadDashboard()}
        />
      )}

      {/* Lovable.dev Signature Hero Prompt Composer */}
      <section className="lovable-aura relative overflow-hidden rounded-3xl border border-border px-6 py-10 sm:px-10 sm:py-12">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-3 bg-card/80 backdrop-blur">
            <Sparkles className="h-4 w-4 text-ai" />
            9-Agent Creative Engine
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            What will you create today?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Describe your video brief or attach raw clips. AI Studio plans, scripts, composes, renders, and runs visual QA.
          </p>
        </div>

        <form
          onSubmit={handleLaunchStudio}
          className="mx-auto mt-6 max-w-2xl rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <Textarea
            rows={3}
            value={heroPrompt}
            onChange={(e) => setHeroPrompt(e.target.value)}
            placeholder="Ask AI Content Studio to create a 15s product launch reel with bold captions and a clear CTA..."
            className="min-h-20 resize-none border-0 bg-transparent px-2 py-1 text-sm shadow-none focus-visible:ring-0"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-44">
                <NativeSelect
                  aria-label="Project"
                  value={heroProjectId}
                  onChange={(e) => setHeroProjectId(e.target.value)}
                  className="rounded-full bg-secondary/70"
                >
                  <option value="">Default project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="w-48">
                <NativeSelect
                  aria-label="Target platform"
                  value={heroPlatform}
                  onChange={(e) => setHeroPlatform(e.target.value)}
                  className="rounded-full bg-secondary/70"
                >
                  <option value="INSTAGRAM_REELS">Instagram Reels (9:16)</option>
                  <option value="TIKTOK">TikTok (9:16)</option>
                  <option value="YOUTUBE_SHORTS">YouTube Shorts (9:16)</option>
                  <option value="LINKEDIN_VIDEO">LinkedIn Video (4:5)</option>
                </NativeSelect>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-full" asChild>
                <Link href="/library">
                  <Upload className="h-4 w-4" />
                  Attach Media
                </Link>
              </Button>
              <Button type="submit" size="sm" className="rounded-full px-4">
                Create in Studio
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>

        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
          {STARTER_PROMPTS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setHeroPrompt(item)}
              className="rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors duration-150 hover:border-foreground/30 hover:bg-card hover:text-foreground"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {/* KPI Strip */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Active Projects"
            value={stats?.activeProjects ?? 0}
            sublabel={`${stats?.totalProjects ?? 0} total campaigns`}
            icon={<FolderKanban className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Media Library"
            value={stats?.totalAssets ?? 0}
            sublabel={formatBytes(stats?.totalStorageBytes ?? 0)}
            icon={<ImageIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Active Workflows"
            value={stats?.activeWorkflowCount ?? 0}
            sublabel="Multi-agent runs"
            tone="ai"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Scheduled Posts"
            value={pubSummary?.upcomingScheduled.length ?? 0}
            sublabel={`${pubSummary?.recentlyPublished.length ?? 0} recently published`}
            tone="success"
            icon={<Calendar className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {/* Workspace Tabs */}
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
          <TabsTrigger value="publishing">
            Publishing ({pubSummary?.upcomingScheduled.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity ({data?.recentActivity.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
          {projects.length === 0 ? (
            <Empty
              icon={<FolderKanban className="h-5 w-5" />}
              title="No projects yet"
              description="Create your first project to organize uploaded media, studio runs, and compositions."
              action={
                <Button size="sm" onClick={() => setNewProjectOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Create Project
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Card key={project.id} interactive className="flex flex-col justify-between p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {project.name}
                      </h3>
                      <StatusIndicator status={project.status} />
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {project.description || 'No description provided.'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                      <span>{project._count?.assets ?? 0} assets</span>
                      <span>·</span>
                      <span>{project._count?.compositions ?? 0} compositions</span>
                      <span>·</span>
                      <span>{project._count?.workflows ?? 0} runs</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
                    <Button variant="default" size="sm" className="flex-1" asChild>
                      <Link href={`/studio?projectId=${encodeURIComponent(project.id)}`}>
                        <Sparkles className="h-3 w-3" />
                        Studio
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/editor?projectId=${encodeURIComponent(project.id)}`}>
                        <Film className="h-3 w-3" />
                        Editor
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/library?projectId=${encodeURIComponent(project.id)}`}>
                        <Upload className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="publishing">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Scheduled</CardTitle>
                <CardDescription>Approved posts queued for distribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(pubSummary?.upcomingScheduled ?? []).length === 0 ? (
                  <Empty
                    icon={<Send className="h-4 w-4" />}
                    title="Queue is empty"
                    description="Approve a composition and schedule it in the Publish Queue."
                    action={
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/publish">Open Publish Queue</Link>
                      </Button>
                    }
                  />
                ) : (
                  pubSummary?.upcomingScheduled.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">
                          {post.title || post.captionText}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {post.platform} · @{post.socialAccount.accountHandle}
                        </div>
                      </div>
                      <Badge variant="outline">{post.localScheduledLabel}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recently Published</CardTitle>
                <CardDescription>Latest delivered posts across connected channels.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(pubSummary?.recentlyPublished ?? []).length === 0 ? (
                  <Empty
                    icon={<Calendar className="h-4 w-4" />}
                    title="No published posts yet"
                    description="Published posts and channel receipts appear here."
                  />
                ) : (
                  pubSummary?.recentlyPublished.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">
                          {post.title || post.captionText}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {post.platform} · {post.localEffectiveLabel}
                        </div>
                      </div>
                      <Badge variant={post.isSimulated ? 'warning' : 'success'}>
                        {post.isSimulated ? 'Simulated' : 'Published'}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {(data?.recentActivity ?? []).length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No recent workspace activity recorded.
                </div>
              ) : (
                data?.recentActivity.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline">{log.entityType}</Badge>
                      <span className="truncate font-medium">
                        {log.action.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Group raw media, AI Studio runs, and compositions under one campaign.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProject} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dash-proj-name">Project Name</Label>
              <Input
                id="dash-proj-name"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Q4 Product Launch"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dash-proj-desc">Description</Label>
              <Textarea
                id="dash-proj-desc"
                rows={3}
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="Short campaign goal, target audience, or deliverables..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewProjectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isLoading } = useStudio();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-xs text-muted-foreground">
        Loading workspace...
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
