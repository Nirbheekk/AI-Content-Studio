'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
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
          includeQuoteGraphics: true,
          includeWrittenPosts: true,
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

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="border-b border-zinc-800 pb-5">
          <h1 className="text-2xl font-bold text-white">Multi-Format Content Repurposing Engine</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Transform one source recording into Instagram Reels, TikTok videos, YouTube Shorts,
            LinkedIn video posts, quote graphics, and written social copy.
          </p>
        </div>

        <form
          onSubmit={handleRunRepurpose}
          className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs text-zinc-300">Target Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-300">Source Long-Form Asset</label>
              <select
                value={sourceAssetId}
                onChange={(e) => setSourceAssetId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                <option value="">Project Default Asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.originalName} ({a.assetType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-300">Campaign Title</label>
              <input
                type="text"
                required
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-300">Creative Repurposing Brief</label>
            <textarea
              rows={2}
              required
              value={creativeBrief}
              onChange={(e) => setCreativeBrief(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
          </div>

          <button
            type="submit"
            disabled={running}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {running
              ? 'Generating & Rendering Multi-Platform Batch...'
              : 'Generate Multi-Platform Campaign Batch'}
          </button>
        </form>

        {result && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">
                Generated Platform Video Compositions ({result.compositions.length})
              </h2>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {result.compositions.map((comp) => (
                  <div
                    key={comp.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                        {comp.targetPlatform}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {comp.width}x{comp.height} ({comp.aspectRatio})
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-white">{comp.title}</h3>
                    <div className="mt-1 text-[11px] text-emerald-300">
                      Visual QA Score: {comp.qaScore ?? 100}/100
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Link
                        href="/editor"
                        className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                      >
                        Open in Timeline Editor
                      </Link>
                      {comp.downloadUrl && (
                        <a
                          href={comp.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                        >
                          Download MP4
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="text-sm font-semibold text-white">
                  Generated Quote Graphics ({result.quoteGraphics.length})
                </h3>
                <div className="mt-3 space-y-3">
                  {result.quoteGraphics.map((qg) => (
                    <div
                      key={qg.id}
                      className="rounded-lg border border-zinc-700 p-4 text-xs text-white"
                      style={{ backgroundColor: `${qg.primaryColor}22` }}
                    >
                      <p className="font-semibold italic">{qg.quoteText}</p>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        — {qg.attribution} ({qg.aspectRatio})
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="text-sm font-semibold text-white">
                  Generated Written Social Posts ({result.writtenPosts.length})
                </h3>
                <div className="mt-3 space-y-3">
                  {result.writtenPosts.map((wp) => (
                    <div
                      key={wp.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs"
                    >
                      <div className="font-bold text-indigo-300">
                        [{wp.platform}] {wp.hookHeadline}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-zinc-300">{wp.bodyText}</p>
                      <div className="mt-2 text-[11px] text-cyan-400">
                        {wp.hashtags.join(' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
