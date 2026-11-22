'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { BulkFolderUploader } from '@/components/media/bulk-folder-uploader';
import { MediaRightsPanel } from '@/components/media/media-rights-panel';
import { SemanticSearchPanel } from '@/components/media/semantic-search-panel';
import { MediaVideoPlayer } from '@/components/video/media-video-player';
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  Skeleton,
  StatusIndicator,
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useStudio } from '@/context/studio-context';
import { apiRequest, AssetDto, ProjectDto } from '@/lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] ?? 'B'}`;
}

function AssetIcon({ type }: { type: AssetDto['assetType'] }) {
  if (type === 'VIDEO') return <Film className="h-4 w-4 text-video" />;
  if (type === 'AUDIO') return <Music className="h-4 w-4 text-audio" />;
  if (type === 'IMAGE') return <ImageIcon className="h-4 w-4 text-image" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export default function MediaLibraryPage() {
  const { accessToken, activeWorkspace, activeProjectId, setActiveProjectId, setFeedback } =
    useStudio();

  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId ?? '');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState('');
  const [folderPath, setFolderPath] = useState('/raw-clips');
  const [tagsInput, setTagsInput] = useState('');

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetDto | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const proj = new URLSearchParams(window.location.search).get('projectId');
    if (proj) {
      setSelectedProjectId(proj);
      setUploadProjectId(proj);
      setActiveProjectId(proj);
    } else if (activeProjectId) {
      setUploadProjectId(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId]);

  const loadLibrary = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.set('projectId', selectedProjectId);
      if (typeFilter) params.set('assetType', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const [assetList, projectList] = await Promise.all([
        apiRequest<AssetDto[]>({
          path: `/api/v1/assets?${params.toString()}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<ProjectDto[]>({
          path: '/api/v1/projects',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);
      setAssets(assetList);
      setProjects(projectList);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load media library',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeWorkspace, selectedProjectId, typeFilter, search, setFeedback]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const handleAnalyze = async (asset: AssetDto) => {
    if (!accessToken || !activeWorkspace) return;
    setAnalyzingId(asset.id);
    try {
      const analyzed = await apiRequest<AssetDto>({
        method: 'POST',
        path: `/api/v1/assets/${asset.id}/analyze`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setPreviewAsset(analyzed);
      setFeedback({ type: 'success', message: `Analyzed "${asset.originalName}"` });
      await loadLibrary();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Analysis failed',
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleOpenInspect = async (asset: AssetDto) => {
    if (!accessToken || !activeWorkspace) return;
    const detail = await apiRequest<AssetDto>({
      path: `/api/v1/assets/${asset.id}`,
      accessToken,
      workspaceId: activeWorkspace.id,
    }).catch(() => asset);
    setPreviewAsset(detail);
  };

  const handleDelete = async () => {
    if (!accessToken || !activeWorkspace || !deleteTarget) return;
    try {
      await apiRequest({
        method: 'DELETE',
        path: `/api/v1/assets/${deleteTarget.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setFeedback({ type: 'success', message: `Deleted "${deleteTarget.originalName}"` });
      setDeleteTarget(null);
      if (previewAsset?.id === deleteTarget.id) setPreviewAsset(null);
      await loadLibrary();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="Media Library"
          description="Upload raw clips, run Whisper transcription & scene analysis, then hand off to AI Studio."
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={
                    selectedProjectId
                      ? `/studio?projectId=${encodeURIComponent(selectedProjectId)}`
                      : '/studio'
                  }
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Continue to AI Studio
                </Link>
              </Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Upload Media
              </Button>
            </>
          }
        />

        <WorkflowStepper activeStep="brief" projectId={selectedProjectId || undefined} />

        <SemanticSearchPanel
          projectId={selectedProjectId}
          onSelectAssetId={(assetId) => {
            const match = assets.find((a) => a.id === assetId);
            if (match) {
              void handleOpenInspect(match);
            } else if (accessToken && activeWorkspace) {
              void apiRequest<AssetDto>({
                path: `/api/v1/assets/${assetId}`,
                accessToken,
                workspaceId: activeWorkspace.id,
              })
                .then((detail) => setPreviewAsset(detail))
                .catch(() => null);
            }
          }}
        />

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search media..."
                className="pl-8"
              />
            </div>
            <div className="w-44">
              <NativeSelect
                aria-label="Filter by project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-36">
              <NativeSelect
                aria-label="Filter by media type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="VIDEO">Video</option>
                <option value="AUDIO">Audio</option>
                <option value="IMAGE">Image</option>
                <option value="DOCUMENT">Document</option>
              </NativeSelect>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <Empty
            icon={<Upload className="h-5 w-5" />}
            title="No media assets yet"
            description="Upload videos, podcasts, or images to analyze and compose in AI Studio."
            action={
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Upload Files
              </Button>
            }
          />
        ) : viewMode === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <Card key={asset.id} interactive className="flex flex-col justify-between p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <AssetIcon type={asset.assetType} />
                      <button
                        type="button"
                        onClick={() => void handleOpenInspect(asset)}
                        className="truncate text-left text-xs font-semibold hover:underline"
                      >
                        {asset.originalName}
                      </button>
                    </div>
                    <StatusIndicator status={asset.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{asset.assetType}</span>
                    <span>·</span>
                    <span>{formatBytes(asset.sizeBytes)}</span>
                    <span>·</span>
                    <span>{asset.folderPath}</span>
                  </div>
                  {asset.aiSummary && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {asset.aiSummary}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={analyzingId === asset.id}
                      onClick={() => void handleAnalyze(asset)}
                    >
                      <Wand2 className="h-3 w-3" />
                      {analyzingId === asset.id ? 'Analyzing...' : 'Analyze'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleOpenInspect(asset)}>
                      Inspect
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete asset"
                    onClick={() => setDeleteTarget(asset)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <AssetIcon type={asset.assetType} />
                  <button
                    type="button"
                    onClick={() => void handleOpenInspect(asset)}
                    className="truncate font-medium hover:underline"
                  >
                    {asset.originalName}
                  </button>
                  <Badge variant="outline">{formatBytes(asset.sizeBytes)}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status={asset.status} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={analyzingId === asset.id}
                    onClick={() => void handleAnalyze(asset)}
                  >
                    Analyze
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(asset)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription>
              Files are validated by magic bytes, deduplicated via SHA-256, and stored in MinIO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lib-up-proj">Attach to Project</Label>
              <NativeSelect
                id="lib-up-proj"
                value={uploadProjectId}
                onChange={(e) => setUploadProjectId(e.target.value)}
              >
                <option value="">Workspace-wide</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lib-folder">Folder</Label>
                <Input
                  id="lib-folder"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lib-tags">Tags (comma-separated)</Label>
                <Input
                  id="lib-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="broll, founder, hook"
                />
              </div>
            </div>
            <BulkFolderUploader
              projectId={uploadProjectId}
              baseFolderPath={folderPath}
              tags={tagsInput
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)}
              onComplete={({ uploaded, duplicates, failed }) => {
                if (uploaded > 0 || duplicates > 0) {
                  setFeedback({
                    type: failed > 0 ? 'error' : 'success',
                    message: `Uploaded ${uploaded} file(s)${duplicates ? `, ${duplicates} duplicate(s)` : ''}${failed ? `, ${failed} failed` : ''}`,
                  });
                  void loadLibrary();
                  if (failed === 0) setUploadOpen(false);
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Asset Inspector Sheet */}
      <Sheet open={Boolean(previewAsset)} onOpenChange={(o) => !o && setPreviewAsset(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{previewAsset?.originalName}</SheetTitle>
            <SheetDescription>
              {previewAsset?.mimeType} · {previewAsset ? formatBytes(previewAsset.sizeBytes) : ''}
            </SheetDescription>
          </SheetHeader>
          {previewAsset && (
            <div className="mt-4 flex-1 space-y-4 overflow-y-auto studio-scrollbar">
              <div className="flex items-center gap-2">
                <StatusIndicator status={previewAsset.status} />
                <Badge variant="outline">{previewAsset.folderPath}</Badge>
              </div>
              {previewAsset.assetType === 'VIDEO' && (
                <MediaVideoPlayer
                  src={previewAsset.streamUrl ?? previewAsset.downloadUrl}
                  downloadUrl={
                    previewAsset.streamUrl
                      ? `${previewAsset.streamUrl}&download=1`
                      : previewAsset.downloadUrl
                  }
                  label={previewAsset.originalName}
                  sizeBytes={previewAsset.sizeBytes}
                  onRequestRefreshUrl={() => void handleOpenInspect(previewAsset)}
                />
              )}
              {previewAsset.assetType === 'AUDIO' && (previewAsset.streamUrl || previewAsset.downloadUrl) && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <audio
                    controls
                    src={previewAsset.streamUrl ?? previewAsset.downloadUrl ?? undefined}
                    className="w-full"
                  />
                </div>
              )}
              {previewAsset.assetType === 'IMAGE' && (previewAsset.streamUrl || previewAsset.downloadUrl) && (
                <img
                  src={previewAsset.streamUrl ?? previewAsset.downloadUrl ?? undefined}
                  alt={previewAsset.originalName}
                  className="max-h-72 w-full rounded-lg border border-border bg-canvas object-contain"
                />
              )}
              <MediaRightsPanel
                asset={previewAsset}
                onUpdated={() => {
                  void handleOpenInspect(previewAsset);
                  void loadLibrary();
                }}
              />
              {previewAsset.aiSummary && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <div className="mb-1 font-semibold">AI Summary</div>
                  <p className="text-muted-foreground">{previewAsset.aiSummary}</p>
                </div>
              )}
              {previewAsset.transcript && (
                <div className="rounded-md border border-border p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">Transcript</span>
                    <Badge variant="outline">{previewAsset.transcript.language}</Badge>
                  </div>
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                    {previewAsset.transcript.fullText}
                  </p>
                </div>
              )}
              {previewAsset.scenes && previewAsset.scenes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold">
                    Detected Scenes ({previewAsset.scenes.length})
                  </div>
                  {previewAsset.scenes.map((scene) => (
                    <div
                      key={scene.id}
                      className="rounded-md border border-border p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          Scene {scene.sceneIndex + 1} ({scene.startSec}s – {scene.endSec}s)
                        </span>
                        {scene.hookScore != null && (
                          <Badge variant="ai">Hook {scene.hookScore}</Badge>
                        )}
                      </div>
                      {scene.description && (
                        <p className="mt-1 text-muted-foreground">{scene.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Asset?</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{deleteTarget?.originalName}&rdquo; from MinIO storage and database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
