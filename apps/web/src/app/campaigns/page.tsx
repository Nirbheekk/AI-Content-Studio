'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  Megaphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  Textarea,
} from '@/components/design-system/primitives';
import { useStudio } from '@/context/studio-context';
import { apiRequest, ProjectDto } from '@/lib/api-client';

interface CampaignTaskDto {
  id: string;
  nodeKey: string;
  stageName: string;
  agentRole: string;
  status: string;
  attemptCount: number;
  errorMessage: string | null;
}

interface CampaignDeliverableDto {
  id: string;
  title: string;
  platform: string;
  format: string;
  aspectRatio: string;
  hook: string;
  scriptSummary: string;
  compositionId: string | null;
  status: string;
  creativeQaScore: number | null;
}

interface CampaignDto {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  targetAudience: string;
  briefText: string;
  tone: string;
  platforms: string[];
  deliverableCount: number;
  controlMode: string;
  status: string;
  budgetCapUsd: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  planApprovedAt: string | null;
  approvedAt: string | null;
  strategyJson: {
    narrativeDirection?: string;
    messagingPillars?: Array<{ id: string; title: string; message: string }>;
  };
  clarificationsJson?: string[];
  tasks: CampaignTaskDto[];
  deliverables: CampaignDeliverableDto[];
}

