'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { useStudio } from '../../context/studio-context';
import { apiRequest, AssetDto, ProjectDto } from '../../lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? 'B'}`;
}

export default function ContentLibraryPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Upload state
  const [uploadProjectId, setUploadProjectId] = useState<string>('');
  const [folderPath, setFolderPath] = useState<string>('/raw-clips');
  const [tagsInput, setTagsInput] = useState<string>('podcast, hook');
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
            folderPath: folderPath.trim() || '/',
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

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="border-b border-border pb-5">
          <h1 className="text-2xl font-bold text-foreground">Content Asset Library &amp; AI Analysis</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload raw media to MinIO object storage with magic-byte validation, SHA-256 duplicate
            detection, automated STT transcription, and scene hook extraction.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card/70 p-5">
          <h2 className="text-sm font-semibold text-foreground">Upload Media to MinIO Storage</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="block text-[11px] text-muted-foreground">Assign to Project</label>
              <select
                value={uploadProjectId}
                onChange={(e) => setUploadProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              >
                <option value="">Workspace Global Library</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-muted-foreground">Virtual Folder Path</label>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/podcast/clips"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-[11px] text-muted-foreground">Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="hook, b-roll, ep1"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-[11px] text-muted-foreground">Select File(s)</label>
              <label className="mt-1 flex cursor-pointer items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
            >
              <option value="">All Media Types</option>
              <option value="VIDEO">VIDEO</option>
              <option value="AUDIO">AUDIO</option>
              <option value="IMAGE">IMAGE</option>
              <option value="DOCUMENT">DOCUMENT</option>
            </select>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename..."
            className="w-64 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
          />
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Loading content library...</div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/40 p-10 text-center text-xs text-muted-foreground/80">
            No assets uploaded yet. Use the upload panel above to add videos, images, audio, or
            documents.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card/80 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {asset.assetType}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        asset.status === 'READY'
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {asset.status}
                    </span>
                  </div>

                  <h3 className="mt-2 truncate text-sm font-semibold text-foreground">
                    {asset.originalName}
                  </h3>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatBytes(asset.sizeBytes)} • {asset.mimeType}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground/80">
                    Folder: {asset.folderPath} • Project: {asset.project?.name ?? 'Global'}
                  </div>

                  {asset.aiSummary && (
                    <p className="mt-2 line-clamp-2 rounded border border-border bg-background/70 p-2 text-[11px] text-foreground/90">
                      {asset.aiSummary}
                    </p>
                  )}

                  {asset.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-secondary px-2 py-0.5 text-[10px] text-foreground/90"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    disabled={analyzingId === asset.id}
                    onClick={() => void handleAnalyzeAsset(asset)}
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {analyzingId === asset.id ? 'Analyzing...' : 'AI Analyze & Transcribe'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenPreview(asset)}
                    className="rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80"
                  >
                    Inspect
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(asset)}
                    className="rounded-md border border-red-500/40 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {previewAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">{previewAsset.originalName}</h2>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 space-y-2 text-xs text-foreground/90">
                <div>
                  <strong>MIME Type (Magic-Byte Verified):</strong> {previewAsset.mimeType}
                </div>
                <div>
                  <strong>Size:</strong> {formatBytes(previewAsset.sizeBytes)}
                </div>
                <div>
                  <strong>SHA-256 Checksum:</strong>{' '}
                  <span className="font-mono text-[11px]">{previewAsset.checksumSha256}</span>
                </div>
                {previewAsset.aiSummary && (
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">
                    <strong>Content Intelligence Summary:</strong> {previewAsset.aiSummary}
                  </div>
                )}
              </div>

              {previewAsset.transcript && (
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Word-Synchronized Transcript ({previewAsset.transcript.language})</span>
                    <span className="text-[10px] text-muted-foreground">
                      Provider: {previewAsset.transcript.provider}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-foreground/90">{previewAsset.transcript.fullText}</p>
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
                      className="flex items-center justify-between rounded border border-border bg-background px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-primary">
                          Scene #{sc.sceneIndex + 1} ({sc.startSec}s - {sc.endSec}s)
                        </span>
                        <div className="text-[11px] text-muted-foreground">{sc.description}</div>
                      </div>
                      <div className="text-right">
                        <span className="rounded bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                          Hook: {Math.round((sc.hookScore ?? 0.8) * 100)}%
                        </span>
                        {sc.isBroll && (
                          <div className="mt-1 text-[10px] text-cyan-300">B-Roll Cutaway</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {previewAsset.downloadUrl && (
                <div className="mt-4">
                  <a
                    href={previewAsset.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Open Presigned MinIO Download URL
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-card p-6">
              <h2 className="text-base font-semibold text-foreground">Delete Asset</h2>
              <p className="mt-2 text-xs text-foreground/90">
                Delete <strong>{deleteTarget.originalName}</strong> from MinIO object storage and
                workspace metadata?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs text-foreground/90"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-foreground"
                >
                  Delete Asset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
