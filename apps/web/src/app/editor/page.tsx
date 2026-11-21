'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
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
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
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
    apiRequest<Array<{ id: string; title: string }>>({
      path: '/api/v1/compositions',
      accessToken,
      workspaceId: activeWorkspace.id,
    })
      .then((list) => {
        setCompositions(list);
        const firstId = list[0]?.id ?? '';
        if (firstId) {
          setSelectedCompId(firstId);
          void loadCompositionDetail(firstId);
        }
      })
      .catch(() => null);
  }, [accessToken, activeWorkspace, loadCompositionDetail]);

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

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Editor Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/80 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedCompId}
              onChange={(e) => {
                setSelectedCompId(e.target.value);
                void loadCompositionDetail(e.target.value);
              }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              {compositions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            {detail?.activeVersion && (
              <span className="rounded bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                v{detail.activeVersion.versionNumber} ({detail.approvalStatus})
              </span>
            )}

            <h1 className="text-sm font-bold text-foreground">Video Editor</h1>

            <button
              type="button"
              disabled={busy || !selectedCompId}
              onClick={() => void handleUndoRedo('undo')}
              className="rounded border border-input bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={busy || !selectedCompId}
              onClick={() => void handleUndoRedo('redo')}
              className="rounded border border-input bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Redo
            </button>
            <button
              type="button"
              disabled={busy || !selectedCompId}
              onClick={() => void handleCompareVersions()}
              className="rounded border border-input bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Compare Versions
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['PORTRAIT_9_16', '9:16'],
                ['LANDSCAPE_16_9', '16:9'],
                ['SQUARE_1_1', '1:1'],
                ['PORTRAIT_4_5', '4:5'],
              ] as const
            ).map(([ratio, label]) => (
              <button
                key={ratio}
                type="button"
                disabled={busy || !selectedCompId}
                onClick={() => void handleSwitchAspectRatio(ratio)}
                className={`rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  detail?.aspectRatio === ratio
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}

            <button
              type="button"
              disabled={busy || !selectedCompId}
              onClick={() => void handleApplyBrandKit()}
              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/90/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply Brand Kit
            </button>

            <button
              type="button"
              disabled={busy || !selectedCompId}
              onClick={() => void handleRenderComposition()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Render MP4
            </button>

            <button
              type="button"
              disabled={busy || !selectedCompId}
              onClick={() => void handleApproveComposition()}
              className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve
            </button>
          </div>
        </div>

        {/* Main Editor Grid: Player + Inspector + Collaboration */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Remotion Preview Canvas & Multi-Track Timeline */}
          <div className="space-y-4 rounded-xl border border-border bg-card/70 p-4 lg:col-span-7">
            {compiled && frameScene ? (
              <>
                <div
                  className="mx-auto flex h-64 max-w-md flex-col justify-between rounded-xl border border-input p-4 shadow-2xl"
                  style={{ backgroundColor: compiled.brand.secondaryColor }}
                >
                  <div className="flex items-center justify-between text-[10px] text-foreground/90">
                    <span className="rounded bg-black/60 px-2 py-0.5 font-mono">
                      {compiled.width}x{compiled.height} • {compiled.fps}fps • {frameScene.layout}
                    </span>
                    <span className="font-mono">
                      Frame {currentFrame} / {compiled.durationInFrames}
                    </span>
                  </div>

                  <div className="my-auto text-center">
                    <div
                      className="inline-block rounded-lg px-4 py-2 text-sm font-bold text-foreground shadow"
                      style={{ backgroundColor: compiled.brand.primaryColor }}
                    >
                      {frameScene.headlineText}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div
                      className="rounded bg-black/75 px-3 py-1.5 text-center text-xs font-semibold"
                      style={{ color: compiled.captions.highlightColor }}
                    >
                      {frameScene.narrationText}
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded bg-secondary">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.round((currentFrame / Math.max(1, compiled.durationInFrames)) * 100)}%`,
                          backgroundColor: compiled.brand.accentColor,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, compiled.durationInFrames - 1)}
                    value={currentFrame}
                    onChange={(e) => setCurrentFrame(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>

                {(() => {
                  const activeVer =
                    detail?.versions.find((v) => v.id === detail.currentVersionId) ??
                    detail?.versions[0];
                  const latestMp4 = activeVer?.renderJobs.find((r) => r.downloadUrl)?.downloadUrl;
                  if (!latestMp4) return null;
                  return (
                    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Rendered MP4 Preview (v{activeVer?.versionNumber})</span>
                        <a
                          href={latestMp4}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          Download MP4
                        </a>
                      </div>
                      <video
                        key={latestMp4}
                        controls
                        playsInline
                        preload="metadata"
                        src={latestMp4}
                        className="max-h-64 w-full rounded-lg border border-border bg-black object-contain"
                      />
                    </div>
                  );
                })()}

                {/* Multi-Track Timeline */}
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Multi-Track Scene Timeline ({compiled.sequences.length} Scenes)
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleReorderScene(-1)}
                        className="rounded border border-input px-2 py-1 text-[11px] text-foreground/90 hover:bg-secondary/80"
                      >
                        Move Left
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReorderScene(1)}
                        className="rounded border border-input px-2 py-1 text-[11px] text-foreground/90 hover:bg-secondary/80"
                      >
                        Move Right
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAddScene()}
                        className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                      >
                        + Add Scene
                      </button>
                    </div>
                  </div>

                  {/* Track 1: Scene Blocks */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {compiled.sequences.map((seq) => (
                      <button
                        key={seq.sceneId}
                        type="button"
                        onClick={() => {
                          setSelectedSceneId(seq.sceneId);
                          setCurrentFrame(seq.startFrame);
                        }}
                        className={`min-w-[150px] flex-1 rounded-lg border p-2.5 text-left transition ${
                          selectedScene?.sceneId === seq.sceneId
                            ? 'border-primary bg-primary/15 text-foreground'
                            : 'border-border bg-background text-foreground/90'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-primary">
                          <span>Scene #{seq.orderIndex + 1}</span>
                          <span>{seq.durationInFrames}f</span>
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold">
                          {seq.headlineText}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                          {seq.layout} • {seq.transitionIn} • {seq.overlays.length} overlays
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground/80">
                No composition selected. Generate one in AI Studio or Repurpose Engine.
              </div>
            )}
          </div>

          {/* Right: Scene Inspector, Granular AI Edit, Subtitles & Collaboration Comments */}
          <div className="space-y-4 lg:col-span-5">
            {selectedScene && (
              <div className="rounded-xl border border-border bg-card/70 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected Scene Inspector ({selectedScene.sceneId})
                </h2>

                {/* Granular AI Scene Edit Command */}
                <form onSubmit={handleGranularAiSceneEdit} className="mt-3 flex gap-1.5">
                  <input
                    type="text"
                    value={aiScenePrompt}
                    onChange={(e) => setAiScenePrompt(e.target.value)}
                    placeholder="AI Scene Command (e.g. 'Use zoom-punch and stronger hook')..."
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    AI Edit Scene
                  </button>
                </form>

                {/* Manual Scene Property Form */}
                <form onSubmit={handleSaveSceneTrackEdit} className="mt-3 space-y-3">
                  <div>
                    <label className="block text-[11px] text-muted-foreground">Headline Text</label>
                    <input
                      type="text"
                      value={editHeadline}
                      onChange={(e) => setEditHeadline(e.target.value)}
                      className="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground">Narration / Captions</label>
                    <textarea
                      rows={2}
                      value={editNarration}
                      onChange={(e) => setEditNarration(e.target.value)}
                      className="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-muted-foreground">Layout</label>
                      <select
                        value={editLayout}
                        onChange={(e) => setEditLayout(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="talking-head">talking-head</option>
                        <option value="podcast-split">podcast-split</option>
                        <option value="b-roll-overlay">b-roll-overlay</option>
                        <option value="full-bleed">full-bleed</option>
                        <option value="data-explainer">data-explainer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted-foreground">Transition</label>
                      <select
                        value={editTransition}
                        onChange={(e) => setEditTransition(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="fade">fade</option>
                        <option value="spring-slide">spring-slide</option>
                        <option value="zoom-punch">zoom-punch</option>
                        <option value="whip-pan">whip-pan</option>
                        <option value="none">none</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted-foreground">Duration (Frames)</label>
                      <input
                        type="number"
                        min={15}
                        max={1800}
                        value={editDurationFrames}
                        onChange={(e) => setEditDurationFrames(Number(e.target.value))}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex gap-1.5">
                      <select
                        value={newOverlayType}
                        onChange={(e) => setNewOverlayType(e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                      >
                        <option value="KineticTypography">KineticTypography</option>
                        <option value="AnimatedHeadline">AnimatedHeadline</option>
                        <option value="WordSyncedCaptions">WordSyncedCaptions</option>
                        <option value="LowerThird">LowerThird</option>
                        <option value="ChartGraphic">ChartGraphic</option>
                        <option value="SoundVisualization">SoundVisualization</option>
                        <option value="CallToActionScene">CallToActionScene</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAddOverlay()}
                        className="rounded border border-input bg-secondary px-2.5 py-1 text-xs text-foreground"
                      >
                        + Add Overlay
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      Save Scene Changes
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Version Comparison Diff Report */}
            {diffReport && (
              <div className="rounded-xl border border-primary/40 bg-card/70 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">
                    Version Diff: v{diffReport.diff.fromVersionNumber} vs v
                    {diffReport.diff.toVersionNumber} ({diffReport.diff.totalChangesCount} changes)
                  </span>
                  <button
                    type="button"
                    onClick={() => setDiffReport(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-foreground/90">
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
              </div>
            )}

            {/* Collaboration Comments & Subtitles */}
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Frame Comments &amp; Subtitles (.SRT)
              </h3>
              <form onSubmit={handleAddComment} className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder={`Comment on frame ${currentFrame}...`}
                  className="flex-1 rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                />
                <button
                  type="submit"
                  className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  Comment
                </button>
              </form>

              <div className="mt-3 max-h-32 space-y-1.5 overflow-y-auto">
                {comments.map((cm) => (
                  <div
                    key={cm.id}
                    className="rounded border border-border bg-background p-2 text-[11px]"
                  >
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        <strong>{cm.author.fullName}</strong> (v{cm.versionNumber} • f
                        {cm.frameIndex ?? 0})
                      </span>
                      <span>{cm.resolved ? 'Resolved' : 'Open'}</span>
                    </div>
                    <div className="mt-0.5 text-foreground">{cm.content}</div>
                  </div>
                ))}
              </div>

              {subtitlesSrt && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-medium text-primary">
                    View Generated SubRip (.SRT) Subtitles
                  </summary>
                  <pre className="mt-2 max-h-28 overflow-y-auto rounded bg-background p-2 font-mono text-[10px] text-foreground/90">
                    {subtitlesSrt}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
