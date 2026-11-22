'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useStudio } from '@/context/studio-context';
import { apiRequest, ProjectDto } from '@/lib/api-client';

const PLATFORMS = [
  { value: 'INSTAGRAM_REELS', label: 'Instagram Reels (9:16)' },
  { value: 'TIKTOK', label: 'TikTok (9:16)' },
  { value: 'YOUTUBE_SHORTS', label: 'YouTube Shorts (9:16)' },
  { value: 'LINKEDIN_VIDEO', label: 'LinkedIn Video (4:5)' },
  { value: 'YOUTUBE_LANDSCAPE', label: 'YouTube Landscape (16:9)' },
];

const QUICK_BRIEFS = [
  '15s product launch reel with bold hook and 3 feature scenes',
  'Fast-paced educational short explaining 3 AI workflows',
  'Founder insight clip with kinetic captions and clear CTA',
];

export function NewCreationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { accessToken, activeWorkspace, activeProjectId, setActiveProjectId, setFeedback } =
    useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState<string>(activeProjectId ?? '');
  const [newProjectName, setNewProjectName] = useState('');
  const [platform, setPlatform] = useState('INSTAGRAM_REELS');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !accessToken || !activeWorkspace) return;
    apiRequest<ProjectDto[]>({
      path: '/api/v1/projects?status=ACTIVE',
      accessToken,
      workspaceId: activeWorkspace.id,
    })
      .then((list) => {
        const items = Array.isArray(list) ? list : [];
        setProjects(items);
        const preferred =
          (activeProjectId && items.some((p) => p.id === activeProjectId)
            ? activeProjectId
            : null) ?? items[0]?.id;
        if (!projectId && preferred) {
          setProjectId(preferred);
        }
      })
      .catch(() => {
        // Ignore transient fetch error; user can still create a new project
      });
  }, [open, accessToken, activeWorkspace, activeProjectId, projectId]);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace) return;
    setSubmitting(true);
    try {
      let targetProjectId = projectId;
      if (targetProjectId === '__new__' || !targetProjectId) {
        const name = newProjectName.trim() || `Campaign ${new Date().toLocaleDateString()}`;
        const created = await apiRequest<ProjectDto>({
          method: 'POST',
          path: '/api/v1/projects',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: { name, description: prompt.trim() || 'Created from New Creation flow' },
        });
        targetProjectId = created.id;
      }

      if (targetProjectId) {
        setActiveProjectId(targetProjectId);
      }

      const params = new URLSearchParams();
      params.set('projectId', targetProjectId);
      params.set('platform', platform);
      if (prompt.trim()) {
        params.set('prompt', prompt.trim());
      }
      onOpenChange(false);
      setPrompt('');
      setNewProjectName('');
      router.push(`/studio?${params.toString()}`);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start creation',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ai" />
            New Creation
          </DialogTitle>
          <DialogDescription>
            Pick a project, format, and creative brief to launch straight into AI Studio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleLaunch} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nc-project">Project</Label>
              <NativeSelect
                id="nc-project"
                value={projectId || '__new__'}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new__">+ Create new project</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-platform">Target Format</Label>
              <NativeSelect
                id="nc-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {(projectId === '__new__' || projects.length === 0) && (
            <div className="space-y-1.5">
              <Label htmlFor="nc-project-name">New Project Name</Label>
              <Input
                id="nc-project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g., Q4 Product Launch"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nc-prompt">Creative Brief</Label>
            <Textarea
              id="nc-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the hook, pacing, key message, and CTA..."
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_BRIEFS.map((brief) => (
                <button
                  key={brief}
                  type="button"
                  onClick={() => setPrompt(brief)}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground"
                >
                  {brief.slice(0, 44)}...
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Launching...' : 'Open in AI Studio'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
