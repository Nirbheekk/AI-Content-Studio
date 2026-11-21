'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderPlus, RefreshCw, Sparkles } from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest, DashboardDataDto, ProjectDto } from '../../lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? 'B'}`;
}

function DashboardContent() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [data, setData] = useState<DashboardDataDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    setLoading(true);
    try {
      const res = await apiRequest<DashboardDataDto>({
        path: '/api/v1/dashboard',
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setData(res);
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
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Control Dashboard"
        description={`${data?.workspace.name ?? 'Workspace'} • Role: ${data?.workspace.role ?? 'MEMBER'} • Slug: ${data?.workspace.slug ?? ''}`}
        badge={<Badge variant="ai">{data?.workspace.planTier ?? 'PRO'}</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Data
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowNewProject(true)}>
              <FolderPlus className="h-3.5 w-3.5" />
              + Create New Project
            </Button>
          </>
        }
      />

      {/* Quick Create Hero */}
      <Card className="border-primary/25 bg-ai-surface p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Describe it. Create it. Refine it. Publish it.
            </div>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              Launch a new AI video production in seconds
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Upload raw media, describe your creative goal in AI Studio, review Visual QA, and schedule across platforms.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/studio"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Open AI Studio
            </Link>
            <Link
              href="/library"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Upload Media
            </Link>
          </div>
        </div>
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Projects"
          value={data?.stats.totalProjects ?? 0}
          sublabel={`${data?.stats.activeProjects ?? 0} active • ${data?.stats.archivedProjects ?? 0} archived`}
        />
        <MetricCard
          label="Content Assets"
          value={data?.stats.totalAssets ?? 0}
          sublabel={`Storage: ${formatBytes(data?.stats.totalStorageBytes ?? 0)}`}
        />
        <MetricCard
          label="Active AI Workflows"
          value={data?.stats.activeWorkflowCount ?? 0}
          tone="ai"
          sublabel={`${data?.processingJobs.length ?? 0} workflow runs recorded`}
        />
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Brand Kit Identity</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: data?.workspace.brandKit?.primaryColor ?? '#6956E8' }}
            />
            <span className="truncate text-sm font-semibold text-foreground">
              {data?.workspace.brandKit?.brandName ?? data?.workspace.name}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{data?.workspace.brandKit?.toneOfVoice ?? 'Configured'}</span>
            <Link href="/brand-kit" className="font-medium text-primary hover:underline">
              Edit
            </Link>
          </div>
        </Card>
      </div>

      {/* Projects & Workflows */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Projects</h2>
            <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
              Manage All Projects
            </Link>
          </div>
          {!data?.recentProjects.length ? (
            <div className="mt-4">
              <EmptyState
                title="No projects yet"
                description="Create your first project to organize assets, scripts, and video compositions."
                action={
                  <Button size="sm" onClick={() => setShowNewProject(true)}>
                    Create New Project
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{proj.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {proj._count?.assets ?? 0} assets • {proj._count?.conversations ?? 0}{' '}
                      conversations • {proj.status}
                    </div>
                  </div>
                  <Link
                    href={`/studio?projectId=${proj.id}`}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:opacity-90"
                  >
                    Open in AI Studio
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Active AI Production Workflows</h2>
            <Link href="/studio" className="text-xs font-medium text-primary hover:underline">
              Open AI Studio
            </Link>
          </div>
          {!data?.processingJobs.length ? (
            <div className="mt-4">
              <EmptyState
                title="No AI workflows triggered yet"
                description="Describe a video concept in AI Studio to kick off planning, scripting, and rendering."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.processingJobs.map((wf) => (
                <div
                  key={wf.id}
                  className="rounded-lg border border-border bg-secondary/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="ai">{wf.stage}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {wf.project?.name ?? 'Project'}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-foreground">{wf.userPrompt}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Conversations & Audit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Recent AI Studio Conversations</h2>
          {!data?.recentConversations.length ? (
            <p className="mt-4 text-xs text-muted-foreground">No conversations recorded yet.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">{conv.title}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      Project: {conv.project?.name} • {conv._count?.messages ?? 0} messages
                    </div>
                  </div>
                  <Link
                    href={`/studio?conversationId=${conv.id}`}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    Resume
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Recent Workspace Audit Activity</h2>
          {!data?.recentActivity.length ? (
            <p className="mt-4 text-xs text-muted-foreground">No activity events yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.recentActivity.map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs last:border-0"
                >
                  <span className="truncate font-mono text-foreground">{act.action}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {act.user?.fullName ?? act.entityType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Create New Project</h2>
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
                  placeholder="Podcast Season 2 Reels"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Description
                </label>
                <Textarea
                  rows={3}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Describe project goals, target platforms, or campaign notes"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowNewProject(false)}>
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
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
