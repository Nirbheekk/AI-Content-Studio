'use client';

import React, { useEffect, useState } from 'react';
import { Subtitles } from 'lucide-react';
import { Badge, Button, Card } from '@/components/design-system/primitives';
import { apiRequest } from '@/lib/api-client';
import type { CaptionPresetSpec } from '@ai-content-os/shared';

export interface CaptionPresetBarProps {
  accessToken: string | null;
  workspaceId: string | null;
  compositionId: string | null;
  currentHighlightColor: string;
  currentFontSizePx: number;
  disabled?: boolean | undefined;
  onApplied: () => Promise<void>;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}

const FALLBACK_CAPTION_PRESETS: ReadonlyArray<
  Pick<
    CaptionPresetSpec,
    'id' | 'name' | 'description' | 'fontSizePx' | 'highlightColor' | 'marginV' | 'animation' | 'position'
  >
> = [
  { id: 'clean-minimal', name: 'Clean Minimal', description: 'Readable sans-serif subtitles.', fontSizePx: 46, highlightColor: '#F4F4F5', marginV: 240, animation: 'fade-slide', position: 'safe-bottom' },
  { id: 'bold-creator', name: 'Bold Creator', description: 'High-contrast uppercase creator captions.', fontSizePx: 58, highlightColor: '#FFE600', marginV: 280, animation: 'karaoke-fill', position: 'safe-bottom' },
  { id: 'kinetic-word-highlight', name: 'Kinetic Word Highlight', description: 'Rapid 2-3 word active-word pop.', fontSizePx: 64, highlightColor: '#22D3EE', marginV: 720, animation: 'word-pop', position: 'center-seam' },
  { id: 'podcast-premium', name: 'Podcast Premium', description: 'Warm conversational lower-third captions.', fontSizePx: 50, highlightColor: '#F59E0B', marginV: 260, animation: 'karaoke-fill', position: 'safe-bottom' },
  { id: 'cinematic-subtitles', name: 'Cinematic Subtitles', description: 'Restrained film-style subtitles.', fontSizePx: 40, highlightColor: '#F8FAFC', marginV: 200, animation: 'none', position: 'safe-bottom' },
  { id: 'high-energy-shorts', name: 'High-Energy Shorts', description: 'Seam-positioned neon karaoke.', fontSizePx: 60, highlightColor: '#00E6FF', marginV: 765, animation: 'karaoke-fill', position: 'center-seam' },
  { id: 'educational-explainer', name: 'Educational Explainer', description: 'Structured phrase captions.', fontSizePx: 48, highlightColor: '#34D399', marginV: 250, animation: 'karaoke-fill', position: 'safe-bottom' },
  { id: 'brand-custom', name: 'Brand Custom', description: 'Inherits active workspace Brand Kit.', fontSizePx: 52, highlightColor: '#6366F1', marginV: 260, animation: 'karaoke-fill', position: 'safe-bottom' },
];

function mapPresetToCaptionPatch(
  preset: Pick<
    CaptionPresetSpec,
    'fontSizePx' | 'highlightColor' | 'marginV' | 'animation' | 'position'
  >,
) {
  const style =
    preset.position === 'center-seam' && preset.animation === 'word-pop'
      ? 'kinetic-center'
      : preset.animation === 'karaoke-fill'
        ? 'karaoke-pop'
        : preset.animation === 'word-pop'
          ? 'word-highlight'
          : 'minimal-lower';
  return {
    enabled: true,
    style,
    fontSizePx: Math.min(120, Math.max(20, preset.fontSizePx)),
    highlightColor: preset.highlightColor.slice(0, 7),
    safeBottomMarginPx: Math.min(400, Math.max(80, Math.min(360, preset.marginV))),
  };
}

export function CaptionPresetBar({
  accessToken,
  workspaceId,
  compositionId,
  currentHighlightColor,
  currentFontSizePx,
  disabled,
  onApplied,
  onFeedback,
}: CaptionPresetBarProps) {
  const [presets, setPresets] = useState<
    ReadonlyArray<
      Pick<
        CaptionPresetSpec,
        'id' | 'name' | 'description' | 'fontSizePx' | 'highlightColor' | 'marginV' | 'animation' | 'position'
      >
    >
  >(FALLBACK_CAPTION_PRESETS);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;
    let active = true;
    void apiRequest<{ captionPresets: CaptionPresetSpec[] }>({
      path: '/api/v1/shorts/presets',
      accessToken,
      workspaceId,
    })
      .then((res) => {
        if (active && res.captionPresets.length > 0) {
          setPresets(res.captionPresets);
        }
      })
      .catch(() => {
        // Keep static fallback presets
      });
    return () => {
      active = false;
    };
  }, [accessToken, workspaceId]);

  const handleApplyPreset = async (
    preset: Pick<
      CaptionPresetSpec,
      'id' | 'name' | 'fontSizePx' | 'highlightColor' | 'marginV' | 'animation' | 'position'
    >,
  ) => {
    if (!accessToken || !workspaceId || !compositionId) return;
    setApplyingId(preset.id);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${compositionId}/patch`,
        accessToken,
        workspaceId,
        body: {
          changeSummary: `Applied "${preset.name}" caption preset`,
          patches: [
            {
              op: 'UPDATE_CAPTION_STYLE',
              patch: mapPresetToCaptionPatch(preset),
            },
          ],
        },
      });
      await onApplied();
      onFeedback({
        type: 'success',
        message: `Applied "${preset.name}" caption preset.`,
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to apply caption preset',
      });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Card className="p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Subtitles className="h-3.5 w-3.5 text-primary" />
          <span>Caption Presets (8 Styles)</span>
        </div>
        <Badge variant="outline" className="font-mono tabular-nums">
          {currentFontSizePx}px
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {presets.map((preset) => {
          const isMatch =
            preset.highlightColor.slice(0, 7).toLowerCase() ===
              currentHighlightColor.toLowerCase() &&
            preset.fontSizePx === currentFontSizePx;
          return (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={isMatch ? 'default' : 'outline'}
              disabled={disabled || !compositionId || applyingId !== null}
              onClick={() => void handleApplyPreset(preset)}
              className="h-auto justify-start px-2.5 py-1.5 text-left text-xs"
              title={preset.description}
            >
              <span className="truncate">
                {applyingId === preset.id ? 'Applying…' : preset.name}
              </span>
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
