'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  FolderKanban,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest, ProjectDto } from '../../lib/api-client';

function formatCleanTitle(raw: string): string {
  return raw.replace(/[-_]\d{10,14}$/, '').trim() || raw;
}

function formatUpdatedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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

  const brandPrimary = activeWorkspace?.brandKit?.primaryColor ?? '#6956E8';

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Projects"
          description="Organize raw media uploads, AI Studio sessions, production workflows, and video compositions by campaign project."
          badge={<Badge variant="ai">{projects.length} Projects</Badge>}
        />

        {/* Quick Create Project Bar */}
        <Card className="p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-foreground">
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span>Create New Campaign Project</span>
          </div>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <Input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New Project Name..."
              />
            </div>
            <div className="md:col-span-5">
              <Input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional description or campaign brief..."
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={creating} className="w-full">
                <FolderPlus className="h-3.5 w-3.5" />
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Filter Tabs & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
            {(['ALL', 'ACTIVE', 'ARCHIVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={statusFilter === st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-8 text-xs"
            />
          </div>
        </div>

        {/* Project Cards Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5 text-primary" />}
            title="No matching projects found"
            description="Create a project above or adjust your status filter and search query."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((proj) => {
              const displayTitle = formatCleanTitle(proj.name);
              return (
                <Card
                  key={proj.id}
                  className="flex flex-col justify-between p-5 transition-colors hover:border-primary/40"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-xs font-bold text-white shadow-sm"
                          style={{ backgroundColor: brandPrimary }}
                        >
                          {displayTitle.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h2
                            title={proj.name}
                            className="truncate text-base font-semibold text-foreground"
                          >
                            {displayTitle}
                          </h2>
                          <div className="text-[11px] text-muted-foreground">
                            Updated {formatUpdatedDate(proj.updatedAt)}
                          </div>
                        </div>
                      </div>
                      <Badge variant={proj.status === 'ACTIVE' ? 'success' : 'warning'}>
                        {proj.status}
                      </Badge>
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                      {proj.description ||
                        'Creative production workspace for raw media, AI scripts, and rendered video compositions.'}
                    </p>

                    <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-center text-[11px] tabular-nums">
                      <div>
                        <div className="font-semibold text-foreground">
                          {proj._count?.assets ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Assets</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">
                          {proj._count?.conversations ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Sessions</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">
                          {proj._count?.workflows ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Workflows</div>
                      </div>
                    </div>
                  </div>

                  {/* Clean Single-Row Action Hierarchy */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/studio?projectId=${proj.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Open AI Studio
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                      <Link
                        href={`/library?projectId=${proj.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        Assets
                      </Link>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        title="Rename or edit project"
                        onClick={() => {
                          setEditingProject(proj);
                          setEditName(proj.name);
                          setEditDesc(proj.description ?? '');
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Rename
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title={proj.status === 'ACTIVE' ? 'Archive project' : 'Restore project'}
                        onClick={() => void handleArchiveToggle(proj)}
                      >
                        {proj.status === 'ACTIVE' ? (
                          <>
                            <Archive className="h-3 w-3" />
                            Archive
                          </>
                        ) : (
                          <>
                            <ArchiveRestore className="h-3 w-3" />
                            Restore
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete project"
                        aria-label={`Delete ${proj.name}`}
                        onClick={() => setConfirmDeleteProject(proj)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Edit Modal */}
        {editingProject && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-project-title"
          >
            <Card className="w-full max-w-md p-6 shadow-xl">
              <h2 id="edit-project-title" className="text-base font-semibold text-foreground">
                Edit Project
              </h2>
              <form onSubmit={handleUpdate} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Project Name
                  </label>
                  <Input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Description
                  </label>
                  <Textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingProject(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save Changes
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Destructive Delete Confirmation Dialog */}
        {confirmDeleteProject && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <Card className="w-full max-w-md border-destructive/40 p-6 shadow-xl">
              <h2 id="delete-project-title" className="text-base font-semibold text-foreground">
                Confirm Project Deletion
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Are you sure you want to permanently delete{' '}
                <strong className="text-foreground">{confirmDeleteProject.name}</strong>? This
                action removes associated conversations and cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDeleteProject(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleConfirmedDelete()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirm Delete
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
