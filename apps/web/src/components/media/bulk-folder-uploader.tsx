'use client';

import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FolderUp,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useStudio } from '@/context/studio-context';
import { apiRequest, AssetDto } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface UploadQueueItem {
  id: string;
  file: File;
  relativeFolder: string;
  status: 'queued' | 'uploading' | 'done' | 'duplicate' | 'error' | 'cancelled';
  error?: string | undefined;
}

interface BulkFolderUploaderProps {
  projectId: string;
  baseFolderPath: string;
  tags: string[];
  onComplete: (summary: { uploaded: number; duplicates: number; failed: number }) => void;
}

function deriveRelativeFolder(baseFolder: string, file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  const cleanBase = (baseFolder.trim() || '/raw-clips').replace(/\/+$/, '');
  if (!rel || !rel.includes('/')) {
    return cleanBase || '/';
  }
  const dirParts = rel.split('/').slice(0, -1).filter((p) => p && p !== '.' && p !== '..');
  if (dirParts.length === 0) return cleanBase || '/';
  return `${cleanBase}/${dirParts.join('/')}`.replace(/\/+/g, '/');
}

export function BulkFolderUploader({
  projectId,
  baseFolderPath,
  tags,
  onComplete,
}: BulkFolderUploaderProps) {
  const { accessToken, activeWorkspace } = useStudio();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);

  const enqueueFiles = (fileList: FileList | File[]) => {
    const items: UploadQueueItem[] = Array.from(fileList)
      .filter((f) => f.size > 0)
      .map((file, idx) => ({
        id: `${Date.now()}-${idx}-${file.name}`,
        file,
        relativeFolder: deriveRelativeFolder(baseFolderPath, file),
        status: 'queued',
      }));
    setQueue((prev) => [...prev, ...items]);
  };

  const runQueue = async (onlyFailed = false) => {
    if (!accessToken || !activeWorkspace || running) return;
    cancelledRef.current = false;
    setRunning(true);

    let uploaded = 0;
    let duplicates = 0;
    let failed = 0;

    const targets = queue.filter((item) =>
      onlyFailed ? item.status === 'error' || item.status === 'cancelled' : item.status === 'queued',
    );

    for (const item of targets) {
      if (cancelledRef.current) {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'cancelled' } : q)),
        );
        continue;
      }

      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', error: undefined } : q)),
      );

      try {
        const mimeType = item.file.type || 'application/octet-stream';
        const arrayBuffer = await item.file.arrayBuffer();

        const initRes = await apiRequest<{
          asset: AssetDto;
          directUploadPath: string;
        }>({
          method: 'POST',
          path: '/api/v1/assets/upload-url',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {
            originalName: item.file.name,
            mimeType,
            sizeBytes: item.file.size || arrayBuffer.byteLength || 1,
            ...(projectId ? { projectId } : {}),
            folderPath: item.relativeFolder,
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

        const completed = await apiRequest<AssetDto>({
          method: 'POST',
          path: `/api/v1/assets/${initRes.asset.id}/complete`,
          accessToken,
          workspaceId: activeWorkspace.id,
          body: { tags },
        });

        if (completed.isDuplicate) {
          duplicates += 1;
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'duplicate' } : q)),
          );
        } else {
          uploaded += 1;
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'done' } : q)),
          );
        }
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'error', error: msg } : q)),
        );
      }
    }

    setRunning(false);
    onComplete({ uploaded, duplicates, failed });
  };

  const completedCount = queue.filter(
    (q) => q.status === 'done' || q.status === 'duplicate',
  ).length;
  const failedCount = queue.filter((q) => q.status === 'error' || q.status === 'cancelled').length;
  const queuedCount = queue.filter((q) => q.status === 'queued').length;
  const overallPct = queue.length > 0 ? Math.round((completedCount / queue.length) * 100) : 0;

  return (
    <div className="space-y-3" data-testid="bulk-folder-uploader">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            enqueueFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20',
        )}
      >
        <FolderUp className="h-7 w-7 text-muted-foreground" />
        <div className="text-xs font-medium text-foreground">
          Drag &amp; drop files here, or pick files / a nested folder
        </div>
        <p className="text-xs text-muted-foreground">
          Preserves nested folder structure, validates magic bytes, and deduplicates via SHA-256.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) enqueueFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) enqueueFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Select Files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp className="h-3.5 w-3.5" />
            Select Folder
          </Button>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              {completedCount}/{queue.length} uploaded ({overallPct}%)
            </span>
            <div className="flex items-center gap-1.5">
              {running ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    cancelledRef.current = true;
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              ) : (
                <>
                  {failedCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void runQueue(true)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry Failed ({failedCount})
                    </Button>
                  )}
                  {queuedCount > 0 && (
                    <Button type="button" size="sm" onClick={() => void runQueue(false)}>
                      <Upload className="h-3.5 w-3.5" />
                      Upload {queuedCount} File{queuedCount === 1 ? '' : 's'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <Progress value={overallPct} />

          <div className="max-h-40 space-y-1 overflow-y-auto studio-scrollbar">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{item.file.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.relativeFolder}
                    {item.error ? ` · ${item.error}` : ''}
                  </div>
                </div>
                {item.status === 'uploading' && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                )}
                {item.status === 'done' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                )}
                {item.status === 'duplicate' && <Badge variant="secondary">Duplicate</Badge>}
                {item.status === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                {item.status === 'queued' && <Badge variant="outline">Queued</Badge>}
                {item.status === 'cancelled' && <Badge variant="outline">Cancelled</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
