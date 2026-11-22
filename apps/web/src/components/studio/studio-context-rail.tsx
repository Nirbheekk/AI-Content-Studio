'use client';

import React, { useRef } from 'react';
import { FolderPlus, MessageSquare, Plus, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  NativeSelect,
  StatusIndicator,
} from '@/components/design-system/primitives';
import { AssetDto, ConversationDto, ProjectDto } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export function StudioContextRail({
  projects,
  selectedProjectId,
  onSelectProject,
  projectAssets,
  uploadingAsset,
  onUploadFile,
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  onOpenNewProject,
}: {
  projects: ProjectDto[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  projectAssets: AssetDto[];
  uploadingAsset: boolean;
  onUploadFile: (file: File) => void;
  conversations: ConversationDto[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onCreateConversation: (title: string) => void;
  onOpenNewProject: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sessionTitle, setSessionTitle] = React.useState('');

  const generatedCount = projectAssets.filter(
    (a) =>
      a.folderPath === '/rendered-videos' ||
      a.folderPath === '/youtube-viral-clips' ||
      a.tags?.includes('rendered-video') ||
      a.tags?.includes('youtube-viral-clip'),
  ).length;
  const sourceCount = Math.max(0, projectAssets.length - generatedCount);

  const handleNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateConversation(sessionTitle.trim() || `Session ${conversations.length + 1}`);
    setSessionTitle('');
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Project Context
          </span>
          <Button variant="ghost" size="sm" onClick={onOpenNewProject}>
            <FolderPlus className="h-3 w-3" />
            New
          </Button>
        </div>

        <NativeSelect
          aria-label="Active project"
          value={selectedProjectId}
          onChange={(e) => onSelectProject(e.target.value)}
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">
              {projectAssets.length} total asset{projectAssets.length === 1 ? '' : 's'}
            </div>
            <div>
              {sourceCount} source · {generatedCount} generated
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="video/*,audio/*,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingAsset || !selectedProjectId}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            {uploadingAsset ? 'Uploading...' : 'Upload'}
          </Button>
        </div>

        {projectAssets.length > 0 && (
          <div className="max-h-28 space-y-1 overflow-y-auto studio-scrollbar">
            {projectAssets.slice(0, 6).map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs"
              >
                <span className="truncate font-medium">{asset.originalName}</span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {asset.assetType}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions
          </span>
          <span className="text-xs text-muted-foreground">{conversations.length}</span>
        </div>

        <form onSubmit={handleNewSession} className="mb-2 flex gap-1.5">
          <Input
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            placeholder="New session title..."
            className="h-7 text-xs"
          />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Create session">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="flex-1 space-y-1 overflow-y-auto studio-scrollbar">
          {conversations.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Start a session or send a prompt.
            </p>
          ) : (
            conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelectConversation(conv.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                    active
                      ? 'border-foreground/30 bg-accent text-foreground'
                      : 'border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    <span className="truncate font-medium">{conv.title}</span>
                  </div>
                  {conv.workflows?.[0] && (
                    <StatusIndicator status={conv.workflows[0].stage} />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}
