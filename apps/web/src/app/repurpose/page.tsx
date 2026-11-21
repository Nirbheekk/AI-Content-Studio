'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ExternalLink,
  Film,
  Flame,
  FolderOpen,
  Repeat,
  Send,
  Sparkles,
  Youtube,
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
  WorkflowStepper,
} from '@/components/design-system/primitives';
import {
  YoutubeViralClipperDialog,
  YoutubeViralClipResultDto,
} from '@/components/repurpose/youtube-viral-clipper-dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStudio } from '@/context/studio-context';
import { apiRequest, AssetDto, ProjectDto } from '@/lib/api-client';

interface RepurposeResultView {
  campaignId?: string;
  campaignTitle?: string;
  generatedVideos?: Array<{
    compositionId: string;
    platform: string;
    aspectRatio: string;
    title: string;
    templateId: string;
  }>;
  quoteGraphics?: Array<{ title?: string; quoteText: string; platform?: string }>;
  writtenPosts?: Array<{ platform: string; title?: string; body: string }>;
}

const TARGET_BLUEPRINTS = [
  { platform: 'INSTAGRAM_REELS', ratio: '9:16', label: 'Instagram Reels', count: 2 },
  { platform: 'TIKTOK', ratio: '9:16', label: 'TikTok Short', count: 1 },
  { platform: 'YOUTUBE_SHORTS', ratio: '9:16', label: 'YouTube Shorts', count: 1 },
  { platform: 'LINKEDIN', ratio: '4:5', label: 'LinkedIn Promo', count: 1 },
];

