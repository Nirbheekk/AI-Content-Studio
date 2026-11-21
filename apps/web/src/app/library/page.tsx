'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Eye,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/design-system/primitives';
import { VideoPlayer } from '../../components/creative/video-player';
import { useStudio } from '../../context/studio-context';
import { apiRequest, AssetDto, ProjectDto } from '../../lib/api-client';

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

export default function ContentLibraryPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Upload state
  const [uploadProjectId, setUploadProjectId] = useState<string>('');
  const [folderPath, setFolderPath] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Preview & Delete modals
  const [previewAsset, setPreviewAsset] = useState<AssetDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetDto | null>(null);

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
        message: err instanceof Error ? err.message : 'Failed to load content library',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeWorkspace, selectedProjectId, typeFilter, search, setFeedback]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !accessToken || !activeWorkspace) return;

    setUploading(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      for (const file of Array.from(files)) {
        const mimeType = file.type || 'text/plain';
        const arrayBuffer = await file.arrayBuffer();

        const initRes = await apiRequest<{
          asset: AssetDto;
          uploadUrl: string;
          directUploadPath: string;
        }>({
          method: 'POST',
          path: '/api/v1/assets/upload-url',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {
            originalName: file.name,
            mimeType,
            sizeBytes: file.size || arrayBuffer.byteLength || 1,
            ...(uploadProjectId ? { projectId: uploadProjectId } : {}),
            folderPath: folderPath.trim() || '/raw-clips',
            tags,
          },
        });

        await apiRequest<AssetDto>({
          method: 'PUT',
          path: initRes.directUploadPath,
          accessToken,
          workspaceId: activeWorkspace.id,
          rawBody: arrayBuffer,
          contentType: mimeType,
        });

        await apiRequest<AssetDto>({
          method: 'POST',
          path: `/api/v1/assets/${initRes.asset.id}/complete`,
          accessToken,
          workspaceId: activeWorkspace.id,
          body: { tags },
        });
      }

      setFeedback({
        type: 'success',
        message: `Uploaded and verified ${files.length} file(s) in MinIO`,
      });
      e.target.value = '';
      await loadLibrary();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Asset upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyzeAsset = async (asset: AssetDto) => {
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
      setFeedback({
        type: 'success',
        message: `Extracted transcript, scenes, and derivatives for "${asset.originalName}"`,
      });
      await loadLibrary();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Asset analysis failed',
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleOpenPreview = async (asset: AssetDto) => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const detail = await apiRequest<AssetDto>({
        path: `/api/v1/assets/${asset.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setPreviewAsset(detail);
    } catch {
      setPreviewAsset(asset);
    }
  };

  const handleConfirmDelete = async () => {
    if (!accessToken || !activeWorkspace || !deleteTarget) return;
    try {
      await apiRequest({
        method: 'DELETE',
        path: `/api/v1/assets/${deleteTarget.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setFeedback({
        type: 'success',
        message: `Deleted "${deleteTarget.originalName}" from MinIO and database`,
      });
      setDeleteTarget(null);
      await loadLibrary();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete asset',
      });
    }
  };

  const renderAssetTypeIcon = (type: AssetDto['assetType']) => {
    if (type === 'VIDEO') return <Film className="h-5 w-5 text-primary" />;
    if (type === 'AUDIO') return <Music className="h-5 w-5 text-info" />;
    if (type === 'IMAGE') return <ImageIcon className="h-5 w-5 text-success" />;
    return <FileText className="h-5 w-5 text-warning" />;
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Media Library"
          description="Ingest raw footage, audio, and brand assets with magic-byte validation, SHA-256 deduplication, STT transcription, and scene hook analysis."
          badge={<Badge variant="ai">{assets.length} Assets</Badge>}
        />

        {/* Upload Dropzone & Configuration Card */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Upload className="h-4 w-4 text-primary" />
              <span>Upload Media to MinIO Object Storage</span>
            </div>
            <Badge variant="outline">Magic-Byte &amp; SHA-256 Verified</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Assign to Project
              </label>
              <Select
                aria-label="Assign to Project"
                value={uploadProjectId}
                onChange={(e) => setUploadProjectId(e.target.value)}
              >
                <option value="">Workspace Global Library</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatCleanTitle(p.name)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Virtual Folder Path
              </label>
              <Input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/raw-clips"
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Tags (comma-separated)
              </label>
              <Input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="hook, b-roll, ep1"
              />
            </div>

            <div className="flex flex-col justify-end md:col-span-3">
              <label className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95">
                <Upload className="h-3.5 w-3.5" />
                <span>{uploading ? 'Uploading & Verifying...' : 'Choose Files to Upload'}</span>
                <input
                  type="file"
                  multiple
                  disabled={uploading}
                  onChange={(e) => void handleFileUpload(e)}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </Card>

        {/* Filters, Search & Grid/List View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Filter by project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-auto min-w-[170px]"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatCleanTitle(p.name)}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Filter by media type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-auto min-w-[155px]"
            >
              <option value="">All Media Types</option>
              <option value="VIDEO">VIDEO</option>
              <option value="AUDIO">AUDIO</option>
              <option value="IMAGE">IMAGE</option>
              <option value="DOCUMENT">DOCUMENT</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by filename..."
                className="pl-8 text-xs"
              />
            </div>

            <div className="flex items-center rounded-lg border border-border bg-card p-1">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Asset Cards Grid / List */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<Upload className="h-5 w-5 text-primary" />}
            title="No media assets in library yet"
            description="Upload raw videos, audio recordings, images, or script documents above to run AI transcription and scene hook extraction."
          />
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'space-y-3'
            }
          >
            {assets.map((asset) => (
              <Card
                key={asset.id}
                className="flex flex-col justify-between overflow-hidden p-4 transition-colors hover:border-primary/40"
              >
                <div>
                  {/* Visual Media Header */}
                  <div className="mb-3 flex h-24 items-center justify-between rounded-lg border border-border bg-secondary/50 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                        {renderAssetTypeIcon(asset.assetType)}
                      </div>
                      <div>
                        <Badge variant="ai">{asset.assetType}</Badge>
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatBytes(asset.sizeBytes)}
                        </div>
                      </div>
                    </div>
                    <Badge variant={asset.status === 'READY' ? 'success' : 'warning'}>
                      {asset.status}
                    </Badge>
                  </div>

                  <h3
                    title={asset.originalName}
                    className="truncate text-sm font-semibold text-foreground"
                  >
                    {asset.originalName}
                  </h3>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span>{asset.mimeType}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {asset.folderPath}
                    </span>
                    <span>•</span>
                    <span>
                      {asset.project?.name ? formatCleanTitle(asset.project.name) : 'Global'}
                    </span>
                  </div>

                  {asset.aiSummary && (
                    <p className="mt-2.5 line-clamp-2 rounded-lg border border-border bg-secondary/35 p-2 text-[11px] text-foreground">
                      {asset.aiSummary}
                    </p>
                  )}

                  {asset.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.map((tag) => (
                        <Badge key={tag} variant="default">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ai"
                      disabled={analyzingId === asset.id}
                      onClick={() => void handleAnalyzeAsset(asset)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {analyzingId === asset.id ? 'Analyzing...' : 'AI Analyze'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleOpenPreview(asset)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Inspect
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${asset.originalName}`}
                    onClick={() => setDeleteTarget(asset)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Asset Inspection & Real Preview Modal */}
        {previewAsset && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspect-asset-title"
          >
            <Card className="max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {renderAssetTypeIcon(previewAsset.assetType)}
                  <h2
                    id="inspect-asset-title"
                    className="truncate text-base font-semibold text-foreground"
                  >
                    {previewAsset.originalName}
                  </h2>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPreviewAsset(null)}>
                  Close
                </Button>
              </div>

              {/* Real Media Playback Preview when downloadUrl exists */}
              {previewAsset.downloadUrl && previewAsset.assetType === 'VIDEO' && (
                <div className="mt-4">
                  <VideoPlayer
                    src={previewAsset.downloadUrl}
                    sizeBytes={previewAsset.sizeBytes}
                  />
                </div>
              )}

              {previewAsset.downloadUrl && previewAsset.assetType === 'AUDIO' && (
                <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-3">
                  <audio controls src={previewAsset.downloadUrl} className="w-full" />
                </div>
              )}

              <div className="mt-4 grid gap-2 rounded-xl border border-border bg-secondary/35 p-3.5 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">MIME Type (Magic-Byte Verified): </span>
                  <strong className="text-foreground">{previewAsset.mimeType}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">File Size: </span>
                  <strong className="font-mono text-foreground tabular-nums">
                    {formatBytes(previewAsset.sizeBytes)}
                  </strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">SHA-256 Checksum: </span>
                  <span className="break-all font-mono text-[11px] text-foreground">
                    {previewAsset.checksumSha256}
                  </span>
                </div>
              </div>

              {previewAsset.aiSummary && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-ai-surface p-3.5 text-xs text-foreground">
                  <strong className="text-primary">Content Intelligence Summary:</strong>{' '}
                  {previewAsset.aiSummary}
                </div>
              )}

              {previewAsset.transcript && (
                <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Word-Synchronized Transcript ({previewAsset.transcript.language})</span>
                    <Badge variant="outline">Provider: {previewAsset.transcript.provider}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-foreground">
                    {previewAsset.transcript.fullText}
                  </p>
                </div>
              )}

              {previewAsset.scenes && previewAsset.scenes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-xs font-semibold text-foreground">
                    Detected Scenes &amp; Hook Scores
                  </h3>
                  {previewAsset.scenes.map((sc) => (
                    <div
                      key={sc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/35 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-primary tabular-nums">
                          Scene #{sc.sceneIndex + 1} ({sc.startSec}s – {sc.endSec}s)
                        </span>
                        <div className="text-[11px] text-muted-foreground">{sc.description}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="success">
                          Hook: {Math.round((sc.hookScore ?? 0.8) * 100)}%
                        </Badge>
                        {sc.isBroll && <Badge variant="info">B-Roll Cutaway</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {previewAsset.downloadUrl && (
                <div className="mt-4 flex justify-end">
                  <a
                    href={previewAsset.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
                  >
                    Open Presigned MinIO Download URL
                  </a>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Destructive Delete Asset Modal */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-asset-title"
          >
            <Card className="w-full max-w-md border-destructive/40 p-6 shadow-xl">
              <h2 id="delete-asset-title" className="text-base font-semibold text-foreground">
                Delete Asset
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Delete <strong className="text-foreground">{deleteTarget.originalName}</strong> from
                MinIO object storage and workspace metadata?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void handleConfirmDelete()}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Asset
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
