'use client';

import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompiledView } from '@/components/studio/studio-types';

/**
 * 60fps declarative React Composition Preview Player.
 * Renders the validated CompositionSpec AST directly in-browser with
 * spring entrance transitions, word-level karaoke caption highlights,
 * safe-zone guides, and real-time playhead progress.
 */
export function RemotionLivePlayer({
  compiled,
  currentFrame,
}: {
  compiled: CompiledView;
  currentFrame: number;
}) {
  const [showSafeZones, setShowSafeZones] = useState(false);

  const activeScene =
    compiled.sequences.find(
      (s) => currentFrame >= s.startFrame && currentFrame < s.endFrame,
    ) ?? compiled.sequences[0];

  const currentSec = currentFrame / Math.max(1, compiled.fps);
  const localFrame = activeScene ? Math.max(0, currentFrame - activeScene.startFrame) : 0;
  const entranceProgress = Math.min(1, localFrame / 12);
  const scale = 0.94 + entranceProgress * 0.06;
  const translateY = (1 - entranceProgress) * 14;
  const progressPct = Math.min(
    100,
    Math.round((currentFrame / Math.max(1, compiled.durationInFrames - 1)) * 100),
  );

  const captionWords = activeScene?.captionWords ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="outline">
          {compiled.width}×{compiled.height} · {compiled.fps}fps
        </Badge>
        <Button
          type="button"
          variant={showSafeZones ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowSafeZones((prev) => !prev)}
        >
          <Eye className="h-4 w-4" />
          Safe Zones
        </Button>
      </div>

      <div
        className="relative flex min-h-96 w-full flex-col justify-between overflow-hidden rounded-2xl border border-border p-6 text-primary-foreground shadow-sm"
        style={{
          background: `linear-gradient(155deg, ${compiled.brand.primaryColor}, ${compiled.brand.secondaryColor})`,
        }}
      >
        {showSafeZones && (
          <div className="pointer-events-none absolute inset-4 rounded-xl border border-dashed border-primary-foreground/50" />
        )}

        <div className="flex items-center justify-between text-xs opacity-90">
          <span className="font-semibold uppercase tracking-wider">{compiled.templateId}</span>
          <span className="font-mono tabular-nums">
            Scene {(activeScene?.orderIndex ?? 0) + 1}/{compiled.sequences.length}
          </span>
        </div>

        <div
          className="my-auto space-y-3 text-center transition-transform duration-150"
          style={{
            transform: `translateY(${translateY}px) scale(${scale})`,
            opacity: entranceProgress,
          }}
        >
          <div className="text-xl font-bold leading-tight tracking-tight">
            {activeScene?.headlineText ?? 'Studio Preview'}
          </div>
          {activeScene && captionWords.length === 0 && (
            <p className="text-xs opacity-90">{activeScene.narrationText}</p>
          )}
        </div>

        {/* Word-level Karaoke Highlighted Captions */}
        <div className="space-y-3">
          {captionWords.length > 0 && (
            <div className="rounded-xl bg-canvas/75 px-3 py-2 text-center text-xs font-semibold leading-relaxed">
              {captionWords.map((w, idx) => {
                const isSpoken = currentSec >= w.startSec && currentSec <= w.endSec + 0.15;
                const isPast = currentSec > w.endSec + 0.15;
                return (
                  <span
                    key={`${w.word}-${idx}`}
                    className="mx-0.5 inline-block transition-colors duration-150"
                    style={{
                      color: isSpoken
                        ? compiled.captions.highlightColor
                        : isPast
                          ? compiled.brand.accentColor
                          : undefined,
                      transform: isSpoken ? 'scale(1.08)' : undefined,
                    }}
                  >
                    {w.word}
                  </span>
                );
              })}
            </div>
          )}

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas/50">
            <div
              className="h-full transition-all duration-150"
              style={{
                width: `${progressPct}%`,
                backgroundColor: compiled.brand.accentColor,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
