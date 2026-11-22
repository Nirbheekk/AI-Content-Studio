'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  Film,
  Scissors,
  ShieldCheck,
  Sparkles,
  Subtitles,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  NativeSelect,
} from '@/components/design-system/primitives';
import { MediaVideoPlayer } from '@/components/video/media-video-player';
import { apiRequest, AssetDto, ProjectDto } from '@/lib/api-client';
import type {
  CaptionPresetSpec,
  CreativeQaReport,
  MotionPresetSpec,
  SmartCutPreset,
  SmartCutProposal,
} from '@ai-content-os/shared';

interface PresetsResponse {
  captionPresets: CaptionPresetSpec[];
  motionPresets: MotionPresetSpec[];
  smartCutPresets: SmartCutPreset[];
}

interface SmartCutAnalysisResponse {
  assetId: string;
  assetName: string;
  hasTranscript: boolean;
  segmentCount: number;
  preset: SmartCutPreset;
  originalDurationSec: number;
  estimatedEditedDurationSec: number;
  estimatedSavedSec: number;
  protectedPauseCount: number;
  proposals: SmartCutProposal[];
}

interface ShortsBatchItem {
  shortIndex: number;
  title: string;
  hook: string;
  compositionId: string;
  assetId: string | null;
  streamUrl: string | null;
  captionPresetId: string;
  motionPresetId: string;
  smartCutSummary: {
    preset: SmartCutPreset;
    originalDurationSec: number;
    editedDurationSec: number;
    savedSec: number;
    appliedCutCount: number;
    protectedPauseCount: number;
  };
  captionBundleSummary: {
    cueCount: number;
    srtPreview: string;
  };
  creativeQa: CreativeQaReport;
}

interface ShortsBatchResponse {
  projectId: string;
  shortsCount: number;
  shorts: ShortsBatchItem[];
}

export interface ShortsFactoryPanelProps {
  accessToken: string | null;
  workspaceId: string | null;
  projects: ProjectDto[];
  assets: AssetDto[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}

export function ShortsFactoryPanel({
  accessToken,
  workspaceId,
  projects,
  assets,
  selectedProjectId,
  onSelectProject,
  onFeedback,
}: ShortsFactoryPanelProps) {
  const [captionPresets, setCaptionPresets] = useState<CaptionPresetSpec[]>([]);
  const [motionPresets, setMotionPresets] = useState<MotionPresetSpec[]>([]);
  const [sourceAssetId, setSourceAssetId] = useState('');
  const [captionPresetId, setCaptionPresetId] = useState('bold-creator');
  const [motionPresetId, setMotionPresetId] = useState('professional');
  const [smartCutPreset, setSmartCutPreset] = useState<SmartCutPreset>('BALANCED');
  const [aspectRatio, setAspectRatio] = useState<
    'PORTRAIT_9_16' | 'PORTRAIT_4_5' | 'SQUARE_1_1' | 'LANDSCAPE_16_9'
  >('PORTRAIT_9_16');
  const [maxShorts, setMaxShorts] = useState(2);

  const [analyzingCuts, setAnalyzingCuts] = useState(false);
  const [cutAnalysis, setCutAnalysis] = useState<SmartCutAnalysisResponse | null>(null);
  const [proposals, setProposals] = useState<SmartCutProposal[]>([]);

  const [generating, setGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<ShortsBatchResponse | null>(null);

  const mediaAssets = assets.filter(
    (a) => a.assetType === 'VIDEO' || a.assetType === 'AUDIO',
  );

  useEffect(() => {
    if (!sourceAssetId && mediaAssets[0]) {
      setSourceAssetId(mediaAssets[0].id);
    }
  }, [mediaAssets, sourceAssetId]);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;
    let active = true;
    void apiRequest<PresetsResponse>({
      path: '/api/v1/shorts/presets',
      accessToken,
      workspaceId,
    })
      .then((res) => {
        if (!active) return;
        setCaptionPresets(res.captionPresets);
        setMotionPresets(res.motionPresets);
      })
      .catch(() => {
        // Non-fatal fallback; defaults remain usable
      });
    return () => {
      active = false;
    };
  }, [accessToken, workspaceId]);

