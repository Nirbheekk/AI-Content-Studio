'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Film,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Empty,
  StatusIndicator,
} from '@/components/design-system/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoPlayer } from '@/components/creative/video-player';
import { RemotionLivePlayer } from '@/components/creative/remotion-live-player';
import { WorkflowDto } from '@/lib/api-client';
import {
  CompiledView,
  CompositionVersionView,
  QaReportView,
  RenderJobView,
} from './studio-types';

export function StudioPreviewPane({
  compiled,
  activeCompositionId,
  activeVersion,
  activeWorkflow,
  renderJob,
  qaReport,
  isSimulatedMode,
  currentFrame,
  isPlaying,
  onTogglePlay,
  onSeekFrame,
  onUndoRedo,
  onApprove,
}: {
  compiled: CompiledView | null;
  activeCompositionId: string | null;
  activeVersion: CompositionVersionView | null;
  activeWorkflow: WorkflowDto | null;
  renderJob: RenderJobView | null;
  qaReport: QaReportView | null;
  isSimulatedMode: boolean;
  currentFrame: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekFrame: (frame: number) => void;
  onUndoRedo: (dir: 'undo' | 'redo') => void;
  onApprove: () => void;
}) {
  const isApproved = activeWorkflow?.stage === 'APPROVED' || activeWorkflow?.stage === 'PUBLISHED';

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Live Preview</span>
          {activeVersion && (
            <Badge variant="outline">v{activeVersion.versionNumber}</Badge>
          )}
          {isSimulatedMode && <Badge variant="warning">Simulated</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!activeCompositionId}
            onClick={() => onUndoRedo('undo')}
            aria-label="Undo version"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!activeCompositionId}
            onClick={() => onUndoRedo('redo')}
            aria-label="Redo version"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 studio-scrollbar">
        {!compiled ? (
          <Empty
            icon={<Film className="h-5 w-5" />}
            title="No composition rendered yet"
            description="Send a creative brief in the center panel to generate a playable preview."
          />
        ) : (
          <Tabs defaultValue="preview">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="preview">Canvas</TabsTrigger>
              <TabsTrigger value="scenes">Scenes ({compiled.sequences.length})</TabsTrigger>
              <TabsTrigger value="qa">QA & Export</TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="space-y-3">
              {renderJob?.downloadUrl && renderJob.outputSizeBytes > 2048 ? (
                <VideoPlayer src={renderJob.downloadUrl} label={compiled.templateId} />
              ) : (
                <RemotionLivePlayer compiled={compiled} currentFrame={currentFrame} />
              )}

              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, compiled.durationInFrames - 1)}
                  value={currentFrame}
                  onChange={(e) => onSeekFrame(Number(e.target.value))}
                  aria-label="Timeline scrubber"
                  className="h-1.5 flex-1 accent-primary"
                />
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {(currentFrame / compiled.fps).toFixed(1)}s / {compiled.totalDurationSec.toFixed(1)}s
                </span>
              </div>

              {/* Human Approval Gate + Guided Handoffs */}
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    Human Approval Gate
                  </div>
                  {activeWorkflow && <StatusIndicator status={activeWorkflow.stage} />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeWorkflow && !isApproved && (
                    <Button size="sm" onClick={onApprove} className="w-full">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve for Publishing
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link
                      href={
                        activeCompositionId
                          ? `/editor?compositionId=${encodeURIComponent(activeCompositionId)}`
                          : '/editor'
                      }
                    >
                      <Film className="h-3 w-3" />
                      Refine in Editor
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link href="/repurpose">
                      <Repeat className="h-3 w-3" />
                      Repurpose
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link href="/publish">
                      <Send className="h-3 w-3" />
                      Publish
                    </Link>
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="scenes" className="space-y-2">
              {compiled.sequences.map((scene) => (
                <button
                  key={scene.sceneId}
                  type="button"
                  onClick={() => onSeekFrame(scene.startFrame)}
                  className="w-full rounded-md border border-border p-2.5 text-left transition-colors hover:border-foreground/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      #{scene.orderIndex + 1} · {scene.headlineText}
                    </span>
                    <Badge variant="outline">{scene.layout}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {scene.narrationText}
                  </p>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="qa" className="space-y-3">
              {qaReport ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Visual QA Report</span>
                    <Badge variant={qaReport.passed ? 'success' : 'warning'}>
                      {qaReport.overallScore}/100
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{qaReport.summary}</p>
                  {qaReport.defects.length > 0 && (
                    <ul className="space-y-1 pt-1 text-xs text-warning">
                      {qaReport.defects.map((d, idx) => (
                        <li key={idx}>
                          • [{d.severity}] {d.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Run a production workflow to generate a Visual QA report.
                </p>
              )}
              {renderJob?.downloadUrl && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={renderJob.downloadUrl} target="_blank" rel="noreferrer">
                    Download Rendered MP4
                  </a>
                </Button>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Card>
  );
}
