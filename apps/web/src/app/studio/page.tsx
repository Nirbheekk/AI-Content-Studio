'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from '../../components/design-system/primitives';
import { VideoPlayer } from '../../components/creative/video-player';
import { useStudio } from '../../context/studio-context';
import {
  apiRequest,
  ConversationDto,
  getApiBaseUrl,
  ProjectDto,
  WorkflowDto,
} from '../../lib/api-client';

interface CompiledSceneView {
  sceneId: string;
  orderIndex: number;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  layout: string;
  headlineText: string;
  narrationText: string;
  captionWords: Array<{ word: string; startSec: number; endSec: number }>;
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
  };
  captions: {
    fontSizePx: number;
    highlightColor: string;
    safeBottomMarginPx: number;
  };
  sequences: CompiledSceneView[];
}

interface RenderJobView {
  id: string;
  status: string;
  outputSizeBytes: number;
  downloadUrl: string | null;
  qaFrameUrls: string[];
}

interface QaReportView {
  passed: boolean;
  overallScore: number;
  summary: string;
  defects: Array<{ type: string; severity: string; description: string }>;
}

interface CompositionVersionView {
  id: string;
  versionNumber: number;
  changeSummary: string;
}

export default function AIStudioPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDto | null>(null);

  // Production configuration
  const [templateId, setTemplateId] = useState<string>('instagram-reel');
  const [targetPlatform, setTargetPlatform] = useState<string>('INSTAGRAM_REELS');
  const [simulateDefectsOnce, setSimulateDefectsOnce] = useState<boolean>(false);
  const [promptInput, setPromptInput] = useState<string>('');
  const [newConvTitle, setNewConvTitle] = useState<string>('');
  const [revisionInput, setRevisionInput] = useState<string>('');
  const [producing, setProducing] = useState<boolean>(false);

  // Active Production Artifacts
  const [activeCompositionId, setActiveCompositionId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<CompositionVersionView | null>(null);
  const [compiled, setCompiled] = useState<CompiledView | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJobView | null>(null);
  const [qaReport, setQaReport] = useState<QaReportView | null>(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(true);

  // Interactive Remotion Frame Scrubber state
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // SSE stream events
  const [sseEvents, setSseEvents] = useState<
    Array<{ eventId: string; stage: string; message: string; timestamp: string }>
  >([]);

  const loadStudioState = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const [projList, convList] = await Promise.all([
        apiRequest<ProjectDto[]>({
          path: '/api/v1/projects',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<ConversationDto[]>({
          path: '/api/v1/conversations',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);
      setProjects(projList);
      setConversations(convList);

      const defaultProjId = selectedProjectId || projList[0]?.id || '';
      if (defaultProjId && !selectedProjectId) {
        setSelectedProjectId(defaultProjId);
      }

      if (convList[0] && !activeConversation) {
        const detail = await apiRequest<ConversationDto>({
          path: `/api/v1/conversations/${convList[0].id}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setActiveConversation(detail);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load AI Studio workspace',
      });
    }
  }, [accessToken, activeWorkspace, selectedProjectId, activeConversation, setFeedback]);

  useEffect(() => {
    void loadStudioState();
  }, [loadStudioState]);

  const activeWorkflow: WorkflowDto | null = activeConversation?.workflows?.[0] ?? null;

  // Frame playback loop
  useEffect(() => {
    if (!isPlaying || !compiled) return;
    const intervalMs = Math.round(1000 / compiled.fps);
    const timer = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1 >= compiled.durationInFrames ? 0 : prev + 1));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, compiled]);

  // Subscribe to SSE workflow stream
  useEffect(() => {
    if (!activeWorkflow || !accessToken || !activeWorkspace) return;

    const streamUrl = `${getApiBaseUrl()}/api/v1/workflows/${activeWorkflow.id}/stream?accessToken=${encodeURIComponent(accessToken)}&workspaceId=${encodeURIComponent(activeWorkspace.id)}`;
    const source = new EventSource(streamUrl);

    source.addEventListener('workflow.update', (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent<string>).data) as {
          eventId: string;
          stage: string;
          message: string;
          timestamp: string;
        };
        setSseEvents((prev) => [parsed, ...prev.slice(0, 14)]);
      } catch {
        // Ignore malformed event
      }
    });

    return () => {
      source.close();
    };
  }, [activeWorkflow, accessToken, activeWorkspace]);

  const handleSelectConversation = async (convId: string) => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const detail = await apiRequest<ConversationDto>({
        path: `/api/v1/conversations/${convId}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setActiveConversation(detail);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load conversation',
      });
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !selectedProjectId || !newConvTitle.trim()) return;
    try {
      const created = await apiRequest<ConversationDto>({
        method: 'POST',
        path: '/api/v1/conversations',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId: selectedProjectId,
          title: newConvTitle.trim(),
        },
      });
      setNewConvTitle('');
      setActiveConversation(created);
      setConversations((prev) => [created, ...prev]);
      setFeedback({ type: 'success', message: 'New AI Studio conversation started' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start conversation',
      });
    }
  };

  const handleRunProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProjId = activeConversation?.projectId ?? selectedProjectId;
    if (!accessToken || !activeWorkspace || !targetProjId || !promptInput.trim()) return;

    setProducing(true);
    try {
      const result = await apiRequest<{
        workflow: WorkflowDto;
        compositionId: string;
        compositionVersion: CompositionVersionView;
        renderJob: RenderJobView;
        qaReport: QaReportView;
        compiled: CompiledView;
        isSimulated: boolean;
      }>({
        method: 'POST',
        path: '/api/v1/workflows/produce',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId: targetProjId,
          ...(activeConversation ? { conversationId: activeConversation.id } : {}),
          userPrompt: promptInput.trim(),
          targetPlatform,
          templateId,
          simulateDefectsOnce,
        },
      });

      setPromptInput('');
      setActiveCompositionId(result.compositionId);
      setActiveVersion(result.compositionVersion);
      setCompiled(result.compiled);
      setRenderJob(result.renderJob);
      setQaReport(result.qaReport);
      setIsSimulatedMode(result.isSimulated);
      setCurrentFrame(0);

      if (activeConversation) {
        await handleSelectConversation(activeConversation.id);
      }
      setFeedback({
        type: 'success',
        message: `Completed 7-agent pipeline (Version v${result.compositionVersion.versionNumber}, QA Score ${result.qaReport.overallScore}/100)`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Production pipeline failed',
      });
    } finally {
      setProducing(false);
    }
  };

  const handleReviseWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !activeWorkflow || !revisionInput.trim()) return;
    setProducing(true);
    try {
      const result = await apiRequest<{
        workflow: WorkflowDto;
        compositionVersion: CompositionVersionView;
        renderJob: RenderJobView;
        qaReport: QaReportView;
        compiled: CompiledView;
      }>({
        method: 'POST',
        path: `/api/v1/workflows/${activeWorkflow.id}/revise`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          instruction: revisionInput.trim(),
        },
      });

      setRevisionInput('');
      setActiveVersion(result.compositionVersion);
      setCompiled(result.compiled);
      setRenderJob(result.renderJob);
      setQaReport(result.qaReport);
      if (activeConversation) {
        await handleSelectConversation(activeConversation.id);
      }
      setFeedback({
        type: 'success',
        message: `Applied revision -> Version v${result.compositionVersion.versionNumber} rendered & passed QA`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Revision failed',
      });
    } finally {
      setProducing(false);
    }
  };

  const handleUndoRedo = async (direction: 'undo' | 'redo') => {
    if (!accessToken || !activeWorkspace || !activeCompositionId) return;
    try {
      const res = await apiRequest<{
        version: CompositionVersionView;
        compiled: CompiledView;
      }>({
        method: 'POST',
        path: `/api/v1/compositions/${activeCompositionId}/${direction}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setActiveVersion(res.version);
      setCompiled(res.compiled);
      setCurrentFrame(0);
      setFeedback({
        type: 'success',
        message: `Switched to Composition Version v${res.version.versionNumber}`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Cannot ${direction} further`,
      });
    }
  };

  const handleApproveWorkflow = async () => {
    if (!accessToken || !activeWorkspace || !activeWorkflow) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/workflows/${activeWorkflow.id}/approve`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      if (activeConversation) {
        await handleSelectConversation(activeConversation.id);
      }
      setFeedback({
        type: 'success',
        message: 'Workflow APPROVED at Human Approval Checkpoint and ready for publishing',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Approval failed',
      });
    }
  };

  // Compute current active scene & word for the interactive Remotion Frame Player
  const activeScene =
    compiled?.sequences.find(
      (s) => currentFrame >= s.startFrame && currentFrame < s.endFrame,
    ) ??
    compiled?.sequences[0] ??
    null;

  const currentSec = compiled ? Number((currentFrame / compiled.fps).toFixed(2)) : 0;
  const activeWord =
    activeScene?.captionWords.find(
      (w) => currentSec >= w.startSec && currentSec <= w.endSec,
    )?.word ?? null;

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="AI Studio"
          description="Describe your creative goal — plan, script, storyboard, render, and review Visual QA in one place."
          badge={
            <Badge variant={isSimulatedMode ? 'warning' : 'success'}>
              {isSimulatedMode ? 'Simulated Fallback Mode' : 'Live AI Provider Active'}
            </Badge>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Target platform"
                value={targetPlatform}
                onChange={(e) => setTargetPlatform(e.target.value)}
                className="w-auto"
              >
                <option value="INSTAGRAM_REELS">Instagram Reels (9:16)</option>
                <option value="TIKTOK">TikTok (9:16)</option>
                <option value="YOUTUBE_SHORTS">YouTube Shorts (9:16)</option>
                <option value="YOUTUBE_LONG">YouTube 16:9</option>
                <option value="LINKEDIN">LinkedIn Video</option>
              </Select>

              <Select
                aria-label="Template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-auto"
              >
                <option value="instagram-reel">Template: Instagram Reel Hook</option>
                <option value="tiktok-short">Template: TikTok Kinetic</option>
                <option value="youtube-short">Template: YouTube Short</option>
                <option value="podcast-clip">Template: Podcast Dual Split</option>
                <option value="product-demo">Template: Product Demo (60fps)</option>
                <option value="educational-video">Template: Educational Explainer</option>
                <option value="promotional-video">Template: Social Promo (4:5)</option>
                <option value="data-explainer">Template: Data Chart Explainer (1:1)</option>
              </Select>
            </div>
          }
        />

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left Rail: Project & Conversation Selector */}
          <Card className="flex flex-col p-4 lg:col-span-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Project &amp; Sessions
            </h2>

            <form
              onSubmit={handleCreateConversation}
              className="mt-3 space-y-2 border-b border-border pb-3"
            >
              <Select
                aria-label="Select project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">Select Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  required
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  placeholder="New session title..."
                />
                <Button type="submit" size="sm">
                  New
                </Button>
              </div>
            </form>

            <div className="mt-3 max-h-96 flex-1 space-y-2 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No sessions yet. Create one above.
                </p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => void handleSelectConversation(conv.id)}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      activeConversation?.id === conv.id
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border bg-secondary/40 text-foreground hover:bg-secondary'
                    }`}
                  >
                    <div className="truncate text-xs font-medium">{conv.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {conv.project?.name ?? 'Project'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* Center Pane: Prompt Input, Conversation & Storyboard Breakdown */}
          <Card className="flex flex-col p-4 lg:col-span-5">
            <div className="border-b border-border pb-3">
              <h2 className="text-base font-semibold text-foreground">
                {activeConversation?.title ?? 'AI Production Workspace'}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Describe → Plan → Script → Compose → Render → Visual QA → Approve
              </p>
            </div>

            <div className="my-3 max-h-80 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {!activeConversation?.messages?.length ? (
                <EmptyState
                  icon={<Sparkles className="h-5 w-5 text-primary" />}
                  title="Describe your video idea below"
                  description="Tell AI Studio the topic, audience, or hook. It will plan scenes, write captions, and render an MP4."
                />
              ) : (
                activeConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-3 text-xs ${
                      msg.role === 'USER'
                        ? 'ml-6 bg-primary text-primary-foreground'
                        : 'mr-6 border border-border bg-secondary text-foreground'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] opacity-75">
                      <span className="font-semibold">{msg.agentName ?? msg.role}</span>
                      <span className="tabular-nums">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="leading-relaxed">{msg.content}</p>
                  </div>
                ))
              )}
            </div>

            {compiled && (
              <div className="mb-3 rounded-xl border border-border bg-secondary/40 p-3">
                <div className="text-xs font-semibold text-primary">
                  Compiled Storyboard &amp; Scenes ({compiled.sequences.length} •{' '}
                  {compiled.totalDurationSec}s)
                </div>
                <div className="mt-2 space-y-1.5">
                  {compiled.sequences.map((seq) => (
                    <div
                      key={seq.sceneId}
                      onClick={() => setCurrentFrame(seq.startFrame)}
                      className="cursor-pointer rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-center justify-between font-medium text-foreground">
                        <span>
                          Scene {seq.orderIndex + 1}: {seq.headlineText}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          f{seq.startFrame}-{seq.endFrame} ({seq.layout})
                        </span>
                      </div>
                      <div className="truncate text-muted-foreground">{seq.narrationText}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleRunProduction} className="space-y-2 border-t border-border pt-3">
              <div className="flex flex-col gap-2">
                <Input
                  type="text"
                  required
                  disabled={producing}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Describe your video (e.g. 15s SaaS launch reel)..."
                  className="min-w-0 w-full"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={simulateDefectsOnce}
                      onChange={(e) => setSimulateDefectsOnce(e.target.checked)}
                    />
                    QA stress test: inject sample defect once to verify auto-revision
                  </label>
                  <Button type="submit" variant="ai" disabled={producing} className="shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                    {producing ? 'Producing...' : 'Produce & Render'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* Right Panel: Preview, Version Undo/Redo, QA & Approval Gate */}
          <Card className="flex flex-col space-y-4 p-4 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preview &amp; QA Gate
              </h2>
              {activeVersion && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="ai">v{activeVersion.versionNumber}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUndoRedo('undo')}
                    className="h-7 px-2 text-[11px]"
                  >
                    Undo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUndoRedo('redo')}
                    className="h-7 px-2 text-[11px]"
                  >
                    Redo
                  </Button>
                </div>
              )}
            </div>

            {compiled && activeScene ? (
              <div className="space-y-3">
                <div
                  className="relative mx-auto flex aspect-[9/16] max-h-72 w-44 flex-col justify-between overflow-hidden rounded-xl border border-border p-3 shadow-md"
                  style={{ backgroundColor: compiled.brand.secondaryColor }}
                >
                  <div className="flex items-center justify-between text-[9px] text-foreground">
                    <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono">
                      {activeScene.layout}
                    </span>
                    <span className="font-mono tabular-nums">
                      f{currentFrame}/{compiled.durationInFrames}
                    </span>
                  </div>

                  <div className="my-auto text-center">
                    <div
                      className="rounded-lg px-2 py-1 text-xs font-bold leading-snug text-white shadow"
                      style={{ backgroundColor: `${compiled.brand.primaryColor}CC` }}
                    >
                      {activeScene.headlineText}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="rounded bg-black/75 px-2 py-1 text-center text-[11px] font-bold">
                      <span style={{ color: compiled.captions.highlightColor }}>
                        {activeWord ?? activeScene.narrationText}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded bg-black/40">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${Math.round((currentFrame / Math.max(1, compiled.durationInFrames)) * 100)}%`,
                          backgroundColor: compiled.brand.accentColor,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setIsPlaying((p) => !p)}>
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  <input
                    type="range"
                    aria-label="Timeline scrubber"
                    min={0}
                    max={Math.max(1, compiled.durationInFrames - 1)}
                    value={currentFrame}
                    onChange={(e) => setCurrentFrame(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                title="No preview compiled yet"
                description="Enter a prompt and click Produce & Render to preview scenes and captions."
              />
            )}

            {qaReport && (
              <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">Visual QA Inspection</span>
                  <Badge variant={qaReport.passed ? 'success' : 'warning'}>
                    Score: {qaReport.overallScore}/100 ({qaReport.passed ? 'PASSED' : 'REVISED'})
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{qaReport.summary}</p>

                {renderJob?.downloadUrl && (
                  <VideoPlayer
                    src={renderJob.downloadUrl}
                    sizeBytes={renderJob.outputSizeBytes}
                  />
                )}
              </div>
            )}

            {activeWorkflow && (
              <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="ai">Stage: {activeWorkflow.stage}</Badge>
                  <span className="text-[10px] text-muted-foreground">{activeWorkflow.status}</span>
                </div>

                <form onSubmit={handleReviseWorkflow} className="flex gap-1.5">
                  <Input
                    type="text"
                    value={revisionInput}
                    onChange={(e) => setRevisionInput(e.target.value)}
                    placeholder="Ask AI to revise..."
                  />
                  <Button type="submit" variant="secondary" size="sm" disabled={producing}>
                    Revise
                  </Button>
                </form>

                {activeWorkflow.stage === 'AWAITING_APPROVAL' && (
                  <Button
                    type="button"
                    onClick={() => void handleApproveWorkflow()}
                    className="w-full bg-success text-success-foreground hover:opacity-95"
                  >
                    Approve Content (Human Approval Gate)
                  </Button>
                )}
              </div>
            )}

            {sseEvents.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto border-t border-border pt-2">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Live SSE Stream
                </div>
                {sseEvents.map((ev) => (
                  <div
                    key={ev.eventId}
                    className="rounded border border-primary/20 bg-ai-surface px-2 py-1 text-[10px] text-foreground"
                  >
                    <strong className="text-primary">{ev.stage}:</strong> {ev.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
