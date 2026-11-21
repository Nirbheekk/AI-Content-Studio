'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  Film,
  FolderKanban,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Button,
  Card,
  Empty,
  Input,
  Label,
  PageHeader,
  Skeleton,
  StatusIndicator,
  Textarea,
} from '@/components/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStudio } from '@/context/studio-context';
import { apiRequest, ProjectDto } from '@/lib/api-client';

export default function ProjectsPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<ProjectDto | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectDto | null>(null);

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
        body: { name: newName.trim(), description: newDesc.trim() || undefined },
      });
      setNewName('');
      setNewDesc('');
      setCreateOpen(false);
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
    if (!accessToken || !activeWorkspace || !editing) return;
    try {
      await apiRequest<ProjectDto>({
        method: 'PATCH',
        path: `/api/v1/projects/${editing.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { name: editName.trim(), description: editDesc.trim() || null },
      });
      setEditing(null);
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

  const handleDelete = async () => {
    if (!accessToken || !activeWorkspace || !deleteTarget) return;
    try {
      await apiRequest({
        method: 'DELETE',
        path: `/api/v1/projects/${deleteTarget.id}?confirmDelete=true`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setFeedback({ type: 'success', message: `Deleted "${deleteTarget.name}"` });
      setDeleteTarget(null);
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
      <div className="space-y-5">
        <PageHeader
          title="Projects"
          description="Campaign containers holding media assets, AI Studio sessions, and compositions."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Project
            </Button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'ACTIVE' | 'ARCHIVED' | 'ALL')}
          >
            <TabsList>
              <TabsTrigger value="ACTIVE">Active</TabsTrigger>
              <TabsTrigger value="ARCHIVED">Archived</TabsTrigger>
              <TabsTrigger value="ALL">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-8"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Empty
            icon={<FolderKanban className="h-5 w-5" />}
            title="No matching projects"
            description="Create a project to organize assets, AI Studio workflows, and rendered videos."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
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
                    <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                    <StatusIndicator status={project.status} />
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {project.description || 'No description'}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{project._count?.assets ?? 0} assets</span>
                    <span>·</span>
                    <span>{project._count?.compositions ?? 0} compositions</span>
                    <span>·</span>
                    <span>{project._count?.workflows ?? 0} runs</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" className="flex-1" asChild>
                      <Link href={`/studio?projectId=${encodeURIComponent(project.id)}`}>
                        <Sparkles className="h-3 w-3" />
                        AI Studio
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/library?projectId=${encodeURIComponent(project.id)}`}>
                        <Upload className="h-3 w-3" />
                        Media
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/editor?projectId=${encodeURIComponent(project.id)}`}>
                        <Film className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit project"
                      onClick={() => {
                        setEditing(project);
                        setEditName(project.name);
                        setEditDesc(project.description ?? '');
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={project.status === 'ACTIVE' ? 'Archive project' : 'Restore project'}
                      onClick={() => void handleArchiveToggle(project)}
                    >
                      {project.status === 'ACTIVE' ? (
                        <Archive className="h-3.5 w-3.5" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete project"
                      onClick={() => setDeleteTarget(project)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Organize campaign media, workflows, and exports.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Q4 Product Launch"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc">Description</Label>
              <Textarea
                id="proj-desc"
                rows={3}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Campaign brief or goals..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update project name and description.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-proj-name">Name</Label>
              <Input
                id="edit-proj-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-proj-desc">Description</Label>
              <Textarea
                id="edit-proj-desc"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project?</DialogTitle>
            <DialogDescription>
              Permanently delete &ldquo;{deleteTarget?.name}&rdquo; and unlink its workspace records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
