'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { useStudio } from '../../context/studio-context';
import { apiRequest, ProjectDto } from '../../lib/api-client';

export default function ProjectsPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [search, setSearch] = useState('');

  // Create form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editingProject, setEditingProject] = useState<ProjectDto | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Safeguarded delete confirmation modal
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<ProjectDto | null>(null);

  const loadProjects = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const list = await apiRequest<ProjectDto[]>({
        path: `/api/v1/projects?${params.toString()}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setProjects(list);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load projects',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeWorkspace, statusFilter, search, setFeedback]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !newName.trim()) return;
    setCreating(true);
    try {
      await apiRequest<ProjectDto>({
        method: 'POST',
        path: '/api/v1/projects',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          name: newName.trim(),
          description: newDesc.trim() || undefined,
        },
      });
      setNewName('');
      setNewDesc('');
      setFeedback({ type: 'success', message: 'Project created' });
      await loadProjects();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create project',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !editingProject) return;
    try {
      await apiRequest<ProjectDto>({
        method: 'PATCH',
        path: `/api/v1/projects/${editingProject.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          name: editName.trim(),
          description: editDesc.trim() || null,
        },
      });
      setEditingProject(null);
      setFeedback({ type: 'success', message: 'Project updated' });
      await loadProjects();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update project',
      });
    }
  };

  const handleArchiveToggle = async (project: ProjectDto) => {
    if (!accessToken || !activeWorkspace) return;
    const action = project.status === 'ACTIVE' ? 'archive' : 'restore';
    try {
      await apiRequest<ProjectDto>({
        method: 'POST',
        path: `/api/v1/projects/${project.id}/${action}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setFeedback({
        type: 'success',
        message: `Project "${project.name}" ${action === 'archive' ? 'archived' : 'restored'}`,
      });
      await loadProjects();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Failed to ${action} project`,
      });
    }
  };

  const handleConfirmedDelete = async () => {
    if (!accessToken || !activeWorkspace || !confirmDeleteProject) return;
    try {
      await apiRequest({
        method: 'DELETE',
        path: `/api/v1/projects/${confirmDeleteProject.id}?confirmDelete=true`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setFeedback({
        type: 'success',
        message: `Project "${confirmDeleteProject.name}" permanently deleted`,
      });
      setConfirmDeleteProject(null);
      await loadProjects();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete project',
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="border-b border-border pb-5">
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Organize raw media uploads, AI Studio conversations, and video compositions by project.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="grid gap-3 rounded-xl border border-border bg-card/70 p-4 md:grid-cols-3"
        >
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New Project Name..."
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Optional description or campaign brief..."
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : '+ Create Project'}
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {(['ALL', 'ACTIVE', 'ARCHIVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  statusFilter === st
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-muted-foreground'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-64 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
          />
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/40 p-8 text-center text-xs text-muted-foreground/80">
            No matching projects found in this workspace.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((proj) => (
              <div
                key={proj.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card/80 p-5"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">{proj.name}</h2>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        proj.status === 'ACTIVE'
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {proj.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {proj.description || 'No description provided'}
                  </p>
                  <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground/80">
                    <span>{proj._count?.assets ?? 0} Assets</span>
                    <span>{proj._count?.conversations ?? 0} Conversations</span>
                    <span>{proj._count?.workflows ?? 0} Workflows</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/80 pt-3">
                  <Link
                    href={`/studio?projectId=${proj.id}`}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open AI Studio
                  </Link>
                  <Link
                    href={`/library?projectId=${proj.id}`}
                    className="rounded-md border border-input bg-secondary px-3 py-1.5 text-xs text-foreground hover:bg-muted/80"
                  >
                    Assets
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProject(proj);
                      setEditName(proj.name);
                      setEditDesc(proj.description ?? '');
                    }}
                    className="rounded-md border border-input px-3 py-1.5 text-xs text-foreground/90 hover:bg-secondary/80"
                  >
                    Rename / Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleArchiveToggle(proj)}
                    className="rounded-md border border-input px-3 py-1.5 text-xs text-foreground/90 hover:bg-secondary/80"
                  >
                    {proj.status === 'ACTIVE' ? 'Archive' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteProject(proj)}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold text-foreground">Edit Project</h2>
              <form onSubmit={handleUpdate} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs text-foreground/90">Project Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground/90">Description</label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingProject(null)}
                    className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground/90"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmDeleteProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-card p-6">
              <h2 className="text-base font-semibold text-foreground">Confirm Project Deletion</h2>
              <p className="mt-2 text-xs text-foreground/90">
                Are you sure you want to permanently delete{' '}
                <strong>{confirmDeleteProject.name}</strong>? This action cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteProject(null)}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground/90"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmedDelete()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-red-500"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
