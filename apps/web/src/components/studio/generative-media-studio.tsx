'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Mic,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  NativeSelect,
  Textarea,
} from '@/components/design-system/primitives';
import { apiRequest } from '@/lib/api-client';
import type { GenerativeTaskType, ProviderAvailabilityStatus } from '@ai-content-os/shared';

interface ProviderCapabilityDto {
  providerId: string;
  displayName: string;
  supportedTasks: GenerativeTaskType[];
  models: string[];
  costModel: string;
  unitPriceUsd: number | null;
  costUnit: string;
  commercialUseNote: string;
  watermarkOrProvenance: string;
  availabilityStatus: ProviderAvailabilityStatus;
  credentialsConfigured: boolean;
}

interface GenerativeJobDto {
  id: string;
  taskType: GenerativeTaskType;
  provider: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  status: string;
  executionMode: string;
  estimatedCostUsd: number | null;
  costStatus: string;
  assetId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface VoiceConsentDto {
  id: string;
  voiceOwnerName: string;
  speakerLabel: string;
  consentScope: string;
  status: string;
  createdAt: string;
}

export interface GenerativeMediaStudioProps {
  accessToken: string | null;
  workspaceId: string | null;
  projectId: string;
  onAssetAccepted: () => Promise<void>;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}

export function GenerativeMediaStudio({
  accessToken,
  workspaceId,
  projectId,
  onAssetAccepted,
  onFeedback,
}: GenerativeMediaStudioProps) {
  const [providers, setProviders] = useState<ProviderCapabilityDto[]>([]);
  const [jobs, setJobs] = useState<GenerativeJobDto[]>([]);
  const [consents, setConsents] = useState<VoiceConsentDto[]>([]);

  const [providerId, setProviderId] = useState('local-ffmpeg-audio-studio');
  const [taskType, setTaskType] = useState<GenerativeTaskType>('TEXT_TO_IMAGE');
  const [aspectRatio, setAspectRatio] = useState<
    'PORTRAIT_9_16' | 'PORTRAIT_4_5' | 'SQUARE_1_1' | 'LANDSCAPE_16_9'
  >('PORTRAIT_9_16');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showConsentForm, setShowConsentForm] = useState(false);
  const [voiceOwnerName, setVoiceOwnerName] = useState('');
  const [speakerLabel, setSpeakerLabel] = useState('');
  const [attestationText, setAttestationText] = useState(
    'I confirm I hold explicit written consent from the voice owner for authorized workspace voice synthesis.',
  );

