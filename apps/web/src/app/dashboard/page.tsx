'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
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
    return <div className="text-sm text-zinc-400">Loading workspace dashboard telemetry...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-indigo-400">
            Workspace Overview — {data?.workspace.name} ({data?.workspace.planTier})
          </span>
          <h1 className="mt-1 text-2xl font-bold text-white">Production Control Dashboard</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Role: {data?.workspace.role} • Slug: {data?.workspace.slug}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Refresh Data
          </button>
          <button
            type="button"
            onClick={() => setShowNewProject(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            + Create New Project
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs text-zinc-400">Total Projects</div>
          <div className="mt-2 text-3xl font-bold text-white">
            {data?.stats.totalProjects ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {data?.stats.activeProjects ?? 0} active • {data?.stats.archivedProjects ?? 0} archived
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs text-zinc-400">Total Content Assets</div>
          <div className="mt-2 text-3xl font-bold text-white">{data?.stats.totalAssets ?? 0}</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Storage Used: {formatBytes(data?.stats.totalStorageBytes ?? 0)}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs text-zinc-400">Active AI Workflows</div>
          <div className="mt-2 text-3xl font-bold text-white">
            {data?.stats.activeWorkflowCount ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {data?.processingJobs.length ?? 0} total workflow runs recorded
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs text-zinc-400">Brand Kit Identity</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded-full border border-zinc-700"
              style={{
                backgroundColor: data?.workspace.brandKit?.primaryColor ?? '#6366F1',
              }}
            />
            <span className="truncate text-sm font-semibold text-white">
              {data?.workspace.brandKit?.brandName ?? data?.workspace.name}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] text-zinc-500">
            {data?.workspace.brandKit?.toneOfVoice ?? 'Configured'}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Projects</h2>
            <Link href="/projects" className="text-xs text-indigo-400 hover:underline">
              Manage All Projects
            </Link>
          </div>
          {!data?.recentProjects.length ? (
            <p className="mt-4 text-xs text-zinc-500">
              No projects in this workspace yet. Click &ldquo;Create New Project&rdquo; to begin.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {data.recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{proj.name}</div>
                    <div className="text-[11px] text-zinc-400">
                      {proj._count?.assets ?? 0} assets • {proj._count?.conversations ?? 0}{' '}
                      conversations • {proj.status}
                    </div>
                  </div>
                  <Link
                    href={`/studio?projectId=${proj.id}`}
                    className="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/30"
                  >
                    Open in AI Studio
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Active AI Production Workflows</h2>
            <Link href="/studio" className="text-xs text-indigo-400 hover:underline">
              Open AI Studio
            </Link>
          </div>
          {!data?.processingJobs.length ? (
            <p className="mt-4 text-xs text-zinc-500">
              No AI workflows triggered yet. Start a conversation in AI Studio.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {data.processingJobs.map((wf) => (
                <div
                  key={wf.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-300">{wf.stage}</span>
                    <span className="text-[11px] text-zinc-500">
                      {wf.project?.name ?? 'Project'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-200">{wf.userPrompt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-white">Recent AI Studio Conversations</h2>
          {!data?.recentConversations.length ? (
            <p className="mt-4 text-xs text-zinc-500">No conversations recorded yet.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                >
                  <div>
                    <div className="text-xs font-medium text-white">{conv.title}</div>
                    <div className="text-[11px] text-zinc-500">
                      Project: {conv.project?.name} • {conv._count?.messages ?? 0} messages
                    </div>
                  </div>
                  <Link
                    href={`/studio?conversationId=${conv.id}`}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Resume
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-white">Recent Workspace Audit Activity</h2>
          {!data?.recentActivity.length ? (
            <p className="mt-4 text-xs text-zinc-500">No activity events yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.recentActivity.map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between border-b border-zinc-800/60 pb-2 text-xs"
                >
                  <span className="font-mono text-zinc-300">{act.action}</span>
                  <span className="text-[11px] text-zinc-500">
                    {act.user?.fullName ?? act.entityType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-white">Create New Project</h2>
            <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300">Project Name</label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Podcast Season 2 Reels"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300">Description</label>
                <textarea
                  rows={3}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Describe project goals, target platforms, or campaign notes"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
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
