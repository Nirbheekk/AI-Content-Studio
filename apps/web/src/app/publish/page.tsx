'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  Select,
  Textarea,
  WorkflowStepper,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest } from '../../lib/api-client';

interface PlatformCapability {
  platform: string;
  displayName: string;
  supportedContentTypes: string[];
  allowedAspectRatios: string[];
  maxCaptionLength: number;
  maxTitleLength?: number;
  maxHashtags: number;
  maxVideoDurationSec: number;
  requiresTitle: boolean;
  requiresMedia: boolean;
  requiredOAuthScopes: string[];
}

interface SocialAccountView {
  id: string;
  platform: string;
  accountName: string;
  accountHandle: string;
  externalAccountId: string;
  tokenPreview: string;
  tokenExpiresAt: string | null;
  isTokenExpired: boolean;
  scopes: string[];
  status: string;
  connectionError: string | null;
  lastHealthCheckAt: string | null;
  capabilities: PlatformCapability;
}

interface PublishAttemptView {
  id: string;
  attemptNumber: number;
  status: string;
  httpStatus: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  isSimulated: boolean;
  attemptedAt: string;
}

interface PublishPostView {
  id: string;
  socialAccountId: string;
  socialAccount: SocialAccountView;
  platform: string;
  contentType: 'VIDEO' | 'IMAGE' | 'WRITTEN';
  title: string | null;
  captionText: string;
  hashtags: string[];
  status: string;
  providerStatus: string;
  scheduledFor: string | null;
  timezone: string;
  localScheduledLabel: string | null;
  publishedAt: string | null;
  localEffectiveLabel: string;
  externalPostId: string | null;
  externalPostUrl: string | null;
  idempotencyKey: string;
  errorMessage: string | null;
  isSimulated: boolean;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  attempts: PublishAttemptView[];
}

interface DashboardPayload {
  provider: string;
  isSimulatedProvider: boolean;
  supportedTimezones: string[];
  capabilities: Record<string, PlatformCapability>;
  accounts: SocialAccountView[];
  compositions: Array<{
    id: string;
    title: string;
    aspectRatio: string;
    approvalStatus: string;
    approvedByUserId: string | null;
    approvedAt: string | null;
    latestRenderJobId: string | null;
  }>;
  readyAssets: Array<{
    id: string;
    name: string;
    assetType: string;
    mimeType: string;
  }>;
  upcomingScheduled: PublishPostView[];
  publishingQueue: PublishPostView[];
  recentlyPublished: PublishPostView[];
  failedJobs: PublishPostView[];
  stats: {
    connectedAccounts: number;
    totalAccounts: number;
    scheduledCount: number;
    publishingCount: number;
    publishedCount: number;
    failedCount: number;
    deadLetterCount: number;
  };
}

const PLATFORMS = [
  'INSTAGRAM_REELS',
  'TIKTOK',
  'YOUTUBE_SHORTS',
  'YOUTUBE_LONG',
  'LINKEDIN',
  'X_TWITTER',
  'FACEBOOK',
] as const;

