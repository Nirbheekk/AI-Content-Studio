import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';

describe('Stage 4 — Professional Shorts Factory API Integration', () => {
  let app: FastifyInstance;
  const storage = new MinioStorageAdapter();

  let tokenA = '';
  let workspaceA = '';
  let projectA = '';
  let assetAId = '';
  let tokenB = '';
  let workspaceB = '';

  beforeAll(async () => {
    app = await buildApiServer({ storage });
    await app.ready();

    const suffix = randomUUID().slice(0, 8);
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage4-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage4 Creator A',
        workspaceName: `Stage4 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Shorts Factory Launch' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage4-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage4 Creator B',
        workspaceName: `Stage4 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;

    // Seed an analyzed long-form video asset with realistic transcript segments
    const raw = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const asset = await prisma.asset.create({
      data: {
        workspaceId: workspaceA,
        projectId: projectA,
        assetType: 'VIDEO',
        status: 'READY',
        originalName: 'founder-keynote-longform.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(raw.byteLength),
        bucketName: storage.getConfig().rawBucket,
        storageKey: `uploads/${workspaceA}/stage4-${suffix}.mp4`,
        checksumSha256: createHash('sha256').update(raw).digest('hex'),
        durationSec: 42,
        width: 1920,
        height: 1080,
        fps: 30,
        aiSummary: 'Founder explains why deterministic video pipelines outperform generic templates.',
      },
    });
    assetAId = asset.id;

    await prisma.transcript.create({
      data: {
        assetId: asset.id,
        language: 'en',
        provider: 'whisper-local',
        fullText:
          'Why do most short-form videos lose viewers in two seconds? Um, because they hide the proof. Here is how our studio ships verified clips three times faster. We cut production time by seventy percent.',
        segmentsJson: [
          { startSec: 0, endSec: 3.2, text: 'Why do most short-form videos lose viewers in two seconds?' },
          { startSec: 4.8, endSec: 7.4, text: 'Um, because they hide the visual proof right at the start.' },
          { startSec: 9.8, endSec: 15.0, text: 'Here is how our studio ships verified clips three times faster for founders.' },
          { startSec: 15.3, endSec: 21.0, text: 'We cut production time by seventy percent while keeping full editorial control.' },
        ],
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns all 8 caption presets, 5 motion presets, and 4 smart-cut presets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/shorts/presets',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        captionPresets: Array<{ id: string }>;
        motionPresets: Array<{ id: string }>;
        smartCutPresets: string[];
      };
    };
    expect(body.data.captionPresets).toHaveLength(8);
    expect(body.data.motionPresets).toHaveLength(5);
    expect(body.data.smartCutPresets).toEqual(['GENTLE', 'BALANCED', 'AGGRESSIVE', 'MANUAL_REVIEW']);
  });

  it('analyzes non-destructive smart cuts and enforces workspace isolation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shorts/smart-cuts',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { assetId: assetAId, preset: 'BALANCED' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        hasTranscript: boolean;
        protectedPauseCount: number;
        proposals: Array<{ kind: string; accepted: boolean; protectedDramaticPause: boolean }>;
      };
    };
    expect(body.data.hasTranscript).toBe(true);
    expect(body.data.protectedPauseCount).toBe(1);
    expect(body.data.proposals.length).toBeGreaterThanOrEqual(2);

    // Cross-workspace access must be denied (404)
    const crossWs = await app.inject({
      method: 'POST',
      url: '/api/v1/shorts/smart-cuts',
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
      payload: { assetId: assetAId, preset: 'BALANCED' },
    });
    expect(crossWs.statusCode).toBe(404);
  });

  it('generates styled ASS/SRT/VTT caption preview for any preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shorts/captions/preview',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        assetId: assetAId,
        captionPresetId: 'kinetic-word-highlight',
        maxDurationSec: 30,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        cueCount: number;
        assContent: string;
        srtContent: string;
        vttContent: string;
      };
    };
    expect(body.data.cueCount).toBeGreaterThan(0);
    expect(body.data.assContent).toContain('[V4+ Styles]');
    expect(body.data.srtContent).toContain('-->');
    expect(body.data.vttContent).toContain('WEBVTT');
  });

  it('generates an editable, Creative-QA & Signal-QA verified Short with playable MP4 streamUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shorts/batch',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        sourceAssetId: assetAId,
        captionPresetId: 'bold-creator',
        motionPresetId: 'energetic',
        smartCutPreset: 'BALANCED',
        aspectRatio: 'PORTRAIT_9_16',
        targetPlatform: 'INSTAGRAM_REELS',
        maxShorts: 1,
        targetDurationSec: 18,
        renderMp4: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      data: {
        shortsCount: number;
        shorts: Array<{
          compositionId: string;
          assetId: string | null;
          streamUrl: string | null;
          creativeQa: { passed: boolean; score: number };
          signalQa: { passed?: boolean } | null;
          smartCutSummary: { preset: string };
        }>;
      };
    };
    expect(body.data.shortsCount).toBe(1);
    const short = body.data.shorts[0]!;
    expect(short.compositionId).toBeTruthy();
    expect(short.assetId).toBeTruthy();
    expect(short.streamUrl).toContain('/api/v1/renders/');
    expect(short.creativeQa.score).toBeGreaterThanOrEqual(75);
    expect(short.signalQa).toBeTruthy();
    expect(short.smartCutSummary.preset).toBe('BALANCED');

    // Verify composition is immediately editable via GET /api/v1/compositions/:id
    const compRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compositions/${short.compositionId}`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(compRes.statusCode).toBe(200);
  }, 60_000);
});