  const handleAnalyzeSmartCuts = async () => {
    if (!accessToken || !workspaceId || !sourceAssetId) {
      onFeedback({ type: 'error', message: 'Select a video or audio asset first.' });
      return;
    }
    setAnalyzingCuts(true);
    try {
      const res = await apiRequest<SmartCutAnalysisResponse>({
        method: 'POST',
        path: '/api/v1/shorts/smart-cuts',
        accessToken,
        workspaceId,
        body: { assetId: sourceAssetId, preset: smartCutPreset },
      });
      setCutAnalysis(res);
      setProposals(res.proposals);
      onFeedback({
        type: 'success',
        message: `Found ${res.proposals.length} smart cut proposal(s) (${res.estimatedSavedSec.toFixed(1)}s saved).`,
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Smart Cut analysis failed',
      });
    } finally {
      setAnalyzingCuts(false);
    }
  };

  const toggleProposal = (cutId: string) => {
    setProposals((prev) =>
      prev.map((p) => (p.cutId === cutId ? { ...p, accepted: !p.accepted } : p)),
    );
  };

  const handleGenerateBatch = async () => {
    if (!accessToken || !workspaceId || !selectedProjectId) {
      onFeedback({ type: 'error', message: 'Select a target project first.' });
      return;
    }
    setGenerating(true);
    try {
      const res = await apiRequest<ShortsBatchResponse>({
        method: 'POST',
        path: '/api/v1/shorts/batch',
        accessToken,
        workspaceId,
        body: {
          projectId: selectedProjectId,
          ...(sourceAssetId ? { sourceAssetId } : {}),
          captionPresetId,
          motionPresetId,
          smartCutPreset,
          aspectRatio,
          targetPlatform:
            aspectRatio === 'PORTRAIT_4_5' ? 'LINKEDIN' : 'INSTAGRAM_REELS',
          maxShorts,
          targetDurationSec: 22,
          renderMp4: true,
        },
      });
      setBatchResult(res);
      onFeedback({
        type: 'success',
        message: `Generated ${res.shortsCount} editable, QA-verified Short(s).`,
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Shorts batch generation failed',
      });
    } finally {
      setGenerating(false);
    }
  };

