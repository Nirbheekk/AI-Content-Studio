import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';

describe('Stage 3 — Editorial Intelligence, Semantic Search, Highlights & Story Planning', () => {
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
        email: `stage3-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage3 Director A',
        workspaceName: `Stage3 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Founder Launch Footage' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage3-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage3 Director B',
        workspaceName: `Stage3 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;

    // Seed an analyzed video asset with realistic transcript segments & visual scenes
    const raw = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const asset = await prisma.asset.create({
      data: {
        workspaceId: workspaceA,
        projectId: projectA,
        folderPath: '/raw-clips/founder-interview',
        originalName: 'founder-pricing-demo.mp4',
        storageKey: `workspaces/${workspaceA}/founder-pricing-${randomUUID()}.mp4`,
        bucketName: storage.getConfig().rawBucket,
        mimeType: 'video/mp4',
        assetType: 'VIDEO',
        sizeBytes: BigInt(raw.byteLength),
        checksumSha256: createHash('sha256').update(raw).digest('hex'),
        durationSec: 45,
        width: 1920,
        height: 1080,
        status: 'READY',
        tags: ['founder', 'pricing', 'demo'],
        aiSummary: 'Founder explains why our pricing saves creative teams 10 hours per week and demonstrates the dashboard.',
        transcript: {
          create: {
            language: 'en',
            provider: 'whisper-local',
            fullText:
              'Welcome to the studio walkthrough. Most teams waste ten hours every week manually cutting clips. Our transparent pricing is different because you pay zero for local FFmpeg rendering. Watch this live product demo on the dashboard screen right now.',
            segmentsJson: [
              { startSec: 0, endSec: 6, text: 'Welcome to the studio walkthrough.' },
              {
                startSec: 6,
                endSec: 16,
                text: 'Most teams waste ten hours every week manually cutting clips.',
              },
              {
                startSec: 16,
                endSec: 28,
                text: 'Our transparent pricing is different because you pay zero for local FFmpeg rendering.',
              },
              {
                startSec: 28,
                endSec: 40,
                text: 'Watch this live product demo on the dashboard screen right now.',
              },
            ],
          },
        },
        scenes: {
          create: [
            {
              sceneIndex: 0,
              startSec: 0,
              endSec: 16,
              description: 'Founder talking head in studio explaining editing bottleneck',
              hookScore: 84,
              isBroll: false,
              speakerLabels: ['Speaker 1'],
            },
            {
              sceneIndex: 1,
              startSec: 16,
              endSec: 28,
              description: 'Founder explaining transparent pricing difference',
              hookScore: 92,
              isBroll: false,
              speakerLabels: ['Speaker 1'],
            },
            {
              sceneIndex: 2,
              startSec: 28,
              endSec: 40,
              description: 'Close-up screen capture of live product demo dashboard',
              hookScore: 88,
              isBroll: true,
              speakerLabels: ['Speaker 1'],
            },
          ],
        },
      },
    });
    assetAId = asset.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('preserves original transcript while saving user-corrected transcript separately', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${assetAId}/transcript`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        correctedText: 'Corrected: Our transparent pricing saves creative teams 10 hours per week.',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { fullText: string; correctedText: string } };
    expect(body.data.fullText).toContain('Welcome to the studio walkthrough');
    expect(body.data.correctedText).toContain('Corrected:');
  });

  it('performs hybrid semantic media search with timestamps and enforces strict workspace isolation', async () => {
    const searchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/editorial/search',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { query: 'founder explaining transparent pricing', projectId: projectA },
    });
    expect(searchRes.statusCode).toBe(200);
    const data = (searchRes.json() as {
      data: { hits: Array<{ assetId: string; startSec: number; endSec: number; streamUrl: string }> };
    }).data;
    expect(data.hits.length).toBeGreaterThan(0);
    expect(data.hits[0]?.assetId).toBe(assetAId);
    expect(data.hits[0]?.startSec).toBe(16);
    expect(data.hits[0]?.streamUrl).toContain(`/api/v1/assets/${assetAId}/stream?token=`);

    // Workspace B must see 0 hits for Workspace A's footage
    const crossWs = await app.inject({
      method: 'POST',
      url: '/api/v1/editorial/search',
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
      payload: { query: 'founder explaining transparent pricing' },
    });
    expect(crossWs.statusCode).toBe(200);
    expect((crossWs.json() as { data: { hits: unknown[] } }).data.hits).toHaveLength(0);
  });

  it('discovers evidence-backed highlights with preserved before/after context', async () => {
    const hlRes = await app.inject({
      method: 'POST',
      url: '/api/v1/editorial/highlights',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { projectId: projectA, targetDurationSec: 20, maxHighlights: 3, focusTopic: 'pricing demo' },
    });
    expect(hlRes.statusCode).toBe(200);
    const data = (hlRes.json() as {
      data: {
        highlights: Array<{
          assetId: string;
          startSec: number;
          endSec: number;
          transcript: string;
          editorialRationale: string;
        }>;
      };
    }).data;
    expect(data.highlights.length).toBeGreaterThan(0);
    expect(data.highlights[0]?.assetId).toBe(assetAId);
    expect(data.highlights[0]?.transcript.length).toBeGreaterThan(15);
    expect(data.highlights[0]?.editorialRationale).toContain('thought');
  });

  it('generates 3 ranked editorial concepts with provenance & anti-slop scoring, and persists human edit/reject/approve', async () => {
    const planRes = await app.inject({
      method: 'POST',
      url: '/api/v1/editorial/plans',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        brief: 'Show why our pricing is different and demonstrate the product saving 10 hours a week',
        platform: 'INSTAGRAM_REELS',
        conceptCount: 3,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const planData = (planRes.json() as {
      data: {
        plan: {
          id: string;
          revisionNumber: number;
          concepts: Array<{
            id: string;
            overallEditorialScore: number;
            scriptSectionsJson: Array<{ provenance: string }>;
          }>;
        };
      };
    }).data;

    expect(planData.plan.concepts).toHaveLength(3);
    expect(planData.plan.concepts[0]?.overallEditorialScore).toBeGreaterThan(60);
    expect(planData.plan.concepts[0]?.scriptSectionsJson[0]?.provenance).toBe('DIRECT_QUOTE');

    // Reject concept #2
    const rejectRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/editorial/plans/${planData.plan.id}/concepts/${planData.plan.concepts[1]!.id}`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { status: 'REJECTED', reviewerNotes: 'Too generic for our audience' },
    });
    expect(rejectRes.statusCode).toBe(200);

    // Edit hook & approve concept #1
    const approveRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/editorial/plans/${planData.plan.id}/concepts/${planData.plan.concepts[0]!.id}`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        hook: 'Why paying $0 for local FFmpeg rendering changes everything',
        status: 'APPROVED',
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const approvedBody = approveRes.json() as {
      data: { plan: { status: string; revisionNumber: number; approvedConceptId: string } };
    };
    expect(approvedBody.data.plan.status).toBe('APPROVED');
    expect(approvedBody.data.plan.revisionNumber).toBe(3);
    expect(approvedBody.data.plan.approvedConceptId).toBe(planData.plan.concepts[0]!.id);
  });
});
