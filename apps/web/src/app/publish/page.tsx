'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
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
  const [hashtagsText, setHashtagsText] = useState('ai, contentstudio, remotion');
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
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Social Publishing Center</h1>
              {dashboard?.isSimulatedProvider && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                  [SIMULATED POSTIZ SANDBOX]
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Connect OAuth accounts, validate platform capabilities, enforce human approval, and
              manage scheduled or immediate social campaigns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/calendar"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Open Interactive Calendar
            </Link>
            <button
              type="button"
              onClick={() => {
                setShowOAuthModal(true);
                void handleGenerateOAuthUrl(oauthPlatform);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              + Connect Social Account (OAuth)
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="text-[11px] text-zinc-400">Connected Accounts</div>
              <div className="mt-1 text-xl font-bold text-white">
                {dashboard.stats.connectedAccounts} / {dashboard.stats.totalAccounts}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="text-[11px] text-zinc-400">Upcoming Scheduled</div>
              <div className="mt-1 text-xl font-bold text-indigo-400">
                {dashboard.stats.scheduledCount}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="text-[11px] text-zinc-400">In-Flight Queue</div>
              <div className="mt-1 text-xl font-bold text-cyan-400">
                {dashboard.stats.publishingCount}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="text-[11px] text-zinc-400">Confirmed Published</div>
              <div className="mt-1 text-xl font-bold text-emerald-400">
                {dashboard.stats.publishedCount}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="text-[11px] text-zinc-400">Failed / Dead-Letter</div>
              <div className="mt-1 text-xl font-bold text-red-400">
                {dashboard.stats.failedCount} ({dashboard.stats.deadLetterCount} DLQ)
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Connected Social Accounts & Health */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Connected Social Accounts</h2>
                <span className="text-[11px] text-zinc-400">AES-256-GCM Encrypted</span>
              </div>

              {loading && !dashboard ? (
                <p className="mt-4 text-xs text-zinc-500">Loading accounts...</p>
              ) : !dashboard || dashboard.accounts.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-zinc-800 p-6 text-center">
                  <p className="text-xs text-zinc-400">
                    No social accounts connected to this workspace yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOAuthModal(true);
                      void handleGenerateOAuthUrl(oauthPlatform);
                    }}
                    className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Connect First Social Account
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {dashboard.accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className={`rounded-lg border p-3.5 transition ${
                        selectedAccountId === acc.id
                          ? 'border-indigo-500 bg-indigo-950/20'
                          : 'border-zinc-800 bg-zinc-950/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                              {acc.platform}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                acc.status === 'CONNECTED'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : acc.status === 'EXPIRED'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-red-500/20 text-red-300'
                              }`}
                            >
                              {acc.status}
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-semibold text-white">
                            {acc.accountName}{' '}
                            <span className="text-xs font-normal text-zinc-400">
                              ({acc.accountHandle})
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            Token: <code className="text-zinc-400">{acc.tokenPreview}</code> •
                            Scopes: {acc.scopes.length}
                          </div>
                          {acc.connectionError && (
                            <div className="mt-1 text-[11px] text-red-400">
                              Error: {acc.connectionError}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedAccountId(acc.id)}
                          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          {selectedAccountId === acc.id ? 'Selected' : 'Select'}
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800/80 pt-2.5">
                        <button
                          type="button"
                          onClick={() => void handleHealthCheck(acc.id)}
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          Check Health
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRefreshToken(acc.id)}
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-indigo-300 hover:bg-zinc-800"
                        >
                          Rotate Token
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDisconnectAccount(acc.id)}
                          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Post Composer */}
          <div className="lg:col-span-7">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-semibold text-white">
                Multi-Platform Post Composer &amp; Scheduler
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Validates platform media requirements, aspect ratios, caption limits, and human
                approval gate before publishing.
              </p>

              <form onSubmit={handleCreateOrPublishPost} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300">
                      Target Connected Account
                    </label>
                    <select
                      aria-label="Target Connected Account"
                      required
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                    >
                      <option value="">-- Select Connected Account --</option>
                      {dashboard?.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.platform} — {acc.accountHandle} ({acc.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300">Content Type</label>
                    <select
                      aria-label="Content Type"
                      value={contentType}
                      onChange={(e) =>
                        setContentType(e.target.value as 'VIDEO' | 'IMAGE' | 'WRITTEN')
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                    >
                      <option value="VIDEO">VIDEO (Rendered Composition / Video Asset)</option>
                      <option value="IMAGE">IMAGE (Graphic / Frame Asset)</option>
                      <option value="WRITTEN">WRITTEN (Text Post / Thread)</option>
                    </select>
                  </div>
                </div>

                {/* Platform Capability Guidance Banner */}
                {activeCap && (
                  <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs text-indigo-200">
                    <div className="font-semibold">{activeCap.displayName} Capabilities:</div>
                    <div className="mt-1 text-[11px] text-zinc-300">
                      Allowed Types: <strong>{activeCap.supportedContentTypes.join(', ')}</strong> •
                      Aspect Ratios: <strong>{activeCap.allowedAspectRatios.join(', ')}</strong> •
                      Max Caption: <strong>{activeCap.maxCaptionLength} chars</strong> • Max
                      Hashtags: <strong>{activeCap.maxHashtags}</strong>
                      {activeCap.requiresTitle ? ' • Requires Video Title' : ''}
                    </div>
                  </div>
                )}

                {contentType !== 'WRITTEN' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300">
                        Attach Approved Composition
                      </label>
                      <select
                        aria-label="Attach Approved Composition"
                        value={selectedCompositionId}
                        onChange={(e) => {
                          setSelectedCompositionId(e.target.value);
                          if (e.target.value) setSelectedAssetId('');
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                      >
                        <option value="">-- Optional: Select Composition --</option>
                        {dashboard?.compositions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} ({c.aspectRatio}) [{c.approvalStatus}]
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300">
                        Or Attach Library Asset
                      </label>
                      <select
                        aria-label="Or Attach Library Asset"
                        value={selectedAssetId}
                        onChange={(e) => {
                          setSelectedAssetId(e.target.value);
                          if (e.target.value) setSelectedCompositionId('');
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                      >
                        <option value="">-- Optional: Select Library Asset --</option>
                        {dashboard?.readyAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.assetType})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Post / Video Title {activeCap?.requiresTitle ? '(Required for Platform)' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="How AI Agents Automate Creative Video Production"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-zinc-300">
                      Caption / Post Body
                    </label>
                    <span
                      className={`text-[11px] ${
                        activeCap && captionText.length > activeCap.maxCaptionLength
                          ? 'font-bold text-red-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {captionText.length} / {activeCap?.maxCaptionLength ?? 2200} chars
                    </span>
                  </div>
                  <textarea
                    required
                    rows={3}
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    placeholder="Write your platform-tailored caption..."
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-zinc-300">
                      Hashtags (comma-separated)
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      {parsedHashtags.length} / {activeCap?.maxHashtags ?? 30} tags
                    </span>
                  </div>
                  <input
                    type="text"
                    value={hashtagsText}
                    onChange={(e) => setHashtagsText(e.target.value)}
                    placeholder="ai, videoediting, saas, contentcreator"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                {/* Scheduling & Timezone Controls */}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300">Delivery Mode</label>
                    <select
                      aria-label="Delivery Mode"
                      value={publishMode}
                      onChange={(e) =>
                        setPublishMode(e.target.value as 'IMMEDIATE' | 'SCHEDULED')
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="IMMEDIATE">Publish Immediately</option>
                      <option value="SCHEDULED">Schedule for Date &amp; Time</option>
                    </select>
                  </div>

                  {publishMode === 'SCHEDULED' && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-300">
                        Scheduled Date &amp; Time
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduledDateTime}
                        onChange={(e) => setScheduledDateTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-zinc-300">
                      Target Timezone
                    </label>
                    <select
                      aria-label="Target Timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white"
                    >
                      {(dashboard?.supportedTimezones ?? ['UTC']).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Human Approval Gate Checkbox */}
                <label className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
                  <input
                    type="checkbox"
                    checked={explicitApprovalConfirmed}
                    onChange={(e) => setExplicitApprovalConfirmed(e.target.checked)}
                    className="rounded border-zinc-700"
                  />
                  <span>
                    <strong>Human Approval Gate:</strong> I explicitly approve this content and
                    authorize publication to the selected social account.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submittingPost || !selectedAccountId}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {submittingPost
                    ? 'Validating & Submitting...'
                    : publishMode === 'IMMEDIATE'
                      ? 'Approve & Publish Immediately'
                      : 'Approve & Schedule Post'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Bottom Section: Queues, History & Recovery */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('SCHEDULED')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  activeTab === 'SCHEDULED'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white'
                }`}
              >
                Upcoming Scheduled ({dashboard?.upcomingScheduled.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PUBLISHED')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  activeTab === 'PUBLISHED'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white'
                }`}
              >
                Confirmed Published ({dashboard?.recentlyPublished.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('FAILED')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  activeTab === 'FAILED'
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white'
                }`}
              >
                Failed &amp; Recovery ({dashboard?.failedJobs.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('QUEUE')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  activeTab === 'QUEUE'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white'
                }`}
              >
                In-Flight Queue ({dashboard?.publishingQueue.length ?? 0})
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {activeTab === 'SCHEDULED' &&
              (dashboard?.upcomingScheduled.length ? (
                dashboard.upcomingScheduled.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                          {post.platform}
                        </span>
                        <span className="text-xs font-medium text-zinc-300">
                          {post.socialAccount.accountHandle}
                        </span>
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                          {post.contentType}
                        </span>
                        <span className="text-xs text-indigo-400">
                          Scheduled: {post.localScheduledLabel} ({post.timezone})
                        </span>
                      </div>
                      {post.title && (
                        <div className="text-xs font-semibold text-white">{post.title}</div>
                      )}
                      <p className="text-xs text-zinc-300">{post.captionText}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handlePublishNow(post.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        Publish Now
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCancelPost(post.id)}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No upcoming scheduled posts.</p>
              ))}

            {activeTab === 'PUBLISHED' &&
              (dashboard?.recentlyPublished.length ? (
                dashboard.recentlyPublished.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          CONFIRMED PUBLISHED
                        </span>
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                          {post.platform}
                        </span>
                        <span className="text-xs text-zinc-300">
                          {post.socialAccount.accountHandle}
                        </span>
                        {post.isSimulated && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                            [SIMULATED SANDBOX]
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-200">{post.captionText}</p>
                      <div className="text-[11px] text-zinc-500">
                        External ID: <code>{post.externalPostId}</code> • Published:{' '}
                        {post.localEffectiveLabel} ({post.timezone}) • Idempotency:{' '}
                        <code>{post.idempotencyKey.slice(0, 16)}...</code>
                      </div>
                    </div>
                    {post.externalPostUrl && (
                      <a
                        href={post.externalPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-indigo-300 hover:bg-zinc-800"
                      >
                        View Post Reference
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No published posts yet.</p>
              ))}

            {activeTab === 'FAILED' &&
              (dashboard?.failedJobs.length ? (
                dashboard.failedJobs.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-zinc-950 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
                          {post.providerStatus}
                        </span>
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                          {post.platform}
                        </span>
                        <span className="text-xs text-zinc-400">
                          Retries: {post.retryCount} / {post.maxRetries}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-200">{post.captionText}</p>
                      <div className="text-xs text-red-400">Error: {post.errorMessage}</div>
                      {post.nextRetryAt && (
                        <div className="text-[11px] text-amber-300">
                          Next Backoff Retry: {post.nextRetryAt}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRetryFailedPost(post.id)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                      >
                        Retry &amp; Recover Now
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCancelPost(post.id)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No failed publishing jobs.</p>
              ))}

            {activeTab === 'QUEUE' &&
              (dashboard?.publishingQueue.length ? (
                dashboard.publishingQueue.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div>
                      <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                        {post.status} ({post.providerStatus})
                      </span>
                      <p className="mt-1 text-xs text-zinc-200">{post.captionText}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No in-flight publishing jobs.</p>
              ))}
          </div>
        </div>
      </div>

      {/* OAuth Connection Modal */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-bold text-white">Connect Social Account via OAuth</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Tokens are encrypted at rest with AES-256-GCM and scoped strictly to this workspace.
            </p>

            <form onSubmit={handleCompleteOAuthConnect} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300">Social Platform</label>
                <select
                  aria-label="Social Platform"
                  value={oauthPlatform}
                  onChange={(e) => {
                    setOauthPlatform(e.target.value);
                    void handleGenerateOAuthUrl(e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {oauthAuthorizationUrl && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
                  <div className="font-semibold text-zinc-300">
                    Required OAuth Scopes: {oauthScopes.join(', ')}
                  </div>
                  <div className="mt-1 truncate text-zinc-500">
                    Endpoint: {oauthAuthorizationUrl}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300">Account Name</label>
                <input
                  type="text"
                  required
                  value={oauthAccountName}
                  onChange={(e) => setOauthAccountName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">Account Handle</label>
                <input
                  type="text"
                  required
                  value={oauthAccountHandle}
                  onChange={(e) => setOauthAccountHandle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOAuthModal(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectingOAuth}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  {connectingOAuth ? 'Exchanging OAuth Code...' : 'Authorize & Connect Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
