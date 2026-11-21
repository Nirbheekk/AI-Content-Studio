'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
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
      <div className="space-y-4">
        {/* Top Configuration & Provider Disclosure Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">AI Studio Production Engine</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                isSimulatedMode
                  ? 'border border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {isSimulatedMode
                ? '[SIMULATED FALLBACK MODE — Configure API Keys in .env for Live LLMs]'
                : '[LIVE AI PROVIDER ACTIVE]'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={targetPlatform}
              onChange={(e) => setTargetPlatform(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="INSTAGRAM_REELS">Instagram Reels (9:16)</option>
              <option value="TIKTOK">TikTok (9:16)</option>
              <option value="YOUTUBE_SHORTS">YouTube Shorts (9:16)</option>
              <option value="YOUTUBE_LONG">YouTube 16:9</option>
              <option value="LINKEDIN">LinkedIn Video</option>
            </select>

            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="instagram-reel">Template: Instagram Reel Hook</option>
              <option value="tiktok-short">Template: TikTok Kinetic</option>
              <option value="youtube-short">Template: YouTube Short</option>
              <option value="podcast-clip">Template: Podcast Dual Split</option>
              <option value="product-demo">Template: Product Demo (60fps)</option>
              <option value="educational-video">Template: Educational Explainer</option>
              <option value="promotional-video">Template: Social Promo (4:5)</option>
              <option value="data-explainer">Template: Data Chart Explainer (1:1)</option>
            </select>

            <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
              <input
                type="checkbox"
                checked={simulateDefectsOnce}
                onChange={(e) => setSimulateDefectsOnce(e.target.checked)}
              />
              Verify QA Auto-Revision Loop
            </label>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left Rail: Project & Conversation Selector */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Project &amp; Sessions
            </h2>

            <form
              onSubmit={handleCreateConversation}
              className="mt-3 space-y-2 border-b border-zinc-800 pb-3"
            >
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="">Select Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  placeholder="New session title..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  New
                </button>
              </div>
            </form>

            <div className="mt-3 max-h-96 flex-1 space-y-2 overflow-y-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => void handleSelectConversation(conv.id)}
                  className={`w-full rounded-lg border p-2.5 text-left transition ${
                    activeConversation?.id === conv.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="truncate text-xs font-medium">{conv.title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                    {conv.project?.name ?? 'Project'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Center Pane: Prompt Input, Conversation & Storyboard Breakdown */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-5">
            <div className="border-b border-zinc-800 pb-3">
              <h1 className="text-base font-bold text-white">
                {activeConversation?.title ?? 'AI Production Workspace'}
              </h1>
              <p className="text-[11px] text-zinc-400">
                Upload → Analyze → Plan → Script → Compose → Render → Visual QA → Revise → Approve
              </p>
            </div>

            <div className="my-3 max-h-80 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {activeConversation?.messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl p-3 text-xs ${
                    msg.role === 'USER'
                      ? 'ml-6 bg-indigo-600 text-white'
                      : 'mr-6 border border-zinc-800 bg-zinc-950 text-zinc-200'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] opacity-75">
                    <span className="font-semibold">{msg.agentName ?? msg.role}</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="leading-relaxed">{msg.content}</p>
                </div>
              ))}
            </div>

            {compiled && (
              <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs font-semibold text-indigo-300">
                  Compiled Storyboard &amp; Scene Sequences ({compiled.sequences.length} Scenes •{' '}
                  {compiled.totalDurationSec}s)
                </div>
                <div className="mt-2 space-y-1.5">
                  {compiled.sequences.map((seq) => (
                    <div
                      key={seq.sceneId}
                      onClick={() => setCurrentFrame(seq.startFrame)}
                      className="cursor-pointer rounded border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] hover:border-indigo-500/40"
                    >
                      <div className="flex items-center justify-between font-medium text-white">
                        <span>
                          Scene {seq.orderIndex + 1}: {seq.headlineText}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          f{seq.startFrame}-{seq.endFrame} ({seq.layout})
                        </span>
                      </div>
                      <div className="truncate text-zinc-400">{seq.narrationText}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleRunProduction} className="border-t border-zinc-800 pt-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  disabled={producing}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Describe your video (e.g. 'Create an Instagram Reel with dynamic captions and strong hook')..."
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={producing}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {producing ? 'Producing...' : 'Produce & Render'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Panel: Remotion Player Preview, Version Undo/Redo, QA & Approval Gate */}
          <div className="flex flex-col space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Remotion Player &amp; QA Gate
              </h2>
              {activeVersion && (
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                    v{activeVersion.versionNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleUndoRedo('undo')}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUndoRedo('redo')}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700"
                  >
                    Redo
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Remotion Composition Canvas Preview */}
            {compiled && activeScene ? (
              <div className="space-y-3">
                <div
                  className="relative mx-auto flex aspect-[9/16] max-h-72 w-44 flex-col justify-between overflow-hidden rounded-xl border border-zinc-700 p-3 shadow-xl"
                  style={{
                    backgroundColor: compiled.brand.secondaryColor,
                  }}
                >
                  <div className="flex items-center justify-between text-[9px] text-zinc-300">
                    <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono">
                      {activeScene.layout}
                    </span>
                    <span className="font-mono">
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
                    <div className="rounded bg-black/70 px-2 py-1 text-center text-[11px] font-extrabold">
                      <span style={{ color: compiled.captions.highlightColor }}>
                        {activeWord ?? activeScene.narrationText}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded bg-zinc-800">
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
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
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
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-xs text-zinc-500">
                Enter a prompt and click &ldquo;Produce &amp; Render&rdquo; to compile and preview
                the Remotion composition.
              </div>
            )}

            {/* Visual QA Report & Rendered MP4 Artifact */}
            {qaReport && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Visual QA Inspection</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      qaReport.passed
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    Score: {qaReport.overallScore}/100 ({qaReport.passed ? 'PASSED' : 'REVISED'})
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{qaReport.summary}</p>

                {renderJob?.downloadUrl && (
                  <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                    <video
                      key={renderJob.downloadUrl}
                      controls
                      playsInline
                      preload="metadata"
                      src={renderJob.downloadUrl}
                      className="max-h-72 w-full rounded-lg border border-zinc-800 bg-black object-contain"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">
                        MP4 ({renderJob.outputSizeBytes} bytes)
                      </span>
                      <a
                        href={renderJob.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-indigo-400 hover:underline"
                      >
                        Download Rendered MP4
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Conversational Revision & Human Approval Checkpoint */}
            {activeWorkflow && (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300">
                    Stage: {activeWorkflow.stage}
                  </span>
                  <span className="text-[10px] text-zinc-400">{activeWorkflow.status}</span>
                </div>

                <form onSubmit={handleReviseWorkflow} className="flex gap-1.5">
                  <input
                    type="text"
                    value={revisionInput}
                    onChange={(e) => setRevisionInput(e.target.value)}
                    placeholder="Ask AI to revise (e.g. 'Make captions larger')..."
                    className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="submit"
                    disabled={producing}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Revise
                  </button>
                </form>

                {activeWorkflow.stage === 'AWAITING_APPROVAL' && (
                  <button
                    type="button"
                    onClick={() => void handleApproveWorkflow()}
                    className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    Approve Content (Human Approval Gate)
                  </button>
                )}
              </div>
            )}

            {/* Real-Time SSE Feed */}
            {sseEvents.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto border-t border-zinc-800 pt-2">
                <div className="text-[10px] font-semibold uppercase text-zinc-500">
                  Live SSE Stream
                </div>
                {sseEvents.map((ev) => (
                  <div
                    key={ev.eventId}
                    className="rounded border border-indigo-500/20 bg-indigo-500/5 px-2 py-1 text-[10px] text-zinc-300"
                  >
                    <strong className="text-indigo-300">{ev.stage}:</strong> {ev.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