  const loadAll = useCallback(async () => {
    if (!accessToken || !workspaceId) return;
    try {
      const [provRes, jobsRes, consentsRes] = await Promise.all([
        apiRequest<{ providers: ProviderCapabilityDto[] }>({
          path: '/api/v1/generative/providers',
          accessToken,
          workspaceId,
        }),
        apiRequest<{ jobs: GenerativeJobDto[] }>({
          path: `/api/v1/generative/jobs${projectId ? `?projectId=${projectId}` : ''}`,
          accessToken,
          workspaceId,
        }),
        apiRequest<{ consents: VoiceConsentDto[] }>({
          path: '/api/v1/generative/voice-consents',
          accessToken,
          workspaceId,
        }),
      ]);
      setProviders(provRes.providers);
      setJobs(jobsRes.jobs);
      setConsents(consentsRes.consents);
    } catch {
      // Non-fatal
    }
  }, [accessToken, workspaceId, projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeProvider = providers.find((p) => p.providerId === providerId);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !workspaceId || !projectId || !prompt.trim()) {
      onFeedback({ type: 'error', message: 'Select a project and enter a generation prompt.' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiRequest<GenerativeJobDto>({
        method: 'POST',
        path: '/api/v1/generative/jobs',
        accessToken,
        workspaceId,
        body: {
          projectId,
          providerId,
          taskType,
          prompt: prompt.trim(),
          ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
          aspectRatio,
          quality: 'STANDARD',
        },
      });
      setPrompt('');
      await loadAll();
      onFeedback({
        type: 'success',
        message: `Generated ${created.taskType} (${created.executionMode}). Review and Accept to save to Library.`,
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Generation request failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (jobId: string, decision: 'ACCEPT' | 'REJECT') => {
    if (!accessToken || !workspaceId) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/generative/jobs/${jobId}/decision`,
        accessToken,
        workspaceId,
        body: { decision },
      });
      await loadAll();
      if (decision === 'ACCEPT') await onAssetAccepted();
      onFeedback({
        type: 'success',
        message:
          decision === 'ACCEPT'
            ? 'Saved generated asset to Media Library with full provenance.'
            : 'Rejected generated asset.',
      });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Decision update failed',
      });
    }
  };

  const handleCreateConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !workspaceId || !voiceOwnerName.trim() || !speakerLabel.trim()) return;
    try {
      await apiRequest({
        method: 'POST',
        path: '/api/v1/generative/voice-consents',
        accessToken,
        workspaceId,
        body: {
          voiceOwnerName: voiceOwnerName.trim(),
          speakerLabel: speakerLabel.trim(),
          consentScope: 'INTERNAL_PREVIEW',
          permittedUsage: 'Authorized workspace voiceover synthesis only.',
          attestationText: attestationText.trim(),
        },
      });
      setVoiceOwnerName('');
      setSpeakerLabel('');
      setShowConsentForm(false);
      await loadAll();
      onFeedback({ type: 'success', message: 'Recorded explicit Voice Consent attestation.' });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create voice consent record',
      });
    }
  };

  const handleRevokeConsent = async (consentId: string) => {
    if (!accessToken || !workspaceId) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/generative/voice-consents/${consentId}/revoke`,
        accessToken,
        workspaceId,
        body: {},
      });
      await loadAll();
      onFeedback({ type: 'success', message: 'Revoked voice consent record.' });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to revoke consent',
      });
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Generative Media &amp; Voice Studio
            </CardTitle>
            <CardDescription>
              Generate original visuals, B-roll, and voiceovers with explicit provider capability transparency, preflight cost estimates, and voice-consent governance.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowConsentForm((v) => !v)}
            >
              <Mic className="h-3.5 w-3.5" />
              Voice Consent ({consents.filter((c) => c.status === 'ACTIVE').length})
            </Button>
            <Badge variant="ai">Stage 5</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Provider Capability Strip */}
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => {
                setProviderId(p.providerId);
                if (p.supportedTasks[0] && !p.supportedTasks.includes(taskType)) {
                  setTaskType(p.supportedTasks[0]);
                }
              }}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                providerId === p.providerId
                  ? 'border-primary bg-accent text-accent-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary/40'
              }`}
            >
              <div className="font-medium">{p.displayName}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                <span>
                  {p.availabilityStatus === 'AVAILABLE_LIVE'
                    ? 'Live'
                    : p.availabilityStatus === 'LOCAL_DETERMINISTIC'
                      ? 'Local ($0.00)'
                      : 'Pending Credentials'}
                </span>
                <span>•</span>
                <span>
                  {p.unitPriceUsd === null ? 'Cost: UNKNOWN' : `Est. $${p.unitPriceUsd.toFixed(2)}`}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Generation Form */}
        <form onSubmit={handleGenerate} className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="gen-task">Asset Task</Label>
              <NativeSelect
                id="gen-task"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as GenerativeTaskType)}
              >
                {(activeProvider?.supportedTasks ?? ['TEXT_TO_IMAGE', 'VOICEOVER']).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gen-aspect">Aspect Ratio</Label>
              <NativeSelect
                id="gen-aspect"
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
            <div className="space-y-1">
              <Label htmlFor="gen-neg">Negative Prompt (Optional)</Label>
              <Input
                id="gen-neg"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, watermark, distorted text"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="gen-prompt">Creative Prompt</Label>
            <Textarea
              id="gen-prompt"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the B-roll frame, product visual, or voiceover script to generate…"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Estimated cost:{' '}
              <strong className="text-foreground">
                {activeProvider?.unitPriceUsd === null
                  ? 'UNKNOWN (verify provider plan)'
                  : `$${(activeProvider?.unitPriceUsd ?? 0).toFixed(2)} (ESTIMATED, not an exact charge)`}
              </strong>
            </span>
            <Button type="submit" size="sm" disabled={submitting || !projectId}>
              <Sparkles className="h-3.5 w-3.5" />
              {submitting ? 'Generating…' : 'Generate Asset'}
            </Button>
          </div>
        </form>

        {/* Voice Consent Governance Drawer */}
        {showConsentForm && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldAlert className="h-4 w-4 text-warning" />
              Voice Cloning Consent &amp; Ownership Attestation (Mandatory Gate)
            </div>
            <form onSubmit={handleCreateConsent} className="grid gap-2 md:grid-cols-2">
              <Input
                value={voiceOwnerName}
                onChange={(e) => setVoiceOwnerName(e.target.value)}
                placeholder="Voice Owner Full Name"
                required
              />
              <Input
                value={speakerLabel}
                onChange={(e) => setSpeakerLabel(e.target.value)}
                placeholder="Speaker Label (e.g. FOUNDER_MAIN)"
                required
              />
              <div className="md:col-span-2">
                <Input
                  value={attestationText}
                  onChange={(e) => setAttestationText(e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" size="sm">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Record Consent
                </Button>
              </div>
            </form>
            {consents.length > 0 && (
              <div className="space-y-1.5">
                {consents.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-xs"
                  >
                    <span>
                      <strong>{c.voiceOwnerName}</strong> ({c.speakerLabel}) • {c.consentScope}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={c.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {c.status}
                      </Badge>
                      {c.status === 'ACTIVE' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRevokeConsent(c.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Generated Jobs */}
        {jobs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Generative Assets ({jobs.length})
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {jobs.slice(0, 6).map((j) => (
                <div
                  key={j.id}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-foreground">{j.taskType}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant={j.executionMode === 'LIVE' ? 'success' : 'warning'}>
                          {j.executionMode}
                        </Badge>
                        <Badge variant="outline">{j.status}</Badge>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-muted-foreground">{j.prompt}</p>
                    <p className="text-muted-foreground">
                      {j.provider} • {j.model} •{' '}
                      {j.costStatus === 'UNKNOWN'
                        ? 'Cost: UNKNOWN'
                        : `Est. $${(j.estimatedCostUsd ?? 0).toFixed(2)}`}
                    </p>
                  </div>
                  {j.status === 'COMPLETED' && (
                    <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDecision(j.id, 'REJECT')}
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleDecision(j.id, 'ACCEPT')}
                      >
                        <Check className="h-3 w-3" />
                        Accept to Library
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