export default function CampaignsPage() {
  const { accessToken, activeWorkspace, activeProjectId, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [briefText, setBriefText] = useState(
    'Create a 14-day launch campaign for our new product. We need Instagram Reels, YouTube Shorts, TikTok clips, and LinkedIn posts. Keep the tone confident, educational, and modern.',
  );
  const [deliverableCount, setDeliverableCount] = useState(4);
  const [budgetCapUsd, setBudgetCapUsd] = useState(50);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const [projList, campRes] = await Promise.all([
        apiRequest<ProjectDto[]>({
          path: '/api/v1/projects',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<{ campaigns: CampaignDto[] }>({
          path: '/api/v1/campaigns',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);
      setProjects(projList);
      setCampaigns(campRes.campaigns);
      if (!projectId) {
        const preferred =
          (activeProjectId && projList.some((p) => p.id === activeProjectId) ? activeProjectId : null) ??
          projList[0]?.id ??
          '';
        if (preferred) setProjectId(preferred);
      }
      if (!selectedId && campRes.campaigns[0]) {
        setSelectedId(campRes.campaigns[0].id);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load campaigns',
      });
    }
  }, [accessToken, activeWorkspace, activeProjectId, projectId, selectedId, setFeedback]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeCampaign = campaigns.find((c) => c.id === selectedId) ?? campaigns[0] ?? null;

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !projectId || !briefText.trim()) return;
    setBusy(true);
    try {
      const created = await apiRequest<CampaignDto>({
        method: 'POST',
        path: '/api/v1/campaigns',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId,
          briefText: briefText.trim(),
          deliverableCount,
          budgetCapUsd,
          controlMode: 'PRODUCE_UNTIL_APPROVAL',
        },
      });
      setSelectedId(created.id);
      await loadData();
      setFeedback({
        type: 'success',
        message: `Planned "${created.name}" (${created.deliverables.length} deliverables). Review & approve plan to produce.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Campaign planning failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApprovePlan = async (campaignId: string) => {
    if (!accessToken || !activeWorkspace) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/campaigns/${campaignId}/approve-plan`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      await loadData();
      setFeedback({ type: 'success', message: 'Campaign plan approved. Ready to execute production DAG.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to approve plan',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProduce = async (campaignId: string) => {
    if (!accessToken || !activeWorkspace) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/campaigns/${campaignId}/produce`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      await loadData();
      setFeedback({
        type: 'success',
        message: 'Production DAG completed. Deliverables are awaiting human approval.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Campaign production failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRetryTask = async (campaignId: string, taskId: string) => {
    if (!accessToken || !activeWorkspace) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/campaigns/${campaignId}/tasks/${taskId}/retry`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      await loadData();
      setFeedback({ type: 'success', message: 'Retried DAG task successfully.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Task retry failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeliverableDecision = async (
    campaignId: string,
    deliverableId: string,
    decision: 'APPROVED' | 'CHANGES_REQUESTED',
  ) => {
    if (!accessToken || !activeWorkspace) return;
    setBusy(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/campaigns/${campaignId}/deliverables/${deliverableId}/decision`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { decision },
      });
      await loadData();
      setFeedback({
        type: 'success',
        message:
          decision === 'APPROVED'
            ? 'Deliverable approved.'
            : 'Marked deliverable as Changes Requested.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Decision update failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="Autonomous Creative Campaigns"
          description="Describe a multi-platform campaign in natural language, approve its strategy & budget, execute the durable production DAG, and review every deliverable."
        />

        <div className="grid gap-5 lg:grid-cols-12">
          {/* Left: Campaign Brief Creator + Campaign List */}
          <div className="space-y-4 lg:col-span-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  New Campaign Brief
                </CardTitle>
                <CardDescription>
                  AI plans strategy, content matrix, and cost before any production runs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateCampaign} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="camp-project">Project</Label>
                    <NativeSelect
                      id="camp-project"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="camp-brief">Natural-Language Brief</Label>
                    <Textarea
                      id="camp-brief"
                      rows={4}
                      value={briefText}
                      onChange={(e) => setBriefText(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="camp-count">Deliverables</Label>
                      <Input
                        id="camp-count"
                        type="number"
                        min={1}
                        max={12}
                        value={deliverableCount}
                        onChange={(e) => setDeliverableCount(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="camp-budget">Budget Cap ($)</Label>
                      <Input
                        id="camp-budget"
                        type="number"
                        min={1}
                        max={10000}
                        value={budgetCapUsd}
                        onChange={(e) => setBudgetCapUsd(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy || !projectId}>
                    <Megaphone className="h-4 w-4" />
                    {busy ? 'Planning Campaign…' : 'Generate Campaign Plan'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Workspace Campaigns ({campaigns.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {campaigns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No campaigns yet.</p>
                ) : (
                  campaigns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full rounded-xl border p-3 text-left text-xs transition-colors ${
                        activeCampaign?.id === c.id
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'border-border bg-card text-foreground hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span className="truncate">{c.name}</span>
                        <Badge variant="outline">{c.status}</Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground tabular-nums">
                        {c.deliverables.length} deliverables • Est. ${c.estimatedCostUsd.toFixed(2)} / ${c.budgetCapUsd}
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Active Campaign Workspace */}
          <div className="space-y-4 lg:col-span-8">
            {!activeCampaign ? (
              <Empty
                icon={<Megaphone className="h-5 w-5 text-primary" />}
                title="No campaign selected"
                description="Describe a launch or content campaign on the left to build a multi-platform strategy and durable production DAG."
              />
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{activeCampaign.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {activeCampaign.strategyJson?.narrativeDirection ?? activeCampaign.objective}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="ai">{activeCampaign.status}</Badge>
                        {activeCampaign.status === 'AWAITING_PLAN_APPROVAL' && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleApprovePlan(activeCampaign.id)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Approve Strategy &amp; Budget
                          </Button>
                        )}
                        {activeCampaign.status === 'PRODUCING' && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleProduce(activeCampaign.id)}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Run Production DAG
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(activeCampaign.strategyJson?.messagingPillars ?? []).map((p) => (
                        <div key={p.id} className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
                          <div className="font-semibold text-foreground">{p.title}</div>
                          <p className="mt-1 text-muted-foreground">{p.message}</p>
                        </div>
                      ))}
                    </div>

                    {/* Production DAG Task Graph */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Production DAG ({activeCampaign.tasks.filter((t) => t.status === 'COMPLETED').length}/
                        {activeCampaign.tasks.length} nodes complete)
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {activeCampaign.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
                          >
                            <div>
                              <div className="font-medium text-foreground">{task.stageName}</div>
                              <div className="text-muted-foreground">{task.agentRole}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  task.status === 'COMPLETED'
                                    ? 'success'
                                    : task.status === 'FAILED'
                                      ? 'destructive'
                                      : 'secondary'
                                }
                              >
                                {task.status}
                              </Badge>
                              {task.status === 'FAILED' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleRetryTask(activeCampaign.id, task.id)}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Deliverable Gallery & Human Approval Gate */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Campaign Deliverables ({activeCampaign.deliverables.length})
                    </CardTitle>
                    <CardDescription>
                      Every deliverable requires explicit human approval before scheduling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {activeCampaign.deliverables.map((d) => (
                      <div
                        key={d.id}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-3.5 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">{d.title}</span>
                            <Badge variant={d.status === 'APPROVED' ? 'success' : 'outline'}>
                              {d.status}
                            </Badge>
                          </div>
                          <p className="font-medium text-primary">{d.hook}</p>
                          <p className="text-muted-foreground">{d.scriptSummary}</p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <Badge variant="secondary">{d.platform}</Badge>
                            <Badge variant="secondary">{d.aspectRatio}</Badge>
                            {d.creativeQaScore !== null && (
                              <Badge variant="info">Creative QA {d.creativeQaScore}</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                          {d.compositionId ? (
                            <Link
                              href={`/editor?compositionId=${d.compositionId}`}
                              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            >
                              Open in Editor
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Pending composition build</span>
                          )}
                          {d.status !== 'APPROVED' && d.compositionId && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void handleDeliverableDecision(
                                    activeCampaign.id,
                                    d.id,
                                    'CHANGES_REQUESTED',
                                  )
                                }
                              >
                                Revise
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void handleDeliverableDecision(
                                    activeCampaign.id,
                                    d.id,
                                    'APPROVED',
                                  )
                                }
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Approve
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
