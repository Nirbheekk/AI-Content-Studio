'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Copy,
  FileText,
  Film,
  Quote,
  Repeat,
  Send,
  Sparkles,
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
} from '../../components/design-system/primitives';
import { VideoPlayer } from '../../components/creative/video-player';
import { useStudio } from '../../context/studio-context';
import { apiRequest, AssetDto, ProjectDto } from '../../lib/api-client';

interface RepurposeResultView {
  campaignTitle: string;
  compositions: Array<{
    id: string;
    title: string;
    targetPlatform: string;
    aspectRatio: string;
    width: number;
    height: number;
    downloadUrl?: string | null;
    qaScore?: number;
  }>;
  quoteGraphics: Array<{
    id: string;
    quoteText: string;
    attribution: string;
    aspectRatio: string;
    primaryColor: string;
  }>;
  writtenPosts: Array<{
    id: string;
    platform: string;
    hookHeadline: string;
    bodyText: string;
    hashtags: string[];
  }>;
}

const PLANNED_TARGETS = [
  {
    platform: 'INSTAGRAM_REELS',
    label: 'Instagram Reels',
    aspectRatio: '9:16 Portrait',
    template: 'instagram-reel',
    count: '2 Videos',
  },
  {
    platform: 'TIKTOK',
    label: 'TikTok Short',
    aspectRatio: '9:16 Portrait',
    template: 'tiktok-short',
    count: '1 Video',
  },
  {
    platform: 'YOUTUBE_SHORTS',
    label: 'YouTube Shorts',
    aspectRatio: '9:16 Portrait',
    template: 'youtube-short',
    count: '1 Video',
  },
  {
    platform: 'LINKEDIN',
    label: 'LinkedIn Feed Video',
    aspectRatio: '4:5 Portrait',
    template: 'promotional-video',
    count: '1 Video',
  },
] as const;

function formatCleanTitle(raw: string): string {
  return raw.replace(/[-_]\d{10,14}$/, '').trim() || raw;
}

