'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Film,
  GitCompare,
  Layers,
  MessageSquare,
  Palette,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Wand2,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
  WorkflowStepper,
} from '../../components/design-system/primitives';
import { VideoPlayer } from '../../components/creative/video-player';
import { useStudio } from '../../context/studio-context';
import { apiRequest } from '../../lib/api-client';

interface OverlayView {
  id: string;
  component: string;
  durationInFrames: number;
}

interface SceneView {
  sceneId: string;
  orderIndex: number;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  layout: string;
  transitionIn: string;
  headlineText: string;
  narrationText: string;
  captionWords: Array<{ word: string; startSec: number; endSec: number }>;
  overlays: OverlayView[];
}

interface CompiledView {
  templateId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  totalDurationSec: number;
  brand: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    headingFont: string;
  };
  captions: {
    enabled: boolean;
    style: string;
    fontSizePx: number;
    highlightColor: string;
    safeBottomMarginPx: number;
  };
  audio: {
    musicVolume: number;
    duckingEnabled: boolean;
  };
  sequences: SceneView[];
}

interface CompositionDetailView {
  id: string;
  title: string;
  targetPlatform: string;
  aspectRatio: string;
  approvalStatus: string;
  currentVersionId: string | null;
  activeVersion: {
    id: string;
    versionNumber: number;
    changeSummary: string;
  } | null;
  compiled: CompiledView | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    changeSummary: string;
    renderJobs: Array<{
      id: string;
      status: string;
      outputSizeBytes: number;
      streamUrl?: string | null;
      downloadUrl: string | null;
    }>;
  }>;
}

interface DiffReportView {
  fromVersionSummary: string;
  toVersionSummary: string;
  diff: {
    fromVersionNumber: number;
    toVersionNumber: number;
    dimensionsChanged: boolean;
    brandChanges: string[];
    captionChanges: string[];
    audioChanges: string[];
    sceneDiffs: Array<{ sceneId: string; status: string; changes: string[] }>;
    totalChangesCount: number;
  };
}

interface CommentView {
  id: string;
  versionNumber: number;
  sceneId: string | null;
  frameIndex: number | null;
  content: string;
  resolved: boolean;
  createdAt: string;
  author: { id: string; fullName: string; email: string };
}

