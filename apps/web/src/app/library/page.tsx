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

        // 1. Request upload slot & presigned URL
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

        // 2. Upload binary payload to MinIO via authenticated stream endpoint
        await apiRequest<AssetDto>({
          method: 'PUT',
          path: initRes.directUploadPath,
          accessToken,
          workspaceId: activeWorkspace.id,
          rawBody: arrayBuffer,
          contentType: mimeType,
        });

        // 3. Finalize upload & trigger server-side magic-byte inspection + media-worker job
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
        <div className="border-b border-zinc-800 pb-5">
          <h1 className="text-2xl font-bold text-white">Content Asset Library</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Upload raw videos, audio, images, and documents to MinIO object storage with automatic
            magic-byte inspection and SHA-256 duplicate detection.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-white">Upload Media to MinIO Storage</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="block text-[11px] text-zinc-400">Assign to Project</label>
              <select
                value={uploadProjectId}
                onChange={(e) => setUploadProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
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
              <label className="block text-[11px] text-zinc-400">Virtual Folder Path</label>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/podcast/clips"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400">Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="hook, b-roll, ep1"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400">Select File(s)</label>
              <label className="mt-1 flex cursor-pointer items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500">
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
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white"
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
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white"
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
            className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white"
          />
        </div>

        {loading ? (
          <div className="text-xs text-zinc-400">Loading content library...</div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center text-xs text-zinc-500">
            No assets uploaded yet. Use the upload panel above to add videos, images, audio, or
            documents.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                      {asset.assetType}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        asset.status === 'READY'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {asset.status}
                    </span>
                  </div>

                  <h3 className="mt-2 truncate text-sm font-semibold text-white">
                    {asset.originalName}
                  </h3>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    {formatBytes(asset.sizeBytes)} • {asset.mimeType}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Folder: {asset.folderPath} • Project: {asset.project?.name ?? 'Global'}
                  </div>

                  {asset.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
                  <button
                    type="button"
                    onClick={() => setPreviewAsset(asset)}
                    className="flex-1 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Preview &amp; Signed URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(asset)}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
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
            <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">{previewAsset.originalName}</h2>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 space-y-2 text-xs text-zinc-300">
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
                <div>
                  <strong>Storage Key:</strong>{' '}
                  <span className="font-mono text-[11px]">{previewAsset.storageKey}</span>
                </div>
              </div>

              {previewAsset.downloadUrl && (
                <div className="mt-4">
                  <a
                    href={previewAsset.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
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
            <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-zinc-900 p-6">
              <h2 className="text-base font-semibold text-white">Delete Asset</h2>
              <p className="mt-2 text-xs text-zinc-300">
                Delete <strong>{deleteTarget.originalName}</strong> from MinIO object storage and
                workspace metadata?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
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
