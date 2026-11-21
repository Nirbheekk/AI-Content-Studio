'use client';

import React from 'react';
import { Download } from 'lucide-react';

export function VideoPlayer({
  src,
  label,
  sizeBytes,
  maxHeightClass = 'max-h-72',
}: {
  src: string;
  label?: string;
  sizeBytes?: number;
  maxHeightClass?: string;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {label ?? 'Rendered MP4'}
          {typeof sizeBytes === 'number' && (
            <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
              ({(sizeBytes / 1024).toFixed(1)} KB)
            </span>
          )}
        </span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Download MP4
        </a>
      </div>
      <video
        key={src}
        controls
        playsInline
        preload="metadata"
        src={src}
        className={`${maxHeightClass} w-full rounded-lg border border-border bg-canvas object-contain`}
      />
    </div>
  );
}
