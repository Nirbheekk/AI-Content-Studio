'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Film,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type VideoPlaybackPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export interface MediaVideoPlayerProps {
  src: string | null | undefined;
  downloadUrl?: string | null | undefined;
  poster?: string | null | undefined;
  label?: string | undefined;
  sizeBytes?: number | undefined;
  maxHeightClass?: string | undefined;
  className?: string | undefined;
  onRequestRefreshUrl?: (() => Promise<void> | void) | undefined;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildDownloadHref(src: string, explicitDownloadUrl?: string | null): string {
  if (explicitDownloadUrl) return explicitDownloadUrl;
  if (src.includes('/stream?')) {
    return src.includes('download=1') ? src : `${src}&download=1`;
  }
  return src;
}

function describeMediaError(video: HTMLVideoElement | null): string {
  const code = video?.error?.code;
  switch (code) {
    case 1:
      return 'Playback was aborted before loading finished.';
    case 2:
      return 'Network error or media session expired while loading video.';
    case 3:
      return 'Video decoding failed. The file may be corrupted or incomplete.';
    case 4:
      return 'Video unavailable, access expired, or format not supported by this browser.';
    default:
      return 'Unable to play video. Retry or refresh your session.';
  }
}

export function MediaVideoPlayer({
  src,
  downloadUrl,
  poster,
  label,
  sizeBytes,
  maxHeightClass = 'max-h-80',
  className,
  onRequestRefreshUrl,
}: MediaVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<VideoPlaybackPhase>(src ? 'loading' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [resolution, setResolution] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    setPhase(src ? 'loading' : 'idle');
    setErrorMsg(null);
    setDurationSec(0);
    setResolution(null);
  }, [src]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleRetry = useCallback(async () => {
    setErrorMsg(null);
    setPhase('loading');
    if (onRequestRefreshUrl) {
      await onRequestRefreshUrl();
    }
    setRetryCount((c) => c + 1);
    const el = videoRef.current;
    if (el) {
      el.load();
    }
  }, [onRequestRefreshUrl]);

  if (!src) {
    return (
      <div
        data-testid="media-video-unavailable"
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center',
          className,
        )}
      >
        <Film className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">Video not available yet</div>
        <p className="text-xs text-muted-foreground">
          Render or upload a verified MP4 to preview and play it here.
        </p>
      </div>
    );
  }

  const downloadHref = buildDownloadHref(src, downloadUrl);
  const statusLabel =
    phase === 'loading'
      ? 'Loading'
      : phase === 'buffering'
        ? 'Buffering'
        : phase === 'playing'
          ? 'Playing'
          : phase === 'paused'
            ? 'Paused'
            : phase === 'ended'
              ? 'Completed'
              : phase === 'error'
                ? 'Unavailable'
                : 'Ready';

  const statusVariant =
    phase === 'error'
      ? 'destructive'
      : phase === 'playing' || phase === 'ready' || phase === 'ended'
        ? 'success'
        : 'secondary';

  return (
    <div
      data-testid="media-video-player"
      data-playback-phase={phase}
      className={cn('space-y-2 rounded-xl border border-border bg-card p-3', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {label ?? 'Rendered MP4'}
          </span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {resolution && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {resolution}
            </span>
          )}
          {durationSec > 0 && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {formatDuration(durationSec)}
            </span>
          )}
          {typeof sizeBytes === 'number' && sizeBytes > 0 && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {(sizeBytes / (1024 * 1024) >= 1
                ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                : `${(sizeBytes / 1024).toFixed(1)} KB`)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Playback speed"
            value={String(playbackRate)}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {SPEED_OPTIONS.map((rate) => (
              <option key={rate} value={String(rate)}>
                {rate}x
              </option>
            ))}
          </select>
          <a
            href={downloadHref}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-border bg-canvas">
        {phase === 'error' ? (
          <div
            role="alert"
            data-testid="media-video-error"
            className="flex flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">Playback failed</div>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleRetry()}>
              <RefreshCw className="h-4 w-4" />
              Retry Playback
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              key={`${src}::${retryCount}`}
              src={src}
              poster={poster ?? undefined}
              controls
              playsInline
              preload="metadata"
              onLoadStart={() => {
                setErrorMsg(null);
                setPhase('loading');
              }}
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                if (Number.isFinite(el.duration) && el.duration > 0) {
                  setDurationSec(el.duration);
                }
                if (el.videoWidth > 0 && el.videoHeight > 0) {
                  setResolution(`${el.videoWidth}×${el.videoHeight}`);
                }
              }}
              onLoadedData={() => setPhase((p) => (p === 'playing' ? 'playing' : 'ready'))}
              onCanPlay={() => setPhase((p) => (p === 'playing' ? 'playing' : 'ready'))}
              onWaiting={() => setPhase('buffering')}
              onPlaying={() => setPhase('playing')}
              onPause={(e) => {
                if (!e.currentTarget.ended) setPhase('paused');
              }}
              onEnded={() => setPhase('ended')}
              onError={(e) => {
                setPhase('error');
                setErrorMsg(describeMediaError(e.currentTarget));
              }}
              className={cn(maxHeightClass, 'w-full bg-canvas object-contain')}
            />
            {(phase === 'loading' || phase === 'buffering') && (
              <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-xs text-foreground shadow-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>{phase === 'loading' ? 'Loading preview...' : 'Buffering...'}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