export default function InteractiveEditorPage() {
  const {
    accessToken,
    activeWorkspace,
    activeCompositionId,
    setActiveCompositionId,
    setFeedback,
  } = useStudio();
  const [compositions, setCompositions] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [detail, setDetail] = useState<CompositionDetailView | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Scene editor inputs
  const [editHeadline, setEditHeadline] = useState('');
  const [editNarration, setEditNarration] = useState('');
  const [editLayout, setEditLayout] = useState('talking-head');
  const [editTransition, setEditTransition] = useState('fade');
  const [editDurationFrames, setEditDurationFrames] = useState(90);
  const [newOverlayType, setNewOverlayType] = useState('KineticTypography');

  // Granular AI Scene prompt
  const [aiScenePrompt, setAiScenePrompt] = useState('');

  // Subtitles & Diff & Comments state
  const [subtitlesSrt, setSubtitlesSrt] = useState<string>('');
  const [diffReport, setDiffReport] = useState<DiffReportView | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  const loadCompositionDetail = useCallback(
    async (compId: string) => {
      if (!accessToken || !activeWorkspace || !compId) return;
      try {
        const [compData, subData, commentData] = await Promise.all([
          apiRequest<CompositionDetailView>({
            path: `/api/v1/compositions/${compId}`,
            accessToken,
            workspaceId: activeWorkspace.id,
          }),
          apiRequest<{ srt: string }>({
            path: `/api/v1/compositions/${compId}/subtitles`,
            accessToken,
            workspaceId: activeWorkspace.id,
          }),
          apiRequest<{ comments: CommentView[] }>({
            path: `/api/v1/compositions/${compId}/comments`,
            accessToken,
            workspaceId: activeWorkspace.id,
          }),
        ]);

        setDetail(compData);
        setSubtitlesSrt(subData.srt);
        setComments(commentData.comments);

        const firstScene = compData.compiled?.sequences[0];
        if (firstScene) {
          setSelectedSceneId((prev) =>
            compData.compiled?.sequences.some((s) => s.sceneId === prev)
              ? prev
              : firstScene.sceneId,
          );
        }
      } catch (err) {
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load composition in editor',
        });
      }
    },
    [accessToken, activeWorkspace, setFeedback],
  );

  useEffect(() => {
    if (!accessToken || !activeWorkspace) return;
    const urlParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlCompId = urlParams?.get('compositionId');
    const urlProjId = urlParams?.get('projectId');
    const path = urlProjId
      ? `/api/v1/compositions?projectId=${encodeURIComponent(urlProjId)}`
      : '/api/v1/compositions';

    apiRequest<Array<{ id: string; title: string }>>({
      path,
      accessToken,
      workspaceId: activeWorkspace.id,
    })
      .then((list) => {
        setCompositions(list);
        const preferred =
          (urlCompId && list.some((c) => c.id === urlCompId) ? urlCompId : null) ??
          (activeCompositionId && list.some((c) => c.id === activeCompositionId)
            ? activeCompositionId
            : null) ??
          list[0]?.id ??
          '';
        if (preferred) {
          setSelectedCompId(preferred);
          setActiveCompositionId(preferred);
          void loadCompositionDetail(preferred);
        }
      })
      .catch(() => null);
  }, [accessToken, activeWorkspace, activeCompositionId, setActiveCompositionId, loadCompositionDetail]);

  const compiled = detail?.compiled ?? null;
  const selectedScene =
    compiled?.sequences.find((s) => s.sceneId === selectedSceneId) ??
    compiled?.sequences[0] ??
    null;

  useEffect(() => {
    if (selectedScene) {
      setEditHeadline(selectedScene.headlineText);
      setEditNarration(selectedScene.narrationText);
      setEditLayout(selectedScene.layout);
      setEditTransition(selectedScene.transitionIn);
      setEditDurationFrames(selectedScene.durationInFrames);
    }
  }, [selectedScene]);

  useEffect(() => {
    if (!isPlaying || !compiled) return;
    const timer = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1 >= compiled.durationInFrames ? 0 : prev + 1));
    }, Math.round(1000 / compiled.fps));
    return () => clearInterval(timer);
  }, [isPlaying, compiled]);

  const handleSaveSceneTrackEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !selectedCompId || !selectedScene) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/patch`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          changeSummary: `Edited scene "${selectedScene.sceneId}" on timeline`,
          patches: [
            {
              op: 'UPDATE_SCENE',
              sceneId: selectedScene.sceneId,
              patch: {
                headlineText: editHeadline,
                narrationText: editNarration,
                layout: editLayout,
                transitionIn: editTransition,
                durationInFrames: Number(editDurationFrames),
              },
            },
          ],
        },
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: 'Scene timeline updated (new version saved)' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update scene',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGranularAiSceneEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !accessToken ||
      !activeWorkspace ||
      !selectedCompId ||
      !selectedScene ||
      !aiScenePrompt.trim()
    )
      return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/scenes/${selectedScene.sceneId}/ai-edit`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          instruction: aiScenePrompt.trim(),
        },
      });
      setAiScenePrompt('');
      await loadCompositionDetail(selectedCompId);
      setFeedback({
        type: 'success',
        message: `AI updated scene "${selectedScene.sceneId}" without regenerating other scenes`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'AI scene edit failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddScene = async () => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    setBusy(true);
    try {
      const newSceneId = `scene-${Date.now().toString().slice(-4)}`;
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/patch`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          changeSummary: `Added timeline scene ${newSceneId}`,
          patches: [
            {
              op: 'ADD_SCENE',
              scene: {
                id: newSceneId,
                durationInFrames: 90,
                layout: 'b-roll-overlay',
                trimStartSec: 0,
                headlineText: 'New Storyboard Scene',
                narrationText: 'Added directly on the multi-track timeline editor.',
                transitionIn: 'spring-slide',
                overlays: [],
              },
            },
          ],
        },
      });
      await loadCompositionDetail(selectedCompId);
      setSelectedSceneId(newSceneId);
      setFeedback({ type: 'success', message: 'New scene added to timeline' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to add scene',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReorderScene = async (direction: -1 | 1) => {
    if (!accessToken || !activeWorkspace || !selectedCompId || !compiled || !selectedScene) return;
    const ids = compiled.sequences.map((s) => s.sceneId);
    const idx = ids.indexOf(selectedScene.sceneId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= ids.length) return;

    const swapped = [...ids];
    const temp = swapped[idx]!;
    swapped[idx] = swapped[targetIdx]!;
    swapped[targetIdx] = temp;

    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/patch`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          changeSummary: `Reordered scene ${selectedScene.sceneId}`,
          patches: [
            {
              op: 'REORDER_SCENES',
              sceneIdsInOrder: swapped,
            },
          ],
        },
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: 'Reordered scenes on timeline' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reorder scenes',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddOverlay = async () => {
    if (!accessToken || !activeWorkspace || !selectedCompId || !selectedScene) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/patch`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          changeSummary: `Added ${newOverlayType} overlay to ${selectedScene.sceneId}`,
          patches: [
            {
              op: 'ADD_OVERLAY',
              sceneId: selectedScene.sceneId,
              overlay: {
                id: `ov-${Date.now().toString().slice(-5)}`,
                component: newOverlayType,
                startOffsetFrames: 0,
                durationInFrames: selectedScene.durationInFrames,
                props: { text: selectedScene.headlineText },
              },
            },
          ],
        },
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: `Added ${newOverlayType} overlay` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to add overlay',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchAspectRatio = async (
    aspectRatio: 'PORTRAIT_9_16' | 'LANDSCAPE_16_9' | 'SQUARE_1_1' | 'PORTRAIT_4_5',
  ) => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/aspect-ratio`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { aspectRatio },
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: `Switched aspect ratio to ${aspectRatio}` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to change aspect ratio',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApplyBrandKit = async () => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/apply-brand-kit`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: 'Applied Workspace Brand Kit to composition' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to apply Brand Kit',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUndoRedo = async (dir: 'undo' | 'redo') => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/${dir}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: `Executed ${dir.toUpperCase()}` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Cannot ${dir}`,
      });
    }
  };

  const handleRenderComposition = async () => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/render`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({
        type: 'success',
        message: 'Rendered MP4 and ran Visual QA inspection in MinIO',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Render failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCompareVersions = async () => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    try {
      const report = await apiRequest<DiffReportView>({
        path: `/api/v1/compositions/${selectedCompId}/compare`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setDiffReport(report);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to compare versions',
      });
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !selectedCompId || !newCommentText.trim()) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/comments`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          versionNumber: detail?.activeVersion?.versionNumber ?? 1,
          ...(selectedScene ? { sceneId: selectedScene.sceneId } : {}),
          frameIndex: currentFrame,
          content: newCommentText.trim(),
        },
      });
      setNewCommentText('');
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: 'Comment added to timeline frame' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to add comment',
      });
    }
  };

  const handleApproveComposition = async () => {
    if (!accessToken || !activeWorkspace || !selectedCompId) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/compositions/${selectedCompId}/approve`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      await loadCompositionDetail(selectedCompId);
      setFeedback({ type: 'success', message: 'Composition approved for publishing' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to approve composition',
      });
    }
  };

  const frameScene =
    compiled?.sequences.find(
      (s) => currentFrame >= s.startFrame && currentFrame < s.endFrame,
    ) ??
    compiled?.sequences[0] ??
    null;

  const playheadPercent = compiled
    ? Math.min(100, Math.round((currentFrame / Math.max(1, compiled.durationInFrames - 1)) * 100))
    : 0;

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="Video Editor"
          description="Inspect multi-track timelines, edit individual scenes with AI, adjust aspect ratios, compare versions, and render final MP4 output."
          badge={
            detail?.activeVersion ? (
              <div className="flex items-center gap-2">
                <Badge variant="ai">v{detail.activeVersion.versionNumber}</Badge>
                <Badge variant={detail.approvalStatus === 'APPROVED' ? 'success' : 'warning'}>
                  {detail.approvalStatus}
                </Badge>
              </div>
            ) : (
              <Badge variant="outline">No Composition Loaded</Badge>
            )
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <Select
                  aria-label="Select composition"
                  value={selectedCompId}
                  onChange={(e) => {
                    setSelectedCompId(e.target.value);
                    void loadCompositionDetail(e.target.value);
                  }}
                >
                  {compositions.length === 0 ? (
                    <option value="">No compositions available</option>
                  ) : (
                    compositions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))
                  )}
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={busy || !selectedCompId}
                onClick={() => void handleUndoRedo('undo')}
                title="Undo version"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !selectedCompId}
                onClick={() => void handleUndoRedo('redo')}
                title="Redo version"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Redo
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !selectedCompId}
                onClick={() => void handleCompareVersions()}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Compare Versions
              </Button>
            </div>
          }
        />

        <WorkflowStepper activeStep="editor" />

        {/* Studio Format & Action Bar */}
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Aspect Ratio:</span>
            {(
              [
                ['PORTRAIT_9_16', '9:16 Reels/TikTok'],
                ['LANDSCAPE_16_9', '16:9 YouTube'],
                ['SQUARE_1_1', '1:1 Square'],
                ['PORTRAIT_4_5', '4:5 Feed'],
              ] as const
            ).map(([ratio, label]) => (
              <Button
                key={ratio}
                variant={detail?.aspectRatio === ratio ? 'primary' : 'outline'}
                size="sm"
                disabled={busy || !selectedCompId}
                onClick={() => void handleSwitchAspectRatio(ratio)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !selectedCompId}
              onClick={() => void handleApplyBrandKit()}
            >
              <Palette className="h-3.5 w-3.5 text-primary" />
              Apply Brand Kit
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={busy || !selectedCompId}
              onClick={() => void handleRenderComposition()}
            >
              <Film className="h-3.5 w-3.5" />
              {busy ? 'Rendering...' : 'Render MP4'}
            </Button>

            <Button
              variant="success"
              size="sm"
              disabled={busy || !selectedCompId}
              onClick={() => void handleApproveComposition()}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        </Card>

        {!selectedCompId || !compiled || !frameScene ? (
          <EmptyState
            icon={<Film className="h-5 w-5 text-primary" />}
            title="No video composition loaded in the editor"
            description="Toolbar and timeline controls are disabled until a composition is generated. Create a video in AI Studio or batch-convert an asset in the Repurpose Engine."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/studio"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate in AI Studio
                </Link>
                <Link
                  href="/repurpose"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Open Repurpose Engine
                </Link>
              </div>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: Remotion Preview Canvas, Rendered MP4 & Multi-Track Timeline */}
            <Card className="space-y-4 p-4 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Film className="h-3.5 w-3.5 text-primary" />
                  <span>Composition Preview Stage</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {compiled.width}×{compiled.height} • {compiled.fps}fps • Frame {currentFrame}/
                  {compiled.durationInFrames}
                </span>
              </div>

              {/* Dark True-Color Studio Preview Monitor */}
              <div className="rounded-2xl border border-border bg-canvas p-6">
                <div
                  className="mx-auto flex h-64 max-w-md flex-col justify-between rounded-2xl border border-border/40 p-4 shadow-sm"
                  style={{ backgroundColor: compiled.brand.secondaryColor }}
                >
                  <div className="flex items-center justify-between text-xs text-primary-foreground">
                    <span className="rounded-lg bg-canvas/75 px-2.5 py-0.5 font-mono">
                      {frameScene.layout} • {frameScene.transitionIn}
                    </span>
                    <span className="rounded-lg bg-canvas/75 px-2.5 py-0.5 font-mono tabular-nums">
                      Scene #{frameScene.orderIndex + 1} (f{frameScene.startFrame}–
                      {frameScene.endFrame})
                    </span>
                  </div>

                  <div className="my-auto text-center">
                    <div
                      className="inline-block rounded-xl px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
                      style={{ backgroundColor: compiled.brand.primaryColor }}
                    >
                      {frameScene.headlineText}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div
                      className="rounded-xl bg-canvas/80 px-3 py-1.5 text-center text-xs font-semibold"
                      style={{ color: compiled.captions.highlightColor }}
                    >
                      {frameScene.narrationText}
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas/50">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${playheadPercent}%`,
                          backgroundColor: compiled.brand.accentColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Transport Controls */}
              <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                <Button size="sm" variant="primary" onClick={() => setIsPlaying((p) => !p)}>
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </Button>
                <input
                  type="range"
                  aria-label="Playhead frame scrubber"
                  min={0}
                  max={Math.max(1, compiled.durationInFrames - 1)}
                  value={currentFrame}
                  onChange={(e) => setCurrentFrame(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {(currentFrame / compiled.fps).toFixed(2)}s / {compiled.totalDurationSec}s
                </span>
              </div>

              {(() => {
                const activeVer =
                  detail?.versions.find((v) => v.id === detail.currentVersionId) ??
                  detail?.versions[0];
                const latestRender = activeVer?.renderJobs.find(
                  (r) => r.status === 'COMPLETED' && (r.streamUrl || r.downloadUrl),
                );
                const playbackUrl = latestRender?.streamUrl ?? latestRender?.downloadUrl;
                if (!latestRender || !playbackUrl) return null;
                return (
                  <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-foreground">
                      <span>Rendered MP4 Output (v{activeVer?.versionNumber})</span>
                      <Badge variant="success">H.264 / AAC Ready</Badge>
                    </div>
                    <VideoPlayer
                      src={playbackUrl}
                      downloadUrl={
                        latestRender.streamUrl
                          ? `${latestRender.streamUrl}&download=1`
                          : latestRender.downloadUrl
                      }
                      label={`v${activeVer?.versionNumber ?? 1} · Final MP4`}
                      sizeBytes={latestRender.outputSizeBytes}
                      onRequestRefreshUrl={() => {
                        if (selectedCompId) void loadCompositionDetail(selectedCompId);
                      }}
                    />
                  </div>
                );
              })()}

              {/* Multi-Track Studio Timeline */}
              <div className="space-y-3 rounded-xl border border-border bg-timeline p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Multi-Track Timeline ({compiled.sequences.length} Scenes)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleReorderScene(-1)}
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Move Left
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleReorderScene(1)}
                    >
                      Move Right
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleAddScene()}
                    >
                      <Plus className="h-3 w-3" />
                      Add Scene
                    </Button>
                  </div>
                </div>

                {/* Playhead Progress Ruler */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${playheadPercent}%` }}
                  />
                </div>

                {/* Track V1: Scene & Layout Blocks */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Track V1 • Video &amp; Layout Scenes</span>
                    <span className="font-mono tabular-nums">{compiled.durationInFrames} frames</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {compiled.sequences.map((seq) => {
                      const isSelected = selectedScene?.sceneId === seq.sceneId;
                      return (
                        <button
                          key={seq.sceneId}
                          type="button"
                          onClick={() => {
                            setSelectedSceneId(seq.sceneId);
                            setCurrentFrame(seq.startFrame);
                          }}
                          className={`min-w-40 flex-1 rounded-xl border p-3 text-left transition-colors duration-150 ${
                            isSelected
                              ? 'border-primary bg-accent text-accent-foreground shadow-sm ring-1 ring-primary'
                              : 'border-border bg-card text-foreground hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-primary tabular-nums">
                            <span>Scene #{seq.orderIndex + 1}</span>
                            <span>
                              f{seq.startFrame}–{seq.endFrame} ({seq.durationInFrames}f)
                            </span>
                          </div>
                          <div className="mt-1 truncate text-xs font-semibold text-foreground">
                            {seq.headlineText}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {seq.layout} • {seq.transitionIn}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Track FX2: Motion Overlays */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Track FX2 • Motion Graphic Overlays
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {compiled.sequences.map((seq) => (
                      <div
                        key={`fx-${seq.sceneId}`}
                        className="min-w-40 flex-1 rounded-xl border border-border bg-card/75 px-3 py-1.5 text-xs"
                      >
                        {seq.overlays.length === 0 ? (
                          <span className="text-muted-foreground">No overlays</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {seq.overlays.map((ov) => (
                              <Badge key={ov.id} variant="info">
                                {ov.component}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Track CC3: Word-Synced Captions */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Track CC3 • Word-Synced Captions &amp; Narration
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {compiled.sequences.map((seq) => (
                      <div
                        key={`cc-${seq.sceneId}`}
                        className="min-w-40 flex-1 truncate rounded-xl border border-border bg-card/75 px-3 py-1.5 text-xs text-muted-foreground"
                      >
                        {seq.narrationText}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Right: Scene Inspector, Granular AI Edit, Version Diff, Comments & Subtitles */}
            <div className="space-y-4 lg:col-span-5">
              {selectedScene && (
                <Card className="p-4">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Selected Scene Inspector
                    </h2>
                    <Badge variant="ai">
                      Scene #{selectedScene.orderIndex + 1} ({selectedScene.sceneId})
                    </Badge>
                  </div>

                  {/* Granular AI Scene Edit Command */}
                  <form onSubmit={handleGranularAiSceneEdit} className="mt-3 flex gap-1.5">
                    <Input
                      type="text"
                      value={aiScenePrompt}
                      onChange={(e) => setAiScenePrompt(e.target.value)}
                      placeholder="AI Scene Command (e.g. 'Use zoom-punch and stronger hook')..."
                      className="h-8 flex-1 text-xs"
                    />
                    <Button type="submit" variant="ai" size="sm" disabled={busy}>
                      <Wand2 className="h-3.5 w-3.5" />
                      AI Edit Scene
                    </Button>
                  </form>

                  {/* Manual Scene Property Form */}
                  <form onSubmit={handleSaveSceneTrackEdit} className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Headline Text
                      </label>
                      <Input
                        type="text"
                        value={editHeadline}
                        onChange={(e) => setEditHeadline(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Narration / Captions
                      </label>
                      <Textarea
                        rows={2}
                        value={editNarration}
                        onChange={(e) => setEditNarration(e.target.value)}
                        className="min-h-16 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Layout
                        </label>
                        <Select
                          value={editLayout}
                          onChange={(e) => setEditLayout(e.target.value)}
                          className="h-8 text-xs"
                        >
                          <option value="talking-head">talking-head</option>
                          <option value="podcast-split">podcast-split</option>
                          <option value="b-roll-overlay">b-roll-overlay</option>
                          <option value="full-bleed">full-bleed</option>
                          <option value="data-explainer">data-explainer</option>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Transition
                        </label>
                        <Select
                          value={editTransition}
                          onChange={(e) => setEditTransition(e.target.value)}
                          className="h-8 text-xs"
                        >
                          <option value="fade">fade</option>
                          <option value="spring-slide">spring-slide</option>
                          <option value="zoom-punch">zoom-punch</option>
                          <option value="whip-pan">whip-pan</option>
                          <option value="none">none</option>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Duration (Frames)
                        </label>
                        <Input
                          type="number"
                          min={15}
                          max={1800}
                          value={editDurationFrames}
                          onChange={(e) => setEditDurationFrames(Number(e.target.value))}
                          className="h-8 text-xs tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="flex items-center gap-1.5">
                        <Select
                          aria-label="Overlay component"
                          value={newOverlayType}
                          onChange={(e) => setNewOverlayType(e.target.value)}
                          className="h-8 w-auto text-xs"
                        >
                          <option value="KineticTypography">KineticTypography</option>
                          <option value="AnimatedHeadline">AnimatedHeadline</option>
                          <option value="WordSyncedCaptions">WordSyncedCaptions</option>
                          <option value="LowerThird">LowerThird</option>
                          <option value="ChartGraphic">ChartGraphic</option>
                          <option value="SoundVisualization">SoundVisualization</option>
                          <option value="CallToActionScene">CallToActionScene</option>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleAddOverlay()}
                        >
                          <Plus className="h-3 w-3" />
                          Overlay
                        </Button>
                      </div>

                      <Button type="submit" size="sm" disabled={busy}>
                        Save Scene Changes
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              {/* Version Comparison Diff Report */}
              {diffReport && (
                <Card className="border-primary/40 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">
                      Version Diff: v{diffReport.diff.fromVersionNumber} vs v
                      {diffReport.diff.toVersionNumber} ({diffReport.diff.totalChangesCount}{' '}
                      changes)
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setDiffReport(null)}>
                      Close
                    </Button>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-foreground">
                    {diffReport.diff.brandChanges.map((c, i) => (
                      <li key={`b-${i}`}>• Brand: {c}</li>
                    ))}
                    {diffReport.diff.captionChanges.map((c, i) => (
                      <li key={`c-${i}`}>• Captions: {c}</li>
                    ))}
                    {diffReport.diff.sceneDiffs
                      .filter((s) => s.status !== 'UNCHANGED')
                      .map((s) => (
                        <li key={s.sceneId}>
                          • Scene {s.sceneId} ({s.status}): {s.changes.join('; ')}
                        </li>
                      ))}
                  </ul>
                </Card>
              )}

              {/* Collaboration Comments & Subtitles */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    <span>Frame Comments &amp; Subtitles (.SRT)</span>
                  </div>
                  <Badge variant="outline">Frame {currentFrame}</Badge>
                </div>

                <form onSubmit={handleAddComment} className="mt-3 flex gap-1.5">
                  <Input
                    type="text"
                    disabled={!selectedCompId}
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={`Comment on frame ${currentFrame}...`}
                    className="h-8 flex-1 text-xs"
                  />
                  <Button type="submit" size="sm" disabled={!selectedCompId || !newCommentText.trim()}>
                    Comment
                  </Button>
                </form>

                <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No frame comments yet. Scrub to a frame and leave review notes.
                    </p>
                  ) : (
                    comments.map((cm) => (
                      <div
                        key={cm.id}
                        className="rounded-lg border border-border bg-secondary/35 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>
                            <strong className="text-foreground">{cm.author.fullName}</strong> (v
                            {cm.versionNumber} • f{cm.frameIndex ?? 0})
                          </span>
                          <Badge variant={cm.resolved ? 'success' : 'info'}>
                            {cm.resolved ? 'Resolved' : 'Open'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-foreground">{cm.content}</div>
                      </div>
                    ))
                  )}
                </div>

                {subtitlesSrt && (
                  <details className="mt-3 rounded-lg border border-border bg-secondary/30 p-2.5 text-xs">
                    <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-primary">
                      <Subtitles className="h-3.5 w-3.5" />
                      <span>View Generated SubRip (.SRT) Subtitles</span>
                    </summary>
                    <pre className="mt-2 max-h-28 overflow-y-auto rounded bg-card p-2 font-mono text-xs text-foreground">
                      {subtitlesSrt}
                    </pre>
                  </details>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