export default function RepurposePage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sourceAssetId, setSourceAssetId] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('Multi-Platform Campaign Wave');
  const [creativeBrief, setCreativeBrief] = useState(
    'Extract high-retention moments and adapt into Reels, TikTok, YouTube Shorts, and LinkedIn posts.',
  );
  const [includeQuotes, setIncludeQuotes] = useState(true);
  const [includeWritten, setIncludeWritten] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RepurposeResultView | null>(null);
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false);
  const [viralResult, setViralResult] = useState<YoutubeViralClipResultDto | null>(null);

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

  const handleRun = async (e: React.FormEvent) => {
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
            { platform: 'INSTAGRAM_REELS', aspectRatio: 'PORTRAIT_9_16', templateId: 'instagram-reel', count: 2 },
            { platform: 'TIKTOK', aspectRatio: 'PORTRAIT_9_16', templateId: 'tiktok-short', count: 1 },
            { platform: 'YOUTUBE_SHORTS', aspectRatio: 'PORTRAIT_9_16', templateId: 'youtube-short', count: 1 },
            { platform: 'LINKEDIN', aspectRatio: 'PORTRAIT_4_5', templateId: 'promotional-video', count: 1 },
          ],
          includeQuoteGraphics: includeQuotes,
          includeWrittenPosts: includeWritten,
          autoRenderPreviews: true,
        },
      });
      setResult(res);
      setFeedback({ type: 'success', message: 'Generated multi-platform campaign outputs' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Repurpose run failed',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="Repurpose Engine"
          description="Transform one source asset, brief, or YouTube stream into multi-platform Reels, Shorts, quote cards, and copy."
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setYoutubeDialogOpen(true)}>
                <Youtube className="h-4 w-4" />
                Clip YouTube URL
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/publish">
                  <Send className="h-3.5 w-3.5" />
                  Open Publish Queue
                </Link>
              </Button>
            </div>
          }
        />

        <WorkflowStepper activeStep="repurpose" projectId={projectId || undefined} />

        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Campaign Blueprint</CardTitle>
              <CardDescription>Configure source media and output formats.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRun} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="rep-proj">Project</Label>
                  <NativeSelect
                    id="rep-proj"
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

                <div className="space-y-1.5">
                  <Label htmlFor="rep-asset">Source Asset (Optional)</Label>
                  <NativeSelect
                    id="rep-asset"
                    value={sourceAssetId}
                    onChange={(e) => setSourceAssetId(e.target.value)}
                  >
                    <option value="">Brief only</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.originalName} ({a.assetType})
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rep-title">Campaign Title</Label>
                  <Input
                    id="rep-title"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rep-brief">Creative Brief</Label>
                  <Textarea
                    id="rep-brief"
                    rows={3}
                    value={creativeBrief}
                    onChange={(e) => setCreativeBrief(e.target.value)}
                  />
                </div>

                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Target Matrix
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TARGET_BLUEPRINTS.map((t) => (
                      <div
                        key={t.platform}
                        className="flex items-center justify-between rounded border border-border bg-background px-2 py-1 text-xs"
                      >
                        <span>{t.label}</span>
                        <Badge variant="outline">×{t.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center justify-between text-xs">
                    <span>Include quote graphics</span>
                    <Switch checked={includeQuotes} onCheckedChange={setIncludeQuotes} />
                  </label>
                  <label className="flex items-center justify-between text-xs">
                    <span>Include written social copy</span>
                    <Switch checked={includeWritten} onCheckedChange={setIncludeWritten} />
                  </label>
                </div>

                <Button type="submit" className="w-full" disabled={running || !projectId}>
                  <Repeat className="h-3.5 w-3.5" />
                  {running ? 'Generating Wave...' : 'Generate Multi-Platform Wave'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="flex flex-col lg:col-span-7">
            <CardHeader>
              <CardTitle>Generated Outputs</CardTitle>
              <CardDescription>
                Review variants and open any composition directly in Video Editor or Publish Queue.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {!result && !viralResult ? (
                <Empty
                  icon={<Sparkles className="h-5 w-5" />}
                  title="No wave or viral clips generated yet"
                  description="Run the campaign blueprint on the left or click Clip YouTube URL to auto-detect and render scored 9:16 viral clips."
                  action={
                    <Button size="sm" variant="outline" onClick={() => setYoutubeDialogOpen(true)}>
                      <Youtube className="h-4 w-4" />
                      Clip YouTube URL
                    </Button>
                  }
                />
              ) : (
                <Tabs defaultValue={viralResult ? 'viral' : 'videos'}>
                  <TabsList>
                    {viralResult && (
                      <TabsTrigger value="viral">
                        Viral Clips ({viralResult.clips.length})
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="videos">
                      Videos ({result?.generatedVideos?.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="quotes">
                      Quotes ({result?.quoteGraphics?.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="written">
                      Copy ({result?.writtenPosts?.length ?? 0})
                    </TabsTrigger>
                  </TabsList>

                  {viralResult && (
                    <TabsContent value="viral" className="space-y-3 pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                        <span className="truncate font-medium text-foreground">
                          {viralResult.videoTitle}
                        </span>
                        <Badge variant="outline">
                          {viralResult.layout === 'SPLIT_WEBCAM_BOTTOM'
                            ? 'Split-Screen 9:16'
                            : 'Center Crop 9:16'}
                        </Badge>
                      </div>

                      {viralResult.clips.map((clip) => (
                        <div
                          key={clip.assetId}
                          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
                        >
                          {clip.thumbnailUrl && (
                            <img
                              src={clip.thumbnailUrl}
                              alt={clip.hookTitle}
                              className="h-24 w-14 shrink-0 rounded-md border border-border object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="default" className="gap-1">
                                <Flame className="h-3 w-3" />
                                Viral {clip.viralScore}/100
                              </Badge>
                              <Badge variant="secondary">{clip.timestamp}</Badge>
                              <Badge variant="outline">{clip.captionEvents} captions</Badge>
                            </div>
                            <div className="truncate text-sm font-semibold text-foreground">
                              #{clip.rank} · {clip.hookTitle}
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {clip.transcript}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Button variant="outline" size="sm" asChild>
                              <a href={clip.downloadUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                                Watch
                              </a>
                            </Button>
                            <Button size="sm" asChild>
                              <Link href="/library">
                                <FolderOpen className="h-3.5 w-3.5" />
                                Library
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                  )}

                  <TabsContent value="videos" className="space-y-2">
                    {(result?.generatedVideos ?? []).map((v) => (
                      <div
                        key={v.compositionId}
                        className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold">{v.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {v.platform} · {v.aspectRatio}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/editor?compositionId=${encodeURIComponent(v.compositionId)}`}>
                              <Film className="h-3 w-3" />
                              Edit
                            </Link>
                          </Button>
                          <Button size="sm" asChild>
                            <Link href="/publish">
                              Publish
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="quotes" className="space-y-2">
                    {(result?.quoteGraphics ?? []).map((q, idx) => (
                      <div key={idx} className="rounded-md border border-border p-3 text-xs">
                        <p className="font-medium">&ldquo;{q.quoteText}&rdquo;</p>
                        {q.platform && (
                          <Badge variant="outline" className="mt-2">
                            {q.platform}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="written" className="space-y-2">
                    {(result?.writtenPosts ?? []).map((p, idx) => (
                      <div key={idx} className="rounded-md border border-border p-3 text-xs">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-semibold">{p.title || p.platform}</span>
                          <Badge variant="outline">{p.platform}</Badge>
                        </div>
                        <p className="whitespace-pre-wrap text-muted-foreground">{p.body}</p>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        <YoutubeViralClipperDialog
          open={youtubeDialogOpen}
          onOpenChange={setYoutubeDialogOpen}
          projects={projects}
          defaultProjectId={projectId}
          onClipsGenerated={(res) => setViralResult(res)}
        />
      </div>
    </AppShell>
  );
}
