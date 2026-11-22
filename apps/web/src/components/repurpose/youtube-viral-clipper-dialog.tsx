'use client';

import React, { useState } from 'react';
import { Flame, Loader2, Scissors, Youtube } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Label,
  NativeSelect,
} from '@/components/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStudio } from '@/context/studio-context';
import { apiRequest, ProjectDto } from '@/lib/api-client';

export interface YoutubeViralClipDto {
  rank: number;
  assetId: string;
  fileName: string;
  streamUrl?: string | null;
  downloadUrl: string;
  thumbnailUrl: string | null;
  startSec: number;
  timestamp: string;
  durationSec: number;
  viralScore: number;
  hookTitle: string;
  transcript: string;
  captionEvents: number;
  sizeBytes: number;
  layout: 'SPLIT_WEBCAM_BOTTOM' | 'CENTER_CROP_9_16';
}

export interface YoutubeViralClipResultDto {
  projectId: string;
  youtubeUrl: string;
  videoId: string;
  videoTitle: string;
  layout: 'SPLIT_WEBCAM_BOTTOM' | 'CENTER_CROP_9_16';
  clips: YoutubeViralClipDto[];
}

interface YoutubeViralClipperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectDto[];
  defaultProjectId: string;
  onClipsGenerated: (result: YoutubeViralClipResultDto) => void;
}

export function YoutubeViralClipperDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  onClipsGenerated,
}: YoutubeViralClipperDialogProps) {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [layout, setLayout] = useState<'SPLIT_WEBCAM_BOTTOM' | 'CENTER_CROP_9_16'>(
    'SPLIT_WEBCAM_BOTTOM',
  );
  const [webcamPreset, setWebcamPreset] = useState<
    'LEFT_MIDDLE' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'TOP_LEFT' | 'TOP_RIGHT'
  >('LEFT_MIDDLE');
  const [clipCount, setClipCount] = useState(3);
  const [clipDurationSec, setClipDurationSec] = useState(22);
  const [badgeLabel, setBadgeLabel] = useState('LIVE CLIP');
  const [submitting, setSubmitting] = useState(false);

  const resolvedProjectId = projectId || defaultProjectId || projects[0]?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !resolvedProjectId || !youtubeUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiRequest<YoutubeViralClipResultDto>({
        method: 'POST',
        path: '/api/v1/repurpose/youtube-clip',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId: resolvedProjectId,
          youtubeUrl: youtubeUrl.trim(),
          clipCount,
          clipDurationSec,
          layout,
          webcamPreset,
          badgeLabel: badgeLabel.trim() || 'LIVE CLIP',
        },
      });
      onClipsGenerated(res);
      setFeedback({
        type: 'success',
        message: `Detected & rendered ${res.clips.length} viral clip${res.clips.length === 1 ? '' : 's'} into Media Library`,
      });
      onOpenChange(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'YouTube viral clipping failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Youtube className="h-3.5 w-3.5" />
              Viral AI Clipper
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Flame className="h-3 w-3" />
              9:16 Karaoke + Split-Screen
            </Badge>
          </div>
          <DialogTitle>Clip YouTube Stream or Video</DialogTitle>
          <DialogDescription>
            Paste any YouTube URL to auto-detect top viral moments, score them, and render 9:16
            Reels/Shorts with burned-in karaoke captions directly to your Media Library.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="yt-clip-url">YouTube URL</Label>
            <Input
              id="yt-clip-url"
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="yt-clip-project">Destination Project</Label>
              <NativeSelect
                id="yt-clip-project"
                value={resolvedProjectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="yt-clip-layout">Frame Layout</Label>
              <NativeSelect
                id="yt-clip-layout"
                value={layout}
                onChange={(e) =>
                  setLayout(e.target.value as 'SPLIT_WEBCAM_BOTTOM' | 'CENTER_CROP_9_16')
                }
              >
                <option value="SPLIT_WEBCAM_BOTTOM">Split-Screen (Gameplay Top + Webcam Below)</option>
                <option value="CENTER_CROP_9_16">Full-Bleed Center Crop (9:16)</option>
              </NativeSelect>
            </div>
          </div>

          {layout === 'SPLIT_WEBCAM_BOTTOM' && (
            <div className="space-y-1.5">
              <Label htmlFor="yt-clip-webcam">Source Webcam Position</Label>
              <NativeSelect
                id="yt-clip-webcam"
                value={webcamPreset}
                onChange={(e) =>
                  setWebcamPreset(
                    e.target.value as
                      | 'LEFT_MIDDLE'
                      | 'BOTTOM_LEFT'
                      | 'BOTTOM_RIGHT'
                      | 'TOP_LEFT'
                      | 'TOP_RIGHT',
                  )
                }
              >
                <option value="LEFT_MIDDLE">Left Middle (Streamer Overlay)</option>
                <option value="BOTTOM_LEFT">Bottom Left</option>
                <option value="BOTTOM_RIGHT">Bottom Right</option>
                <option value="TOP_LEFT">Top Left</option>
                <option value="TOP_RIGHT">Top Right</option>
              </NativeSelect>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="yt-clip-count">Top Clips</Label>
              <NativeSelect
                id="yt-clip-count"
                value={String(clipCount)}
                onChange={(e) => setClipCount(Number(e.target.value))}
              >
                <option value="1">1 Clip</option>
                <option value="2">2 Clips</option>
                <option value="3">3 Clips</option>
                <option value="4">4 Clips</option>
                <option value="5">5 Clips</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="yt-clip-duration">Duration</Label>
              <NativeSelect
                id="yt-clip-duration"
                value={String(clipDurationSec)}
                onChange={(e) => setClipDurationSec(Number(e.target.value))}
              >
                <option value="15">15 sec</option>
                <option value="22">22 sec</option>
                <option value="30">30 sec</option>
                <option value="45">45 sec</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="yt-clip-badge">Top Badge</Label>
              <Input
                id="yt-clip-badge"
                maxLength={28}
                value={badgeLabel}
                onChange={(e) => setBadgeLabel(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !resolvedProjectId || !youtubeUrl.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Detecting &amp; Rendering...
                </>
              ) : (
                <>
                  <Scissors className="h-4 w-4" />
                  Detect &amp; Render Viral Clips
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
