'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Film,
  FolderPlus,
  Layers,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
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
  StatusIndicator,
} from '../../components/design-system/primitives';
import { VideoPlayer } from '../../components/creative/video-player';
import { useStudio } from '../../context/studio-context';
import {
  apiRequest,
  AssetDto,
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

const PIPELINE_STAGES = [
  { id: 'ANALYZING', label: '1. Analyze' },
  { id: 'PLANNING', label: '2. Plan' },
  { id: 'SCRIPTING', label: '3. Script' },
  { id: 'COMPOSING', label: '4. Compose' },
  { id: 'RENDERING', label: '5. Render' },
  { id: 'REVIEWING', label: '6. Visual QA' },
  { id: 'AWAITING_APPROVAL', label: '7. Approval' },
] as const;

const PROMPT_STARTERS = [
  'Create a 15s SaaS product launch reel with a bold hook and 3 feature scenes',
  'Create a fast-paced educational short explaining 3 AI productivity workflows',
  'Turn our founder podcast insights into a kinetic TikTok clip with clear CTA',
];

function formatCleanTitle(raw: string): string {
  return raw.replace(/[-_]\d{10,14}$/, '').trim() || raw;
}

export default function AIStudioPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectAssets, setProjectAssets] = useState<AssetDto[]>([]);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDto | null>(null);

  // Quick inline project creation
  const [showQuickProject, setShowQuickProject] = useState<boolean>(false);
  const [quickProjectName, setQuickProjectName] = useState<string>('');
  const [creatingProject, setCreatingProject] = useState<boolean>(false);
  const [uploadingAsset, setUploadingAsset] = useState<boolean>(false);

  // Production configuration
  const [templateId, setTemplateId] = useState<string>('instagram-reel');
  const [targetPlatform, setTargetPlatform] = useState<string>('INSTAGRAM_REELS');
  const [simulateDefectsOnce, setSimulateDefectsOnce] = useState<boolean>(false);
  const [promptInput, setPromptInput] = useState<string>('');
  const [newConvTitle, setNewConvTitle] = useState<string>('');
  const [revisionInput, setRevisionInput] = useState<string>('');
  const [producing, setProducing] = useState<boolean>(false);

  // Active Production Artifacts
  const [latestWorkflow, setLatestWorkflow] = useState<WorkflowDto | null>(null);
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

  const loadProjectAssets = useCallback(
    async (projId: string) => {
      if (!accessToken || !activeWorkspace || !projId) {
        setProjectAssets([]);
        return;
      }
      try {
        const list = await apiRequest<AssetDto[]>({
          path: `/api/v1/assets?projectId=${encodeURIComponent(projId)}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setProjectAssets(list);
      } catch {
        setProjectAssets([]);
      }
    },
    [accessToken, activeWorkspace],
  );

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
      if (defaultProjId) {
        await loadProjectAssets(defaultProjId);
      }

      if (convList[0] && !activeConversation) {
        const detail = await apiRequest<ConversationDto>({
          path: `/api/v1/conversations/${convList[0].id}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setActiveConversation(detail);
      }

      if (!compiled) {
        const compList = await apiRequest<Array<{ id: string; title: string }>>({
          path: '/api/v1/compositions',
          accessToken,
          workspaceId: activeWorkspace.id,
        }).catch(() => []);
        if (compList[0]) {
          const compDetail = await apiRequest<{
            id: string;
            activeVersion: CompositionVersionView | null;
            compiled: CompiledView | null;
            versions: Array<{
              id: string;
              renderJobs: RenderJobView[];
            }>;
          }>({
            path: `/api/v1/compositions/${compList[0].id}`,
            accessToken,
            workspaceId: activeWorkspace.id,
          }).catch(() => null);
          if (compDetail?.compiled) {
            setActiveCompositionId(compDetail.id);
            setActiveVersion(compDetail.activeVersion);
            setCompiled(compDetail.compiled);
            const latestJob = compDetail.versions[0]?.renderJobs[0] ?? null;
            if (latestJob) {
              setRenderJob(latestJob);
            }
          }
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load AI Studio workspace',
      });
    }
  }, [
    accessToken,
    activeWorkspace,
    selectedProjectId,
    activeConversation,
    loadProjectAssets,
    setFeedback,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qProjectId = params.get('projectId');
    const qPrompt = params.get('prompt');
    const qPlatform = params.get('platform');
    if (qProjectId) setSelectedProjectId(qProjectId);
    if (qPrompt) setPromptInput(qPrompt);
    if (qPlatform) setTargetPlatform(qPlatform);
  }, []);

  useEffect(() => {
    void loadStudioState();
  }, [loadStudioState]);

  useEffect(() => {
    if (selectedProjectId) {
      void loadProjectAssets(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectAssets]);

  const activeWorkflow: WorkflowDto | null =
    activeConversation?.workflows?.[0] ?? latestWorkflow;

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
      if (detail.projectId) {
        setSelectedProjectId(detail.projectId);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load conversation',
      });
    }
  };

  const handleCreateQuickProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !quickProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const created = await apiRequest<ProjectDto>({
        method: 'POST',
        path: '/api/v1/projects',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { name: quickProjectName.trim() },
      });
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(created.id);
      setQuickProjectName('');
      setShowQuickProject(false);
      setFeedback({ type: 'success', message: `Project "${created.name}" created and selected` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create project',
      });
    } finally {
      setCreatingProject(false);
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
      setFeedback({ type: 'success', message: 'New AI Studio session started' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start session',
      });
    }
  };

  const handleInlineUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const targetProjId = activeConversation?.projectId ?? selectedProjectId;
    if (!files || files.length === 0 || !accessToken || !activeWorkspace) return;

    setUploadingAsset(true);
    try {
      for (const file of Array.from(files)) {
        const mimeType = file.type || 'text/plain';
        const arrayBuffer = await file.arrayBuffer();
        const initRes = await apiRequest<{
          asset: AssetDto;
          uploadUrl: string;
          directUploadPath: string;
        }>({
          method: 'POST',
          path: '/api/v1/assets/upload-url',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {
            originalName: file.name,
            mimeType,
            sizeBytes: file.size || arrayBuffer.byteLength || 1,
            ...(targetProjId ? { projectId: targetProjId } : {}),
            folderPath: '/studio-uploads',
            tags: ['studio'],
          },
        });

        await apiRequest<AssetDto>({
          method: 'PUT',
          path: initRes.directUploadPath,
          accessToken,
          workspaceId: activeWorkspace.id,
          rawBody: arrayBuffer,
          contentType: mimeType,
        });

        await apiRequest<AssetDto>({
          method: 'POST',
          path: `/api/v1/assets/${initRes.asset.id}/complete`,
          accessToken,
          workspaceId: activeWorkspace.id,
          body: { tags: ['studio'] },
        });
      }
      if (targetProjId) {
        await loadProjectAssets(targetProjId);
      }
      setFeedback({ type: 'success', message: 'Source media uploaded to project context' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Media upload failed',
      });
    } finally {
      setUploadingAsset(false);
      e.target.value = '';
    }
  };

  const handleRunProduction = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      setLatestWorkflow(result.workflow);
      setActiveCompositionId(result.compositionId);
      setActiveVersion(result.compositionVersion);
      setCompiled(result.compiled);
      setRenderJob(result.renderJob);
      setQaReport(result.qaReport);
      setIsSimulatedMode(result.isSimulated);
      setCurrentFrame(0);

      if (activeConversation) {
        await handleSelectConversation(activeConversation.id);
      } else {
        await loadStudioState();
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
      setLatestWorkflow(result.workflow);
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
      setLatestWorkflow((prev) =>
        prev ? { ...prev, stage: 'APPROVED', status: 'APPROVED' } : null,
      );
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

  const currentProject = projects.find(
    (p) => p.id === (activeConversation?.projectId ?? selectedProjectId),
  );
  const currentStage = activeWorkflow?.stage ?? null;
  const activeStageIndex = PIPELINE_STAGES.findIndex(
    (s) =>
      s.id === currentStage ||
      (currentStage === 'APPROVED' && s.id === 'AWAITING_APPROVAL'),
  );

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="AI Studio"
          description="Describe your creative objective — AI analyzes project assets, scripts scenes, compiles Remotion compositions, and runs Visual QA."
          badge={
            <div className="flex items-center gap-2">
              <Badge variant={isSimulatedMode ? 'warning' : 'success'}>
                {isSimulatedMode ? 'Simulated Fallback Mode' : 'Live AI Provider Active'}
              </Badge>
              {currentProject && (
                <Badge variant="ai">Project: {formatCleanTitle(currentProject.name)}</Badge>
              )}
            </div>
          }
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select
                aria-label="Target platform"
                value={targetPlatform}
                onChange={(e) => setTargetPlatform(e.target.value)}
                className="w-full sm:w-auto"
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
                className="w-full sm:w-auto"
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

        {/* Real 7-Stage Production Pipeline Status Bar */}
        <Card className="p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              <span>7-Agent Production Pipeline</span>
            </div>
            <StatusIndicator
              status={
                producing
                  ? 'processing'
                  : currentStage === 'APPROVED'
                    ? 'success'
                    : currentStage === 'AWAITING_APPROVAL'
                      ? 'warning'
                      : currentStage === 'FAILED'
                        ? 'error'
                        : 'idle'
              }
              label={
                producing
                  ? 'Processing creative workflow...'
                  : currentStage === 'APPROVED'
                    ? 'Completed & Approved for Publishing'
                    : currentStage === 'AWAITING_APPROVAL'
                      ? 'Requires User Action: Human Approval Gate'
                      : currentStage === 'FAILED'
                        ? 'Workflow Failed — Revise or Retry'
                        : 'Waiting for creative prompt'
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCompleted =
                currentStage === 'APPROVED' ||
                (activeStageIndex >= 0 && idx < activeStageIndex);
              const isCurrent =
                producing && idx === Math.max(0, activeStageIndex)
                  ? true
                  : activeStageIndex === idx && currentStage !== 'APPROVED';
              return (
                <div
                  key={stage.id}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    isCompleted
                      ? 'border-success/35 bg-success-surface text-success'
                      : isCurrent
                        ? 'border-primary bg-ai-surface text-primary'
                        : 'border-border bg-secondary/40 text-muted-foreground'
                  }`}
                >
                  <span className="truncate">{stage.label}</span>
                  {isCompleted && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-12">
          {/* Left Rail: Project Context, Source Media & Sessions */}
          <Card className="flex flex-col p-4 xl:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Project &amp; Context
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickProject((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <FolderPlus className="h-3 w-3" />
                {showQuickProject ? 'Close' : 'New Project'}
              </button>
            </div>

            {showQuickProject && (
              <form
                onSubmit={handleCreateQuickProject}
                className="mt-2.5 flex gap-1.5 rounded-lg border border-primary/30 bg-ai-surface p-2"
              >
                <Input
                  type="text"
                  required
                  value={quickProjectName}
                  onChange={(e) => setQuickProjectName(e.target.value)}
                  placeholder="Project name..."
                  className="h-8 text-xs"
                />
                <Button type="submit" size="sm" disabled={creatingProject}>
                  Add
                </Button>
              </form>
            )}

            <div className="mt-2.5">
              <Select
                aria-label="Select project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">Select Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatCleanTitle(p.name)}
                  </option>
                ))}
              </Select>
            </div>

            {/* Project Source Media Context & Inline Upload */}
            <div className="mt-3 rounded-xl border border-border bg-secondary/35 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground">
                  Source Assets ({projectAssets.length})
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-secondary">
                  <Upload className="h-3 w-3" />
                  <span>{uploadingAsset ? 'Uploading...' : 'Upload'}</span>
                  <input
                    type="file"
                    multiple
                    disabled={uploadingAsset}
                    onChange={(e) => void handleInlineUpload(e)}
                    className="hidden"
                  />
                </label>
              </div>
              {projectAssets.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  No raw media uploaded to this project yet. Upload footage or prompt directly.
                </p>
              ) : (
                <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {projectAssets.map((asset) => (
                    <span
                      key={asset.id}
                      title={asset.originalName}
                      className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground"
                    >
                      <span className="font-semibold text-primary">{asset.assetType}</span>
                      <span className="truncate">{asset.originalName}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Session History */}
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Production Sessions
              </h3>
              <form onSubmit={handleCreateConversation} className="mt-2 flex gap-1.5">
                <Input
                  type="text"
                  required
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  placeholder="New session title"
                  className="h-8 text-xs"
                />
                <Button type="submit" size="sm" variant="secondary">
                  New
                </Button>
              </form>

              <div className="mt-2.5 max-h-72 flex-1 space-y-1.5 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No sessions yet. Create one above or run a prompt directly.
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
                        {conv.project?.name ? formatCleanTitle(conv.project.name) : 'Project'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>

          {/* Center Pane: AI Conversation, Structured Storyboard Plan & Prompt Composer */}
          <Card className="flex flex-col p-4 xl:col-span-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {activeConversation?.title ?? '2. Creative Prompt & Storyboard'}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Describe → Plan → Script → Compose → Render → Visual QA → Approve
                </p>
              </div>
              {compiled && (
                <Badge variant="ai">
                  {compiled.sequences.length} Scenes • {compiled.totalDurationSec}s
                </Badge>
              )}
            </div>

            {/* Conversation Stream */}
            <div className="my-3 max-h-72 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {!activeConversation?.messages?.length ? (
                <div className="space-y-3">
                  <EmptyState
                    icon={<Sparkles className="h-5 w-5 text-primary" />}
                    title="Describe your video concept"
                    description="Enter a creative brief below or choose a starter prompt to generate a production plan, script, and rendered MP4."
                  />
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Try a starter creative brief:
                    </div>
                    {PROMPT_STARTERS.map((starter, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPromptInput(starter)}
                        className="block w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                      >
                        &ldquo;{starter}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                activeConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-3 text-xs ${
                      msg.role === 'USER'
                        ? 'ml-6 bg-primary text-primary-foreground shadow-sm'
                        : 'mr-4 border border-border bg-secondary/60 text-foreground'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] opacity-85">
                      <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide">
                        {msg.role !== 'USER' && <Sparkles className="h-3 w-3 text-primary" />}
                        {msg.agentName ?? msg.role}
                      </span>
                      <span className="tabular-nums">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Structured Storyboard & Scene Breakdown */}
            {compiled && (
              <div className="mb-3 rounded-xl border border-primary/25 bg-ai-surface/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Layers className="h-3.5 w-3.5" />
                    <span>
                      Production Storyboard ({compiled.sequences.length} Scenes •{' '}
                      {compiled.totalDurationSec}s @ {compiled.fps}fps)
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Click scene to preview</span>
                </div>
                <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
                  {compiled.sequences.map((seq) => {
                    const isCurrentScene = activeScene?.sceneId === seq.sceneId;
                    return (
                      <button
                        key={seq.sceneId}
                        type="button"
                        onClick={() => setCurrentFrame(seq.startFrame)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors ${
                          isCurrentScene
                            ? 'border-primary bg-card shadow-sm'
                            : 'border-border bg-card/70 hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-semibold text-foreground">
                          <span className="truncate">
                            Scene {seq.orderIndex + 1}: {seq.headlineText}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                            f{seq.startFrame}–{seq.endFrame} • {seq.layout}
                          </span>
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-muted-foreground">
                          {seq.narrationText}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lovable-Inspired Floating Creative Prompt Composer */}
            <form
              onSubmit={handleRunProduction}
              className="mt-2 overflow-hidden rounded-[20px] border border-border/80 bg-card shadow-lg ring-1 ring-black/5 transition-shadow focus-within:ring-2 focus-within:ring-primary/35 dark:ring-white/10"
            >
              <textarea
                rows={3}
                required
                disabled={producing}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void handleRunProduction();
                  }
                }}
                placeholder="Describe your video objective, target audience, hook, and visual style (Ctrl+Enter to generate)..."
                className="min-h-[78px] w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-secondary/25 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary">
                    <Upload className="h-3 w-3 text-primary" />
                    <span>{uploadingAsset ? 'Uploading...' : 'Attach Media'}</span>
                    <input
                      type="file"
                      multiple
                      disabled={uploadingAsset || producing}
                      onChange={(e) => void handleInlineUpload(e)}
                      className="hidden"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={simulateDefectsOnce}
                      onChange={(e) => setSimulateDefectsOnce(e.target.checked)}
                    />
                    <span>QA test</span>
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="ai"
                  size="sm"
                  disabled={producing || (!selectedProjectId && !activeConversation?.projectId)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {producing ? 'Producing & Rendering...' : 'Produce & Render'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Right Panel: Preview, Version Undo/Redo, QA & Approval Gate */}
          <Card className="flex flex-col space-y-4 p-4 xl:col-span-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Preview &amp; Approval Gate
              </h2>
              {activeVersion && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="ai">v{activeVersion.versionNumber}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUndoRedo('undo')}
                    title="Undo version"
                    className="h-7 px-2 text-[11px]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Undo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUndoRedo('redo')}
                    title="Redo version"
                    className="h-7 px-2 text-[11px]"
                  >
                    <RotateCw className="h-3 w-3" />
                    Redo
                  </Button>
                </div>
              )}
            </div>

            {compiled && activeScene ? (
              <div className="space-y-3">
                <div
                  className="relative mx-auto flex aspect-[9/16] max-h-72 w-44 flex-col justify-between overflow-hidden rounded-xl border border-border bg-canvas p-3 shadow-md"
                  style={{ backgroundColor: compiled.brand.secondaryColor }}
                >
                  <div className="flex items-center justify-between text-[9px] text-white">
                    <span className="rounded bg-black/65 px-1.5 py-0.5 font-mono">
                      {activeScene.layout}
                    </span>
                    <span className="rounded bg-black/65 px-1.5 py-0.5 font-mono tabular-nums">
                      f{currentFrame}/{compiled.durationInFrames}
                    </span>
                  </div>

                  <div className="my-auto text-center">
                    <div
                      className="rounded-lg px-2 py-1 text-xs font-bold leading-snug text-white shadow"
                      style={{ backgroundColor: `${compiled.brand.primaryColor}DD` }}
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
                  <Button size="sm" variant="secondary" onClick={() => setIsPlaying((p) => !p)}>
                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
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
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {currentSec}s
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Film className="h-5 w-5 text-muted-foreground" />}
                title="No composition compiled yet"
                description="Run a creative prompt in the center pane to compile scenes, preview word-synced captions, and render an MP4."
              />
            )}

            {qaReport && (
              <div className="space-y-2.5 rounded-xl border border-border bg-secondary/35 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">Visual QA Report</span>
                  <Badge variant={qaReport.passed ? 'success' : 'warning'}>
                    Score: {qaReport.overallScore}/100 ({qaReport.passed ? 'PASSED' : 'AUTO-REVISED'})
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{qaReport.summary}</p>

                {renderJob?.downloadUrl && (
                  <VideoPlayer
                    src={renderJob.downloadUrl}
                    sizeBytes={renderJob.outputSizeBytes}
                  />
                )}

                {activeCompositionId && (
                  <div className="flex justify-end pt-1">
                    <Link
                      href="/editor"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Film className="h-3.5 w-3.5" />
                      Refine in Video Editor
                    </Link>
                  </div>
                )}
              </div>
            )}

            {activeWorkflow && (
              <div className="space-y-3 rounded-xl border border-border bg-secondary/35 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    variant={
                      activeWorkflow.stage === 'APPROVED'
                        ? 'success'
                        : activeWorkflow.stage === 'AWAITING_APPROVAL'
                          ? 'warning'
                          : 'ai'
                    }
                    className="whitespace-nowrap"
                  >
                    Stage: {activeWorkflow.stage.replace('_', ' ')}
                  </Badge>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {activeWorkflow.status}
                  </span>
                </div>

                <form onSubmit={handleReviseWorkflow} className="flex gap-1.5">
                  <Input
                    type="text"
                    value={revisionInput}
                    onChange={(e) => setRevisionInput(e.target.value)}
                    placeholder="Ask AI to revise hook, pacing, or scene..."
                    className="h-8 text-xs"
                  />
                  <Button type="submit" variant="secondary" size="sm" disabled={producing}>
                    <Send className="h-3 w-3" />
                    Revise
                  </Button>
                </form>

                {activeWorkflow.stage === 'AWAITING_APPROVAL' && (
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={() => void handleApproveWorkflow()}
                    className="w-full whitespace-nowrap"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    Approve Content (Human Gate)
                  </Button>
                )}

                {activeWorkflow.stage === 'APPROVED' && (
                  <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-surface px-3 py-2 text-xs text-success">
                    <span className="font-medium">Approved for publishing</span>
                    <Link href="/publish" className="font-semibold underline">
                      Publish Now →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {sseEvents.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto border-t border-border pt-2">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Live Orchestration Stream
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