export default function PublishCenterPage() {
  const { activeWorkspace, accessToken, setFeedback } = useStudio();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // OAuth Connection Modal State
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthPlatform, setOauthPlatform] = useState<string>('INSTAGRAM_REELS');
  const [oauthAccountName, setOauthAccountName] = useState('Studio Official');
  const [oauthAccountHandle, setOauthAccountHandle] = useState('@studio_official');
  const [oauthAuthorizationUrl, setOauthAuthorizationUrl] = useState<string | null>(null);
  const [oauthScopes, setOauthScopes] = useState<string[]>([]);
  const [connectingOAuth, setConnectingOAuth] = useState(false);

  // Post Composer State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [contentType, setContentType] = useState<'VIDEO' | 'IMAGE' | 'WRITTEN'>('VIDEO');
  const [selectedCompositionId, setSelectedCompositionId] = useState<string>('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [publishMode, setPublishMode] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [scheduledDateTime, setScheduledDateTime] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [timezone, setTimezone] = useState('UTC');
  const [explicitApprovalConfirmed, setExplicitApprovalConfirmed] = useState(true);
  const [submittingPost, setSubmittingPost] = useState(false);

  // Active Queue Tab
  const [activeTab, setActiveTab] = useState<'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'QUEUE'>(
    'SCHEDULED',
  );

  const loadDashboard = useCallback(async () => {
    if (!activeWorkspace || !accessToken) return;
    setLoading(true);
    try {
      const data = await apiRequest<DashboardPayload>('/api/v1/publishing/dashboard', {
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setDashboard(data);
      if (!selectedAccountId && data.accounts[0]) {
        setSelectedAccountId(data.accounts[0].id);
      }
      if (!selectedCompositionId && data.compositions[0]) {
        setSelectedCompositionId(data.compositions[0].id);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load publishing dashboard',
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, accessToken, selectedAccountId, selectedCompositionId, setFeedback]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleGenerateOAuthUrl = async (platform: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      const res = await apiRequest<{
        authorizationUrl: string;
        requiredScopes: string[];
      }>('/api/v1/publishing/accounts/oauth-url', {
        method: 'POST',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { platform },
      });
      setOauthAuthorizationUrl(res.authorizationUrl);
      setOauthScopes(res.requiredScopes);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to initialize OAuth URL',
      });
    }
  };

  const handleCompleteOAuthConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !accessToken) return;
    setConnectingOAuth(true);
    try {
      const res = await apiRequest<{ account: SocialAccountView }>(
        '/api/v1/publishing/accounts/connect',
        {
          method: 'POST',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {
            platform: oauthPlatform,
            code: `oauth_code_${Date.now()}`,
            accountName: oauthAccountName.trim(),
            accountHandle: oauthAccountHandle.trim(),
          },
        },
      );
      setSelectedAccountId(res.account.id);
      setShowOAuthModal(false);
      setOauthAuthorizationUrl(null);
      setFeedback({
        type: 'success',
        message: `Connected ${res.account.accountHandle} (${res.account.platform}) with AES-256-GCM encrypted credentials.`,
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to connect social account',
      });
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleHealthCheck = async (accountId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      const res = await apiRequest<{
        health: { healthy: boolean; status: string; message: string };
      }>(`/api/v1/publishing/accounts/${accountId}/health-check`, {
        method: 'POST',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      setFeedback({
        type: res.health.healthy ? 'success' : 'error',
        message: `Health check (${res.health.status}): ${res.health.message}`,
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Health check failed',
      });
    }
  };

  const handleRefreshToken = async (accountId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      await apiRequest(`/api/v1/publishing/accounts/${accountId}/refresh`, {
        method: 'POST',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      setFeedback({
        type: 'success',
        message: 'OAuth access & refresh tokens rotated and re-encrypted successfully.',
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Token refresh failed',
      });
    }
  };

  const handleDisconnectAccount = async (accountId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      await apiRequest(`/api/v1/publishing/accounts/${accountId}`, {
        method: 'DELETE',
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setFeedback({
        type: 'success',
        message: 'Social account disconnected.',
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to disconnect account',
      });
    }
  };

  const selectedAccount = dashboard?.accounts.find((a) => a.id === selectedAccountId) ?? null;
  const activeCap = selectedAccount?.capabilities ?? null;
  const parsedHashtags = hashtagsText
    .split(',')
    .map((h) => h.replace(/^#/, '').trim())
    .filter(Boolean);

  const handleCreateOrPublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !accessToken || !selectedAccountId) return;
    setSubmittingPost(true);
    try {
      const scheduledIso =
        publishMode === 'SCHEDULED' ? new Date(scheduledDateTime).toISOString() : undefined;

      const res = await apiRequest<{ post: PublishPostView; deduplicated: boolean }>(
        '/api/v1/publishing/posts',
        {
          method: 'POST',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {
            socialAccountId: selectedAccountId,
            contentType,
            ...(contentType !== 'WRITTEN' && selectedCompositionId
              ? { compositionId: selectedCompositionId }
              : {}),
            ...(contentType !== 'WRITTEN' && !selectedCompositionId && selectedAssetId
              ? { assetId: selectedAssetId }
              : {}),
            ...(title.trim() ? { title: title.trim() } : {}),
            captionText: captionText.trim(),
            hashtags: parsedHashtags,
            ...(scheduledIso ? { scheduledFor: scheduledIso } : {}),
            timezone,
            publishImmediately: publishMode === 'IMMEDIATE',
            explicitApprovalConfirmed,
          },
        },
      );

      setFeedback({
        type: 'success',
        message:
          res.post.status === 'PUBLISHED'
            ? `Confirmed PUBLISHED on ${res.post.platform} (${res.post.externalPostId})`
            : res.post.status === 'SCHEDULED'
              ? `Scheduled for ${res.post.localScheduledLabel} (${res.post.timezone})`
              : `Post status: ${res.post.status} (${res.post.providerStatus})`,
      });
      setCaptionText('');
      setTitle('');
      if (res.post.status === 'PUBLISHED') setActiveTab('PUBLISHED');
      else if (res.post.status === 'SCHEDULED') setActiveTab('SCHEDULED');
      else if (res.post.status === 'FAILED') setActiveTab('FAILED');
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to publish/schedule post',
      });
    } finally {
      setSubmittingPost(false);
    }
  };

  const handlePublishNow = async (postId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      const res = await apiRequest<{ post: PublishPostView }>(
        `/api/v1/publishing/posts/${postId}/publish`,
        {
          method: 'POST',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {},
        },
      );
      setFeedback({
        type: res.post.status === 'PUBLISHED' ? 'success' : 'error',
        message:
          res.post.status === 'PUBLISHED'
            ? `Post confirmed PUBLISHED (${res.post.externalPostId})`
            : `Publish result: ${res.post.status} — ${res.post.errorMessage ?? ''}`,
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Immediate publish failed',
      });
    }
  };

  const handleRetryFailedPost = async (postId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      const res = await apiRequest<{ post: PublishPostView }>(
        `/api/v1/publishing/posts/${postId}/retry`,
        {
          method: 'POST',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: { clearSimulationFaults: true },
        },
      );
      setFeedback({
        type: res.post.status === 'PUBLISHED' ? 'success' : 'error',
        message:
          res.post.status === 'PUBLISHED'
            ? `Recovery succeeded! Post confirmed PUBLISHED (${res.post.externalPostId}).`
            : `Retry status: ${res.post.status} (${res.post.errorMessage ?? 'pending'})`,
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Retry failed',
      });
    }
  };

  const handleCancelPost = async (postId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      await apiRequest(`/api/v1/publishing/posts/${postId}/cancel`, {
        method: 'POST',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      setFeedback({
        type: 'success',
        message: 'Scheduled post cancelled and removed from queue.',
      });
      await loadDashboard();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Cancel failed',
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Social Publishing Center"
          description="Connect OAuth accounts, validate platform capabilities, enforce human approval, and schedule or publish campaigns."
          badge={
            dashboard?.isSimulatedProvider ? (
              <Badge variant="warning">[SIMULATED POSTIZ SANDBOX]</Badge>
            ) : (
              <Badge variant="success">Live Postiz Provider</Badge>
            )
          }
          actions={
            <>
              <Link
                href="/calendar"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Open Interactive Calendar
              </Link>
              <Button
                size="sm"
                onClick={() => {
                  setShowOAuthModal(true);
                  void handleGenerateOAuthUrl(oauthPlatform);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Connect Social Account (OAuth)
              </Button>
            </>
          }
        />

        <WorkflowStepper activeStep="publish" />

        {/* KPI Summary Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-5">
            <MetricCard
              label="Connected Accounts"
              value={`${dashboard.stats.connectedAccounts} / ${dashboard.stats.totalAccounts}`}
              sublabel="AES-256-GCM encrypted"
              icon={<Link2 className="h-4 w-4" />}
            />
            <MetricCard
              label="Upcoming Scheduled"
              value={dashboard.stats.scheduledCount}
              tone="ai"
              sublabel="Queued in calendar"
              icon={<Clock className="h-4 w-4" />}
            />
            <MetricCard
              label="In-Flight Queue"
              value={dashboard.stats.publishingCount}
              sublabel="Active workers"
              icon={<Send className="h-4 w-4" />}
            />
            <MetricCard
              label="Confirmed Published"
              value={dashboard.stats.publishedCount}
              tone="success"
              sublabel={dashboard.isSimulatedProvider ? 'Sandbox deliveries' : 'Live deliveries'}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <MetricCard
              label="Failed / Recovery"
              value={`${dashboard.stats.failedCount} (${dashboard.stats.deadLetterCount} DLQ)`}
              tone={dashboard.stats.failedCount > 0 ? 'warning' : 'default'}
              sublabel="Backoff retry queue"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Connected Social Accounts & Health */}
          <div className="space-y-4 lg:col-span-5">
            <Card className="p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-foreground">Connected Social Accounts</h2>
                <Badge variant="outline">AES-256-GCM Encrypted</Badge>
              </div>

              {loading && !dashboard ? (
                <p className="mt-4 text-xs text-muted-foreground">Loading accounts...</p>
              ) : !dashboard || dashboard.accounts.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<Link2 className="h-5 w-5 text-primary" />}
                    title="No social accounts connected yet"
                    description="Connect an Instagram, TikTok, YouTube, LinkedIn, X, or Facebook account via OAuth to enable scheduling and publishing."
                    action={
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowOAuthModal(true);
                          void handleGenerateOAuthUrl(oauthPlatform);
                        }}
                      >
                        Connect First Social Account
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {dashboard.accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        selectedAccountId === acc.id
                          ? 'border-primary bg-ai-surface/60'
                          : 'border-border bg-secondary/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="ai">{acc.platform}</Badge>
                            <Badge
                              variant={
                                acc.status === 'CONNECTED'
                                  ? 'success'
                                  : acc.status === 'EXPIRED'
                                    ? 'warning'
                                    : 'destructive'
                              }
                            >
                              {acc.status === 'CONNECTED' && (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              {acc.status}
                            </Badge>
                          </div>
                          <div className="mt-1.5 text-sm font-semibold text-foreground">
                            {acc.accountName}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({acc.accountHandle})
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            Token: <code className="font-mono">{acc.tokenPreview}</code> • Scopes:{' '}
                            {acc.scopes.length}
                          </div>
                          {acc.connectionError && (
                            <div className="mt-1 text-xs font-medium text-destructive">
                              Error: {acc.connectionError}
                            </div>
                          )}
                        </div>
                        <Button
                          variant={selectedAccountId === acc.id ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedAccountId(acc.id)}
                        >
                          {selectedAccountId === acc.id ? 'Selected' : 'Select'}
                        </Button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleHealthCheck(acc.id)}
                        >
                          Check Health
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRefreshToken(acc.id)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Rotate Token
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDisconnectAccount(acc.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column: Post Composer */}
          <div className="lg:col-span-7">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Multi-Platform Post Composer &amp; Scheduler
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Validates platform media requirements, aspect ratios, caption limits, and human
                    approval gate.
                  </p>
                </div>
                {dashboard?.isSimulatedProvider && (
                  <Badge variant="warning">Sandbox Mode — No Live Public Post</Badge>
                )}
              </div>

              {dashboard && dashboard.accounts.length === 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/35 bg-warning-surface px-3.5 py-2.5 text-xs text-warning">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>
                      Connect at least one social account on the left before submitting a post.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowOAuthModal(true);
                      void handleGenerateOAuthUrl(oauthPlatform);
                    }}
                  >
                    Connect Account
                  </Button>
                </div>
              )}

              <form onSubmit={handleCreateOrPublishPost} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                      Target Connected Account
                    </label>
                    <Select
                      aria-label="Target Connected Account"
                      required
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                      <option value="">-- Select Connected Account --</option>
                      {dashboard?.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.platform} — {acc.accountHandle} ({acc.status})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                      Content Type
                    </label>
                    <Select
                      aria-label="Content Type"
                      value={contentType}
                      onChange={(e) =>
                        setContentType(e.target.value as 'VIDEO' | 'IMAGE' | 'WRITTEN')
                      }
                    >
                      <option value="VIDEO">VIDEO (Rendered Composition / Video Asset)</option>
                      <option value="IMAGE">IMAGE (Graphic / Frame Asset)</option>
                      <option value="WRITTEN">WRITTEN (Text Post / Thread)</option>
                    </Select>
                  </div>
                </div>

                {/* Platform Capability Guidance Banner */}
                {activeCap && (
                  <div className="rounded-xl border border-primary/30 bg-ai-surface p-3 text-xs text-foreground">
                    <div className="font-semibold text-primary">
                      {activeCap.displayName} Capabilities:
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Allowed Types:{' '}
                      <strong className="text-foreground">
                        {activeCap.supportedContentTypes.join(', ')}
                      </strong>{' '}
                      • Aspect Ratios:{' '}
                      <strong className="text-foreground">
                        {activeCap.allowedAspectRatios.join(', ')}
                      </strong>{' '}
                      • Max Caption:{' '}
                      <strong className="text-foreground">
                        {activeCap.maxCaptionLength} chars
                      </strong>{' '}
                      • Max Hashtags:{' '}
                      <strong className="text-foreground">{activeCap.maxHashtags}</strong>
                      {activeCap.requiresTitle ? ' • Requires Video Title' : ''}
                    </div>
                  </div>
                )}

                {contentType !== 'WRITTEN' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Attach Approved Composition
                      </label>
                      <Select
                        aria-label="Attach Approved Composition"
                        value={selectedCompositionId}
                        onChange={(e) => {
                          setSelectedCompositionId(e.target.value);
                          if (e.target.value) setSelectedAssetId('');
                        }}
                      >
                        <option value="">-- Optional: Select Composition --</option>
                        {dashboard?.compositions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} ({c.aspectRatio}) [{c.approvalStatus}]
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Or Attach Library Asset
                      </label>
                      <Select
                        aria-label="Or Attach Library Asset"
                        value={selectedAssetId}
                        onChange={(e) => {
                          setSelectedAssetId(e.target.value);
                          if (e.target.value) setSelectedCompositionId('');
                        }}
                      >
                        <option value="">-- Optional: Select Library Asset --</option>
                        {dashboard?.readyAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.assetType})
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Post / Video Title{' '}
                    {activeCap?.requiresTitle ? '(Required for Platform)' : '(Optional)'}
                  </label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="How AI Agents Automate Creative Video Production"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-foreground">
                      Caption / Post Body
                    </label>
                    <span
                      className={`text-xs tabular-nums ${
                        activeCap && captionText.length > activeCap.maxCaptionLength
                          ? 'font-bold text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {captionText.length} / {activeCap?.maxCaptionLength ?? 2200} chars
                    </span>
                  </div>
                  <Textarea
                    required
                    rows={3}
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    placeholder="Write your platform-tailored caption..."
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-foreground">
                      Hashtags (comma-separated)
                    </label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {parsedHashtags.length} / {activeCap?.maxHashtags ?? 30} tags
                    </span>
                  </div>
                  <Input
                    type="text"
                    value={hashtagsText}
                    onChange={(e) => setHashtagsText(e.target.value)}
                    placeholder="ai, videoediting, saas, contentcreator"
                  />
                </div>

                {/* Scheduling & Timezone Controls */}
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-secondary/35 p-3.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                      Delivery Mode
                    </label>
                    <Select
                      aria-label="Delivery Mode"
                      value={publishMode}
                      onChange={(e) =>
                        setPublishMode(e.target.value as 'IMMEDIATE' | 'SCHEDULED')
                      }
                    >
                      <option value="IMMEDIATE">Publish Immediately</option>
                      <option value="SCHEDULED">Schedule for Date &amp; Time</option>
                    </Select>
                  </div>

                  {publishMode === 'SCHEDULED' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Scheduled Date &amp; Time
                      </label>
                      <Input
                        type="datetime-local"
                        value={scheduledDateTime}
                        onChange={(e) => setScheduledDateTime(e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                      Target Timezone
                    </label>
                    <Select
                      aria-label="Target Timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      {(dashboard?.supportedTimezones ?? ['UTC']).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Human Approval Gate Checkbox */}
                <label className="flex items-center gap-2.5 rounded-xl border border-success/35 bg-success-surface px-3.5 py-2.5 text-xs text-success">
                  <input
                    type="checkbox"
                    checked={explicitApprovalConfirmed}
                    onChange={(e) => setExplicitApprovalConfirmed(e.target.checked)}
                    className="rounded border-input"
                  />
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Human Approval Gate:</strong> I explicitly approve this content and
                    authorize publication to the selected social account.
                  </span>
                </label>

                <Button
                  type="submit"
                  disabled={submittingPost || !selectedAccountId}
                  className="w-full"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submittingPost
                    ? 'Validating & Submitting...'
                    : publishMode === 'IMMEDIATE'
                      ? 'Approve & Publish Immediately'
                      : 'Approve & Schedule Post'}
                </Button>
              </form>
            </Card>
          </div>
        </div>

        {/* Bottom Section: Queues, History & Recovery */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeTab === 'SCHEDULED' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('SCHEDULED')}
              >
                <Clock className="h-3.5 w-3.5" />
                Upcoming Scheduled ({dashboard?.upcomingScheduled.length ?? 0})
              </Button>
              <Button
                variant={activeTab === 'PUBLISHED' ? 'success' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('PUBLISHED')}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirmed Published ({dashboard?.recentlyPublished.length ?? 0})
              </Button>
              <Button
                variant={activeTab === 'FAILED' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('FAILED')}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Failed &amp; Recovery ({dashboard?.failedJobs.length ?? 0})
              </Button>
              <Button
                variant={activeTab === 'QUEUE' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('QUEUE')}
              >
                <Send className="h-3.5 w-3.5" />
                In-Flight Queue ({dashboard?.publishingQueue.length ?? 0})
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {activeTab === 'SCHEDULED' &&
              (dashboard?.upcomingScheduled.length ? (
                dashboard.upcomingScheduled.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-secondary/35 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="ai">
                          <Clock className="h-3 w-3" />
                          SCHEDULED
                        </Badge>
                        <Badge variant="default">{post.platform}</Badge>
                        <span className="text-xs font-medium text-foreground">
                          {post.socialAccount.accountHandle}
                        </span>
                        <Badge variant="outline">{post.contentType}</Badge>
                        <span className="text-xs font-medium text-primary tabular-nums">
                          {post.localScheduledLabel} ({post.timezone})
                        </span>
                      </div>
                      {post.title && (
                        <div className="text-xs font-semibold text-foreground">{post.title}</div>
                      )}
                      <p className="text-xs text-foreground">{post.captionText}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => void handlePublishNow(post.id)}
                      >
                        Publish Now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCancelPost(post.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No upcoming scheduled posts.</p>
              ))}

            {activeTab === 'PUBLISHED' &&
              (dashboard?.recentlyPublished.length ? (
                dashboard.recentlyPublished.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-secondary/35 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" />
                          CONFIRMED PUBLISHED
                        </Badge>
                        <Badge variant="ai">{post.platform}</Badge>
                        <span className="text-xs font-medium text-foreground">
                          {post.socialAccount.accountHandle}
                        </span>
                        {post.isSimulated && (
                          <Badge variant="warning">[SIMULATED SANDBOX]</Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground">{post.captionText}</p>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        External ID: <code className="font-mono">{post.externalPostId}</code> •
                        Published: {post.localEffectiveLabel} ({post.timezone}) • Idempotency:{' '}
                        <code className="font-mono">{post.idempotencyKey.slice(0, 16)}...</code>
                      </div>
                    </div>
                    {post.externalPostUrl && (
                      <a
                        href={post.externalPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-primary hover:bg-secondary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Post Reference
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No published posts yet.</p>
              ))}

            {activeTab === 'FAILED' &&
              (dashboard?.failedJobs.length ? (
                dashboard.failedJobs.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/35 bg-destructive/5 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {post.providerStatus}
                        </Badge>
                        <Badge variant="ai">{post.platform}</Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Retries: {post.retryCount} / {post.maxRetries}
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{post.captionText}</p>
                      <div className="text-xs font-medium text-destructive">
                        Error: {post.errorMessage}
                      </div>
                      {post.nextRetryAt && (
                        <div className="text-xs text-warning">
                          Next Backoff Retry: {post.nextRetryAt}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleRetryFailedPost(post.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry &amp; Recover Now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCancelPost(post.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No failed publishing jobs.</p>
              ))}

            {activeTab === 'QUEUE' &&
              (dashboard?.publishingQueue.length ? (
                dashboard.publishingQueue.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/35 p-4"
                  >
                    <div>
                      <Badge variant="info">
                        {post.status} ({post.providerStatus})
                      </Badge>
                      <p className="mt-1 text-xs text-foreground">{post.captionText}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No in-flight publishing jobs.</p>
              ))}
          </div>
        </Card>
      </div>

      {/* OAuth Connection Modal */}
      {showOAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oauth-connect-title"
        >
          <Card className="w-full max-w-lg p-6 shadow-xl">
            <h2 id="oauth-connect-title" className="text-lg font-semibold text-foreground">
              Connect Social Account via OAuth
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tokens are encrypted at rest with AES-256-GCM and scoped strictly to this workspace.
            </p>

            <form onSubmit={handleCompleteOAuthConnect} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Social Platform
                </label>
                <Select
                  aria-label="Social Platform"
                  value={oauthPlatform}
                  onChange={(e) => {
                    setOauthPlatform(e.target.value);
                    void handleGenerateOAuthUrl(e.target.value);
                  }}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>

              {oauthAuthorizationUrl && (
                <div className="rounded-xl border border-border bg-secondary/35 p-3 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">
                    Required OAuth Scopes: {oauthScopes.join(', ')}
                  </div>
                  <div className="mt-1 truncate">Endpoint: {oauthAuthorizationUrl}</div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Account Name
                </label>
                <Input
                  type="text"
                  required
                  value={oauthAccountName}
                  onChange={(e) => setOauthAccountName(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Account Handle
                </label>
                <Input
                  type="text"
                  required
                  value={oauthAccountHandle}
                  onChange={(e) => setOauthAccountHandle(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowOAuthModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={connectingOAuth}>
                  {connectingOAuth ? 'Exchanging OAuth Code...' : 'Authorize & Connect Account'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
