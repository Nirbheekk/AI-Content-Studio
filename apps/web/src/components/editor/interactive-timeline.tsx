'use client';

import React from 'react';
import { AudioLines, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const WAVEFORM_BARS = [
  24, 48, 72, 36, 84, 62, 40, 92, 68, 44, 78, 56, 30, 88, 70, 52,
  64, 90, 42, 76, 58, 34, 82, 66, 48, 86, 60, 38, 74, 54, 46, 28,
];

export function InteractiveAudioTimeline({
  sceneTitle,
  durationInFrames,
  fps,
  playheadPercent,
  onTrimDelta,
  disabled,
}: {
  sceneTitle: string;
  durationInFrames: number;
  fps: number;
  playheadPercent: number;
  onTrimDelta: (deltaFrames: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <AudioLines className="h-4 w-4 text-audio" />
          <span>Voiceover + Ducked Music Waveform</span>
          <Badge variant="outline">
            {(durationInFrames / Math.max(1, fps)).toFixed(1)}s ({durationInFrames}f)
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || durationInFrames <= 45}
            onClick={() => onTrimDelta(-15)}
          >
            <Minus className="h-4 w-4" />
            0.5s
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onTrimDelta(15)}
          >
            <Plus className="h-4 w-4" />
            0.5s
          </Button>
        </div>
      </div>

      <div
        aria-label={`Audio waveform for ${sceneTitle}`}
        className="relative flex h-12 items-end gap-1 overflow-hidden rounded-xl border border-border bg-card px-3 py-2"
      >
        {WAVEFORM_BARS.map((heightPct, idx) => {
          const barPct = (idx / WAVEFORM_BARS.length) * 100;
          const active = barPct <= playheadPercent;
          return (
            <div
              key={idx}
              className={
                active
                  ? 'flex-1 rounded-full bg-primary transition-colors duration-150'
                  : 'flex-1 rounded-full bg-muted-foreground/30 transition-colors duration-150'
              }
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