  const acceptedSavedSec = proposals
    .filter((p) => p.accepted)
    .reduce((acc, p) => acc + p.durationSec, 0);

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Professional Shorts Factory
            </CardTitle>
            <CardDescription>
              Turn long-form footage into editable, Creative-QA &amp; Signal-QA verified Shorts with Smart Cutting and 8 Caption Presets.
            </CardDescription>
          </div>
          <Badge variant="ai">Stage 4 • 8 Caption Presets</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sf-project">Target Project</Label>
            <NativeSelect
              id="sf-project"
              value={selectedProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-asset">Source Video / Audio</Label>
            <NativeSelect
              id="sf-asset"
              value={sourceAssetId}
              onChange={(e) => setSourceAssetId(e.target.value)}
            >
              <option value="">Auto-pick best project moments</option>
              {mediaAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.originalName}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-caption-preset">Caption Preset (8 Styles)</Label>
            <NativeSelect
              id="sf-caption-preset"
              value={captionPresetId}
              onChange={(e) => setCaptionPresetId(e.target.value)}
            >
              {(captionPresets.length > 0
                ? captionPresets
                : [
                    { id: 'bold-creator', name: 'Bold Creator' },
                    { id: 'clean-minimal', name: 'Clean Minimal' },
                    { id: 'kinetic-word-highlight', name: 'Kinetic Word Highlight' },
                    { id: 'podcast-premium', name: 'Podcast Premium' },
                    { id: 'cinematic-subtitles', name: 'Cinematic Subtitles' },
                    { id: 'high-energy-shorts', name: 'High-Energy Shorts' },
                    { id: 'educational-explainer', name: 'Educational Explainer' },
                    { id: 'brand-custom', name: 'Brand Custom' },
                  ]
              ).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-motion-preset">Motion Graphics Preset</Label>
            <NativeSelect
              id="sf-motion-preset"
              value={motionPresetId}
              onChange={(e) => setMotionPresetId(e.target.value)}
            >
              {(motionPresets.length > 0
                ? motionPresets
                : [
                    { id: 'subtle', name: 'Subtle' },
                    { id: 'professional', name: 'Professional' },
                    { id: 'energetic', name: 'Energetic' },
                    { id: 'cinematic', name: 'Cinematic' },
                    { id: 'educational', name: 'Educational' },
                  ]
              ).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-smart-cut">Smart Cutting Mode</Label>
            <NativeSelect
              id="sf-smart-cut"
              value={smartCutPreset}
              onChange={(e) => setSmartCutPreset(e.target.value as SmartCutPreset)}
            >
              <option value="GENTLE">Gentle (1.8s+ silences)</option>
              <option value="BALANCED">Balanced (1.0s+ silences + fillers)</option>
              <option value="AGGRESSIVE">Aggressive (0.55s+ silences + fillers + retakes)</option>
              <option value="MANUAL_REVIEW">Manual Review Only</option>
            </NativeSelect>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sf-aspect">Aspect Ratio</Label>
              <NativeSelect
                id="sf-aspect"
                value={aspectRatio}
                onChange={(e) =>
                  setAspectRatio(
                    e.target.value as
                      | 'PORTRAIT_9_16'
                      | 'PORTRAIT_4_5'
                      | 'SQUARE_1_1'
                      | 'LANDSCAPE_16_9',
                  )
                }
              >
                <option value="PORTRAIT_9_16">9:16 Vertical</option>
                <option value="PORTRAIT_4_5">4:5 Feed</option>
                <option value="SQUARE_1_1">1:1 Square</option>
                <option value="LANDSCAPE_16_9">16:9 Wide</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf-count">Batch Size</Label>
              <NativeSelect
                id="sf-count"
                value={String(maxShorts)}
                onChange={(e) => setMaxShorts(Number(e.target.value))}
              >
                <option value="1">1 Short</option>
                <option value="2">2 Shorts</option>
                <option value="3">3 Shorts</option>
                <option value="4">4 Shorts</option>
              </NativeSelect>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={analyzingCuts || !sourceAssetId}
            onClick={() => void handleAnalyzeSmartCuts()}
          >
            <Scissors className="h-3.5 w-3.5" />
            {analyzingCuts ? 'Analyzing Smart Cuts…' : 'Preview Smart Cuts'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={generating || !selectedProjectId}
            onClick={() => void handleGenerateBatch()}
          >
            <Film className="h-3.5 w-3.5" />
            {generating ? 'Generating & Rendering Shorts…' : 'Generate Shorts Batch'}
          </Button>
        </div>

        {/* Non-Destructive Smart Cut Proposals Preview */}
        {cutAnalysis && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground">
                Smart Cut Review • {cutAnalysis.assetName}
              </span>
              <div className="flex flex-wrap items-center gap-2 tabular-nums">
                <Badge variant="secondary">
                  Original {cutAnalysis.originalDurationSec.toFixed(1)}s
                </Badge>
                <Badge variant="success">
                  Saving {acceptedSavedSec.toFixed(1)}s
                </Badge>
                {cutAnalysis.protectedPauseCount > 0 && (
                  <Badge variant="info">
                    {cutAnalysis.protectedPauseCount} Dramatic Pause Protected
                  </Badge>
                )}
              </div>
            </div>
            {proposals.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No dead air, filler words, or retakes detected at the {cutAnalysis.preset} threshold.
              </p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {proposals.map((p) => (
                  <label
                    key={p.cutId}
                    className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card p-2 text-xs hover:border-primary/40"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={p.accepted}
                        onChange={() => toggleProposal(p.cutId)}
                        className="mt-0.5 h-3.5 w-3.5 accent-primary"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Badge variant={p.protectedDramaticPause ? 'warning' : 'outline'}>
                            {p.kind}
                          </Badge>
                          <span className="font-mono tabular-nums">
                            {p.startSec.toFixed(2)}s–{p.endSec.toFixed(2)}s (-{p.durationSec.toFixed(2)}s)
                          </span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{p.reason}</p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                      {Math.round(p.confidence * 100)}%
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Generated Shorts Results Grid */}
        {batchResult && batchResult.shorts.length > 0 && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Generated Shorts ({batchResult.shortsCount})
              </span>
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Editable in Video Editor
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {batchResult.shorts.map((short) => (
                <Card key={short.compositionId} className="overflow-hidden border-border">
                  <CardContent className="space-y-3 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{short.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{short.hook}</p>
                      </div>
                      <Badge variant={short.creativeQa.passed ? 'success' : 'warning'}>
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Creative QA {short.creativeQa.score}
                      </Badge>
                    </div>

                    {short.streamUrl && (
                      <MediaVideoPlayer
                        src={short.streamUrl}
                        label={short.title}
                        maxHeightClass="max-h-72"
                      />
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline">
                        <Subtitles className="mr-1 h-3 w-3" />
                        {short.captionPresetId} ({short.captionBundleSummary.cueCount} cues)
                      </Badge>
                      <Badge variant="outline">
                        <Scissors className="mr-1 h-3 w-3" />
                        -{short.smartCutSummary.savedSec.toFixed(1)}s trimmed
                      </Badge>
                    </div>

                    <div className="flex items-center justify-end border-t border-border pt-2">
                      <Link
                        href={`/editor?compositionId=${short.compositionId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        Open in Video Editor
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