export default function RepurposeEnginePage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sourceAssetId, setSourceAssetId] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('Founder Podcast Omnibus Wave');
  const [creativeBrief, setCreativeBrief] = useState(
    'Extract the highest-retention insights and repurpose into Instagram Reels, TikToks, YouTube Shorts, and LinkedIn posts.',
  );
  const [includeQuotes, setIncludeQuotes] = useState(true);
  const [includeWritten, setIncludeWritten] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RepurposeResultView | null>(null);

  useEffect(() => {
    if (!accessToken || !activeWorkspace) return;
    Promise.all([
      apiRequest<ProjectDto[]>({
        path: '/api/v1/projects',
        accessToken,
        workspaceId: activeWorkspace.id,
      }),
      apiRequest<AssetDto[]>({
        path: '/api/v1/assets',
        accessToken,
        workspaceId: activeWorkspace.id,
      }),
    ])
      .then(([projList, assetList]) => {
        setProjects(projList);
        setAssets(assetList);
        if (projList[0]) setProjectId(projList[0].id);
        if (assetList[0]) setSourceAssetId(assetList[0].id);
      })
      .catch(() => null);
  }, [accessToken, activeWorkspace]);

  const handleRunRepurpose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !projectId) return;
    setRunning(true);
    try {
      const res = await apiRequest<RepurposeResultView>({
        method: 'POST',
        path: '/api/v1/repurpose',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId,
          ...(sourceAssetId ? { sourceAssetId } : {}),
          campaignTitle,
          creativeBrief,
          targets: [
            {
              platform: 'INSTAGRAM_REELS',
              aspectRatio: 'PORTRAIT_9_16',
              templateId: 'instagram-reel',
              count: 2,
            },
            {
              platform: 'TIKTOK',
              aspectRatio: 'PORTRAIT_9_16',
              templateId: 'tiktok-short',
              count: 1,
            },
            {
              platform: 'YOUTUBE_SHORTS',
              aspectRatio: 'PORTRAIT_9_16',
              templateId: 'youtube-short',
              count: 1,
            },
            {
              platform: 'LINKEDIN',
              aspectRatio: 'PORTRAIT_4_5',
              templateId: 'promotional-video',
              count: 1,
            },
          ],
          includeQuoteGraphics: includeQuotes,
          includeWrittenPosts: includeWritten,
          autoRenderPreviews: true,
        },
      });
      setResult(res);
      setFeedback({
        type: 'success',
        message: `Generated ${res.compositions.length} platform videos, ${res.quoteGraphics.length} quote graphics, and ${res.writtenPosts.length} written posts`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Repurposing failed',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCopyWrittenPost = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ type: 'success', message: 'Copied social post copy to clipboard' });
    } catch {
      setFeedback({ type: 'error', message: 'Unable to copy to clipboard' });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Content Repurpose Engine"
          description="Convert one long-form recording or creative brief into multi-aspect video compositions, quote graphics, and platform-tailored written copy."
          badge={
            <Badge variant={result ? 'success' : 'ai'}>
              {result ? 'Batch Generated' : 'Multi-Format Campaign'}
            </Badge>
          }
        />

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Source & Campaign Configuration Form */}
          <Card className="p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Repeat className="h-3.5 w-3.5 text-primary" />
                <span>1. Source Selection &amp; Campaign Brief</span>
              </div>
              <Badge variant="outline">Auto-Renders MP4 + Visual QA</Badge>
            </div>

            <form onSubmit={handleRunRepurpose} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Target Campaign Project
                  </label>
                  <Select
                    aria-label="Target Project"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatCleanTitle(p.name)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Source Long-Form Asset
                  </label>
                  <Select
                    aria-label="Source Long-Form Asset"
                    value={sourceAssetId}
                    onChange={(e) => setSourceAssetId(e.target.value)}
                  >
                    <option value="">Project Default Context</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.originalName} ({a.assetType})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Campaign Wave Title
                </label>
                <Input
                  type="text"
                  required
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="e.g. Founder Podcast Omnibus Wave"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Creative Repurposing Brief
                </label>
                <Textarea
                  rows={3}
                  required
                  value={creativeBrief}
                  onChange={(e) => setCreativeBrief(e.target.value)}
                  placeholder="Describe the key takeaway, target audience, and hook style..."
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-secondary/35 px-3.5 py-2.5 text-xs">
                <label className="flex items-center gap-2 font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={includeQuotes}
                    onChange={(e) => setIncludeQuotes(e.target.checked)}
                  />
                  <span>Include Quote Graphics</span>
                </label>
                <label className="flex items-center gap-2 font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={includeWritten}
                    onChange={(e) => setIncludeWritten(e.target.checked)}
                  />
                  <span>Include Written Social Posts</span>
                </label>
              </div>

              <Button type="submit" variant="ai" disabled={running || !projectId} className="w-full">
                <Sparkles className="h-4 w-4" />
                {running
                  ? 'Generating & Rendering Multi-Platform Batch...'
                  : 'Generate Multi-Platform Campaign Batch'}
              </Button>
            </form>
          </Card>

          {/* Right: Planned Target Matrix (Clearly distinguished as configuration vs output) */}
          <Card className="p-5 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Configured Target Matrix
              </span>
              <Badge variant="info">Planned Blueprint</Badge>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Each batch run compiles and renders the following platform-specific deliverables
              inheriting your Workspace Brand Kit:
            </p>

            <div className="mt-3 space-y-2">
              {PLANNED_TARGETS.map((t) => (
                <div
                  key={t.platform}
                  className="flex items-center justify-between rounded-xl border border-border bg-secondary/35 px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="font-semibold text-foreground">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.aspectRatio} • Template: <span className="font-mono">{t.template}</span>
                    </div>
                  </div>
                  <Badge variant="ai">{t.count}</Badge>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl border border-border bg-secondary/35 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Quote className="h-3.5 w-3.5 text-primary" />
                    <span>Quote Cards</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {includeQuotes ? 'Enabled (1:1 & 4:5)' : 'Skipped'}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-secondary/35 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <FileText className="h-3.5 w-3.5 text-info" />
                    <span>Written Copy</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {includeWritten ? 'Enabled (LinkedIn & X)' : 'Skipped'}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Generated Outputs Section */}
        {!result ? (
          <EmptyState
            icon={<Repeat className="h-5 w-5 text-primary" />}
            title="No repurposed campaign batch generated yet"
            description="Configure your source project and creative brief above, then click Generate Multi-Platform Campaign Batch to compile and render your deliverables."
          />
        ) : (
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">
                    Generated Platform Video Compositions ({result.compositions.length})
                  </h2>
                </div>
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" />
                  Actual Generated Results
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {result.compositions.map((comp) => (
                  <Card key={comp.id} className="flex flex-col justify-between p-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="ai">{comp.targetPlatform}</Badge>
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          {comp.width}×{comp.height} ({comp.aspectRatio})
                        </span>
                      </div>
                      <h3 className="mt-2.5 text-sm font-semibold text-foreground">{comp.title}</h3>
                      <div className="mt-1.5">
                        <Badge variant="success">Visual QA Score: {comp.qaScore ?? 100}/100</Badge>
                      </div>

                      {comp.downloadUrl && (
                        <div className="mt-3">
                          <VideoPlayer src={comp.downloadUrl} />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <Link
                        href="/editor"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
                      >
                        <Film className="h-3.5 w-3.5" />
                        Open in Timeline Editor
                      </Link>
                      {comp.downloadUrl && (
                        <a
                          href={comp.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          Download MP4
                        </a>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Generated Quote Graphics ({result.quoteGraphics.length})
                  </h3>
                  <Badge variant="outline">Brand Palette Applied</Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {result.quoteGraphics.map((qg) => (
                    <div
                      key={qg.id}
                      className="rounded-xl border border-primary/30 bg-ai-surface p-4 text-xs text-foreground"
                    >
                      <p className="text-sm font-semibold italic leading-relaxed">
                        &ldquo;{qg.quoteText}&rdquo;
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>— {qg.attribution}</span>
                        <Badge variant="default">{qg.aspectRatio}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Generated Written Social Posts ({result.writtenPosts.length})
                  </h3>
                  <Link href="/publish" className="text-xs font-medium text-primary hover:underline">
                    Open Publishing Center →
                  </Link>
                </div>
                <div className="mt-3 space-y-3">
                  {result.writtenPosts.map((wp) => (
                    <div
                      key={wp.id}
                      className="rounded-xl border border-border bg-secondary/35 p-3.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="ai">{wp.platform}</Badge>
                          <span className="font-semibold text-foreground">{wp.hookHeadline}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleCopyWrittenPost(
                              `${wp.hookHeadline}\n\n${wp.bodyText}\n\n${wp.hashtags.join(' ')}`,
                            )
                          }
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                      </div>
                      <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground">
                        {wp.bodyText}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {wp.hashtags.map((tag, i) => (
                            <Badge key={i} variant="info">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <Link
                          href="/publish"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          <Send className="h-3 w-3" />
                          Schedule
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
