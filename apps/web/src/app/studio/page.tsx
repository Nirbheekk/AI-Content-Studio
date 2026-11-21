'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Send, Sparkles, Wand2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  StatusIndicator,
  Textarea,
  WorkflowStepper,
} from '@/components/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { StudioContextRail } from '@/components/studio/studio-context-rail';
import { StudioPreviewPane } from '@/components/studio/studio-preview-pane';
import {
  CompiledView,
  CompositionVersionView,
  PIPELINE_STAGES,
  PROMPT_STARTERS,
  QaReportView,
  RenderJobView,
} from '@/components/studio/studio-types';
import { useStudio } from '@/context/studio-context';
import {
  apiRequest,
  AssetDto,
  ConversationDto,
  getApiBaseUrl,
  ProjectDto,
  WorkflowDto,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

export default function AIStudioPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectAssets, setProjectAssets] = useState<AssetDto[]>([]);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDto | null>(null);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [quickProjectName, setQuickProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  const [templateId, setTemplateId] = useState('instagram-reel');
  const [targetPlatform, setTargetPlatform] = useState('INSTAGRAM_REELS');
  const [simulateDefectsOnce, setSimulateDefectsOnce] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [revisionInput, setRevisionInput] = useState('');
  const [producing, setProducing] = useState(false);

  const [latestWorkflow, setLatestWorkflow] = useState<WorkflowDto | null>(null);
  const [activeCompositionId, setActiveCompositionId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<CompositionVersionView | null>(null);
  const [compiled, setCompiled] = useState<CompiledView | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJobView | null>(null);
  const [qaReport, setQaReport] = useState<QaReportView | null>(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState(true);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sseEvents, setSseEvents] = useState<
    Array<{ eventId: string; stage: string; message: string; timestamp: string }>
  >([]);

  const loadProjectAssets = useCallback(
    async (projId: string) => {
      if (!accessToken || !activeWorkspace || !projId) {
        setProjectAssets([]);
        return;
      }
      const list = await apiRequest<AssetDto[]>({
        path: `/api/v1/assets?projectId=${encodeURIComponent(projId)}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      }).catch(() => []);
      setProjectAssets(list);
    },
    [accessToken, activeWorkspace],
  );

  const handleSelectConversation = useCallback(
    async (convId: string) => {
      if (!accessToken || !activeWorkspace) return;
      try {
        const detail = await apiRequest<ConversationDto>({
          path: `/api/v1/conversations/${convId}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setActiveConversation(detail);
        if (detail.workflows?.[0]) {
          setLatestWorkflow(detail.workflows[0]);
        }
      } catch (err) {
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to open session',
        });
      }
    },
    [accessToken, activeWorkspace, setFeedback],
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
      if (defaultProjId && !selectedProjectId) setSelectedProjectId(defaultProjId);
      if (defaultProjId) await loadProjectAssets(defaultProjId);

      if (convList[0] && !activeConversation) {
        await handleSelectConversation(convList[0].id);
      }

      if (!compiled) {
        const compList = await apiRequest<Array<{ id: string }>>({
          path: '/api/v1/compositions',
          accessToken,
          workspaceId: activeWorkspace.id,
        }).catch(() => []);
        if (compList[0]) {
          const detail = await apiRequest<{
            id: string;
            activeVersion: CompositionVersionView | null;
            compiled: CompiledView | null;
            versions: Array<{ id: string; renderJobs: RenderJobView[] }>;
          }>({
            path: `/api/v1/compositions/${compList[0].id}`,
            accessToken,
            workspaceId: activeWorkspace.id,
          }).catch(() => null);
          if (detail?.compiled) {
            setActiveCompositionId(detail.id);
            setActiveVersion(detail.activeVersion);
            setCompiled(detail.compiled);
            if (detail.versions[0]?.renderJobs[0]) {
              setRenderJob(detail.versions[0].renderJobs[0]);
            }
          }
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load AI Studio',
      });
    }
  }, [
    accessToken,
    activeWorkspace,
    selectedProjectId,
    activeConversation,
    compiled,
    loadProjectAssets,
    handleSelectConversation,
    setFeedback,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qProj = params.get('projectId');
    const qPrompt = params.get('prompt');
    const qPlatform = params.get('platform');
    if (qProj) setSelectedProjectId(qProj);
    if (qPrompt) setPromptInput(qPrompt);
    if (qPlatform) setTargetPlatform(qPlatform);
  }, []);

  useEffect(() => {
    void loadStudioState();
  }, [loadStudioState]);

  useEffect(() => {
    if (!isPlaying || !compiled) return;
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1 >= compiled.durationInFrames ? 0 : prev + 1));
    }, Math.round(1000 / Math.max(1, compiled.fps)));
    return () => clearInterval(interval);
  }, [isPlaying, compiled]);

  const activeWorkflow = latestWorkflow ?? activeConversation?.workflows?.[0] ?? null;

  useEffect(() => {
    if (!activeWorkflow || !accessToken || !activeWorkspace) return;
    const url = `${getApiBaseUrl()}/api/v1/workflows/${activeWorkflow.id}/stream?accessToken=${encodeURIComponent(accessToken)}&workspaceId=${encodeURIComponent(activeWorkspace.id)}`;
    const source = new EventSource(url);
    source.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as {
          eventId?: string;
          stage?: string;
          message?: string;
          timestamp?: string;
        };
        if (parsed.stage && parsed.message) {
          setSseEvents((prev) => [
            ...prev.slice(-24),
            {
              eventId: parsed.eventId ?? `${Date.now()}`,
              stage: parsed.stage!,
              message: parsed.message!,
              timestamp: parsed.timestamp ?? new Date().toISOString(),
            },
          ]);
        }
      } catch {
        // Ignore malformed heartbeat
      }
    };
    return () => source.close();
  }, [activeWorkflow, accessToken, activeWorkspace]);

  const handleQuickCreateProject = async (e: React.FormEvent) => {
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
      setNewProjectOpen(false);
      setFeedback({ type: 'success', message: `Project "${created.name}" created` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create project',
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateConversation = async (title: string) => {
    if (!accessToken || !activeWorkspace || !selectedProjectId) return;
    try {
      const conv = await apiRequest<ConversationDto>({
        method: 'POST',
        path: '/api/v1/conversations',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { projectId: selectedProjectId, title },
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveConversation(conv);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create session',
      });
    }
  };

  const handleUploadAsset = async (file: File) => {
    if (!accessToken || !activeWorkspace || !selectedProjectId) return;
    setUploadingAsset(true);
    try {
      const mimeType = file.type || 'application/octet-stream';
      const arrayBuffer = await file.arrayBuffer();
      const initRes = await apiRequest<{ asset: AssetDto; directUploadPath: string }>({
        method: 'POST',
        path: '/api/v1/assets/upload-url',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId: selectedProjectId,
          originalName: file.name,
          mimeType,
          sizeBytes: file.size || arrayBuffer.byteLength || 1,
          folderPath: '/studio-uploads',
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
      await apiRequest({
        method: 'POST',
        path: `/api/v1/assets/${initRes.asset.id}/complete`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      await loadProjectAssets(selectedProjectId);
      setFeedback({ type: 'success', message: `Uploaded "${file.name}"` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Asset upload failed',
      });
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleProduce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !promptInput.trim()) return;
    const targetProjId = selectedProjectId || projects[0]?.id;
    if (!targetProjId) {
      setNewProjectOpen(true);
      return;
    }
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
      if (activeConversation) await handleSelectConversation(activeConversation.id);
      else await loadStudioState();
      setFeedback({
        type: 'success',
        message: `Generated v${result.compositionVersion.versionNumber} (QA ${result.qaReport.overallScore}/100)`,
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

  const handleRevise = async (e: React.FormEvent) => {
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
        body: { instruction: revisionInput.trim() },
      });
      setRevisionInput('');
      setLatestWorkflow(result.workflow);
      setActiveVersion(result.compositionVersion);
      setCompiled(result.compiled);
      setRenderJob(result.renderJob);
      setQaReport(result.qaReport);
      if (activeConversation) await handleSelectConversation(activeConversation.id);
      setFeedback({
        type: 'success',
        message: `Applied revision -> v${result.compositionVersion.versionNumber}`,
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
      const res = await apiRequest<{ version: CompositionVersionView; compiled: CompiledView }>({
        method: 'POST',
        path: `/api/v1/compositions/${activeCompositionId}/${direction}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setActiveVersion(res.version);
      setCompiled(res.compiled);
      setCurrentFrame(0);
      setFeedback({ type: 'success', message: `Switched to v${res.version.versionNumber}` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Cannot ${direction} further`,
      });
    }
  };

  const handleApprove = async () => {
    if (!accessToken || !activeWorkspace || !activeWorkflow) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/workflows/${activeWorkflow.id}/approve`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setLatestWorkflow((prev) => (prev ? { ...prev, stage: 'APPROVED', status: 'APPROVED' } : null));
      if (activeConversation) await handleSelectConversation(activeConversation.id);
      setFeedback({ type: 'success', message: 'Workflow approved and ready to publish' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Approval failed',
      });
    }
  };

  const activeStageIdx = activeWorkflow
    ? PIPELINE_STAGES.findIndex((s) => s.id === activeWorkflow.stage)
    : -1;

  return (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          title="AI Studio"
          description="Describe your video, stream the 7-agent pipeline, and inspect live Remotion previews."
          badge={activeWorkflow ? <StatusIndicator status={activeWorkflow.stage} /> : undefined}
        />

        <WorkflowStepper activeStep="studio" projectId={selectedProjectId || undefined} />

        {/* 7-Stage Pipeline Bar */}
        <div className="grid grid-cols-7 gap-1 rounded-lg border border-border bg-card p-1.5">
          {PIPELINE_STAGES.map((stage, idx) => {
            const done = activeStageIdx > idx || activeWorkflow?.stage === 'APPROVED';
            const current = activeStageIdx === idx;
            return (
              <div
                key={stage.id}
                className={cn(
                  'rounded-md px-2 py-1 text-center text-xs font-medium transition-colors',
                  current
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-success-surface text-success'
                      : 'text-muted-foreground',
                )}
              >
                {stage.label}
              </div>
            );
          })}
        </div>

        {/* 3-Pane Studio Workspace */}
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3">
          <StudioContextRail
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              void loadProjectAssets(id);
            }}
            projectAssets={projectAssets}
            uploadingAsset={uploadingAsset}
            onUploadFile={(f) => void handleUploadAsset(f)}
            conversations={conversations}
            activeConversationId={activeConversation?.id ?? null}
            onSelectConversation={(id) => void handleSelectConversation(id)}
            onCreateConversation={(title) => void handleCreateConversation(title)}
            onOpenNewProject={() => setNewProjectOpen(true)}
          />
          </div>

          {/* Center Conversational + Prompt Pane */}
          <Card className="flex flex-col overflow-hidden lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-ai" />
                <span className="text-xs font-semibold">
                  {activeConversation?.title ?? 'Production Chat'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label="Template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="h-7 w-36 text-xs"
                >
                  <option value="instagram-reel">Instagram Reel</option>
                  <option value="tiktok-vertical">TikTok Vertical</option>
                  <option value="youtube-short">YouTube Short</option>
                  <option value="linkedin-promo">LinkedIn Promo</option>
                </NativeSelect>
                <NativeSelect
                  aria-label="Platform"
                  value={targetPlatform}
                  onChange={(e) => setTargetPlatform(e.target.value)}
                  className="h-7 w-36 text-xs"
                >
                  <option value="INSTAGRAM_REELS">IG Reels</option>
                  <option value="TIKTOK">TikTok</option>
                  <option value="YOUTUBE_SHORTS">YT Shorts</option>
                  <option value="LINKEDIN_VIDEO">LinkedIn</option>
                </NativeSelect>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-3 studio-scrollbar">
              {(activeConversation?.messages ?? []).length === 0 ? (
                <div className="space-y-3 py-6 text-center">
                  <p className="text-xs font-medium text-foreground">
                    Describe what you want to produce
                  </p>
                  <div className="mx-auto flex max-w-md flex-col gap-1.5">
                    {PROMPT_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => setPromptInput(starter)}
                        className="rounded-md border border-border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                activeConversation?.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs',
                      msg.role === 'USER'
                        ? 'ml-8 border-border bg-secondary text-foreground'
                        : 'mr-8 border-border bg-card text-foreground',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold uppercase">
                        {msg.agentName || msg.role}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ))
              )}

              {sseEvents.length > 0 && (
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Live Agent Stream
                  </div>
                  <div className="space-y-1">
                    {sseEvents.slice(-4).map((ev) => (
                      <div key={ev.eventId} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">{ev.stage}</Badge>
                        <span className="truncate text-muted-foreground">{ev.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border p-3">
              <form onSubmit={handleProduce} className="space-y-2">
                <Textarea
                  rows={2}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Write your creative brief..."
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={simulateDefectsOnce}
                      onCheckedChange={setSimulateDefectsOnce}
                    />
                    Test QA auto-repair loop
                  </label>
                  <Button type="submit" size="sm" disabled={producing || !promptInput.trim()}>
                    <Send className="h-3.5 w-3.5" />
                    {producing ? 'Producing...' : 'Produce'}
                  </Button>
                </div>
              </form>

              {activeWorkflow && (
                <form onSubmit={handleRevise} className="flex gap-1.5 border-t border-border pt-2">
                  <Input
                    value={revisionInput}
                    onChange={(e) => setRevisionInput(e.target.value)}
                    placeholder="Request a targeted revision (e.g., tighter hook, bolder captions)..."
                    className="h-7 text-xs"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={producing || !revisionInput.trim()}
                  >
                    <Wand2 className="h-3 w-3" />
                    Revise
                  </Button>
                </form>
              )}
            </div>
          </Card>

          <div className="lg:col-span-4">
          <StudioPreviewPane
            compiled={compiled}
            activeCompositionId={activeCompositionId}
            activeVersion={activeVersion}
            activeWorkflow={activeWorkflow}
            renderJob={renderJob}
            qaReport={qaReport}
            isSimulatedMode={isSimulatedMode}
            currentFrame={currentFrame}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onSeekFrame={setCurrentFrame}
            onUndoRedo={(dir) => void handleUndoRedo(dir)}
            onApprove={() => void handleApprove()}
          />
          </div>
        </div>
      </div>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a project to attach media and studio runs.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickCreateProject} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="studio-proj-name">Project Name</Label>
              <Input
                id="studio-proj-name"
                required
                value={quickProjectName}
                onChange={(e) => setQuickProjectName(e.target.value)}
                placeholder="Product Launch Campaign"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewProjectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingProject}>
                {creatingProject ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
