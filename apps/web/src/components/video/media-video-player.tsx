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
import { resolveMediaUrl } from '@/lib/api-client';
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

export type VideoFailureCategory =
  | 'unauthorized'
  | 'forbidden'
  | 'expired'
  | 'missing'
  | 'unsupported'
  | 'network'
  | 'server'
  | 'unknown';

export interface MediaVideoPlayerProps {
  src: string | null | undefined;
  downloadUrl?: string | null | undefined;
  poster?: string | null | undefined;
  label?: string | undefined;
  sizeBytes?: number | undefined;
  maxHeightClass?: string | undefined;
  className?: string | undefined;
  onRequestRefreshUrl?: (() => Promise<void> | void) | undefined;
  onPhaseChange?: ((phase: VideoPlaybackPhase) => void) | undefined;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildDownloadHref(resolvedSrc: string, explicitDownloadUrl?: string | null): string {
  const resolvedExplicit = resolveMediaUrl(explicitDownloadUrl);
  if (resolvedExplicit) return resolvedExplicit;
  if (resolvedSrc.includes('/stream?')) {
    return resolvedSrc.includes('download=1') ? resolvedSrc : `${resolvedSrc}&download=1`;
  }
  return resolvedSrc;
}

function describeMediaError(video: HTMLVideoElement | null): {
  category: VideoFailureCategory;
  message: string;
} {
  const code = video?.error?.code;
  switch (code) {
    case 1:
      return { category: 'network', message: 'Playback was aborted before loading finished.' };
    case 2:
      return {
        category: 'network',
        message: 'Network interruption while streaming video. Click Retry to reconnect.',
      };
    case 3:
      return {
        category: 'unsupported',
        message: 'Video decoding failed. The MP4 file may be corrupted or incomplete.',
      };
    case 4:
      return {
        category: 'unknown',
        message: 'Video source could not be loaded. Checking exact error reason...',
      };
    default:
      return {
        category: 'unknown',
        message: 'Unable to play video. Retry or refresh the preview link.',
      };
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
  onPhaseChange,
}: MediaVideoPlayerProps) {
  const resolvedSrc = resolveMediaUrl(src);
  const resolvedPoster = resolveMediaUrl(poster);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhaseState] = useState<VideoPlaybackPhase>(resolvedSrc ? 'loading' : 'idle');
  const [failureCategory, setFailureCategory] = useState<VideoFailureCategory | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [resolution, setResolution] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [retrying, setRetrying] = useState<boolean>(false);

  const updatePhase = useCallback(
    (next: VideoPlaybackPhase) => {
      setPhaseState(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange],
  );

  useEffect(() => {
    updatePhase(resolvedSrc ? 'loading' : 'idle');
    setFailureCategory(null);
    setErrorMsg(null);
    setDurationSec(0);
    setResolution(null);
  }, [resolvedSrc, updatePhase]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const diagnoseFailure = useCallback(async (targetUrl: string, fallback: { category: VideoFailureCategory; message: string }) => {
    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: { range: 'bytes=0-0' },
        credentials: 'include',
      });
      if (res.status === 401) {
        setFailureCategory('expired');
        setErrorMsg('Media access token expired or unauthorized (HTTP 401). Click Retry to refresh your playback link.');
      } else if (res.status === 403) {
        setFailureCategory('forbidden');
        setErrorMsg('Access denied for this workspace video (HTTP 403).');
      } else if (res.status === 404) {
        setFailureCategory('missing');
        setErrorMsg('Video file is missing from storage or has been deleted (HTTP 404). Re-render to regenerate.');
      } else if (res.status >= 500) {
        setFailureCategory('server');
        setErrorMsg(`Storage or streaming server error (HTTP ${res.status}). Retry in a moment.`);
      } else if (res.status === 200 || res.status === 206) {
        setFailureCategory('unsupported');
        setErrorMsg('Video file downloaded, but browser could not decode its codec/container. Re-render as H.264/yuv420p.');
      } else {
        setFailureCategory(fallback.category);
        setErrorMsg(`Unexpected media response (HTTP ${res.status}).`);
      }
    } catch {
      setFailureCategory('network');
      setErrorMsg('Could not reach the media streaming server. Check API connectivity and retry.');
    }
  }, []);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setErrorMsg(null);
    setFailureCategory(null);
    updatePhase('loading');
    try {
      if (onRequestRefreshUrl) {
        await onRequestRefreshUrl();
      }
      setRetryCount((c) => c + 1);
      const el = videoRef.current;
      if (el) {
        el.load();
      }
    } finally {
      setRetrying(false);
    }
  }, [onRequestRefreshUrl, retrying, updatePhase]);

  if (!resolvedSrc) {
    return (
      <div
        data-testid="media-video-unavailable"
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center',
          className,
        )}
      >
        <Film className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">Final MP4 not available yet</div>
        <p className="text-xs text-muted-foreground">
          Render or upload a verified MP4 to preview, seek, and download it here.
        </p>
      </div>
    );
  }

  const downloadHref = buildDownloadHref(resolvedSrc, downloadUrl);
  const canDownload = phase !== 'error';
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
                ? failureCategory === 'expired'
                  ? 'Link Expired'
                  : failureCategory === 'missing'
                    ? 'Missing File'
                    : failureCategory === 'forbidden'
                      ? 'Forbidden'
                      : 'Unavailable'
                : 'Ready';

  const statusVariant =
    phase === 'error'
      ? 'destructive'
      : phase === 'playing' || phase === 'ready' || phase === 'ended' || phase === 'paused'
        ? 'success'
        : 'secondary';

  return (
    <div
      data-testid="media-video-player"
      data-playback-phase={phase}
      data-failure-category={failureCategory ?? ''}
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
              {sizeBytes / (1024 * 1024) >= 1
                ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                : `${(sizeBytes / 1024).toFixed(1)} KB`}
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
          {canDownload && (
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
          )}
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
              <div className="text-sm font-semibold text-foreground">
                {failureCategory === 'expired'
                  ? 'Playback link expired'
                  : failureCategory === 'missing'
                    ? 'Video object missing'
                    : failureCategory === 'forbidden'
                      ? 'Access denied'
                      : 'Playback failed'}
              </div>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={() => void handleRetry()}
            >
              <RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} />
              {retrying ? 'Refreshing...' : 'Retry Playback'}
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              key={`${resolvedSrc}::${retryCount}`}
              src={resolvedSrc}
              poster={resolvedPoster ?? undefined}
              controls
              playsInline
              preload="metadata"
              onLoadStart={() => {
                setErrorMsg(null);
                setFailureCategory(null);
                updatePhase('loading');
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
              onLoadedData={() => updatePhase(phase === 'playing' ? 'playing' : 'ready')}
              onCanPlay={() => updatePhase(phase === 'playing' ? 'playing' : 'ready')}
              onWaiting={() => updatePhase('buffering')}
              onPlaying={() => updatePhase('playing')}
              onPause={(e) => {
                if (!e.currentTarget.ended) updatePhase('paused');
              }}
              onEnded={() => updatePhase('ended')}
              onError={(e) => {
                const fallback = describeMediaError(e.currentTarget);
                updatePhase('error');
                setFailureCategory(fallback.category);
                setErrorMsg(fallback.message);
                void diagnoseFailure(resolvedSrc, fallback);
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
