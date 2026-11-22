import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';

describe('Stage 5 — Generative Media, Provider Capabilities & Voice Consent Governance', () => {
  let app: FastifyInstance;
  const storage = new MinioStorageAdapter();

  let tokenA = '';
  let workspaceA = '';
  let projectA = '';
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
        email: `stage5-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage5 Producer A',
        workspaceName: `Stage5 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Generative B-Roll Campaign' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage5-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage5 Producer B',
        workspaceName: `Stage5 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists provider capabilities with honest availability and UNKNOWN pricing where unconfigured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/generative/providers',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        providers: Array<{
          providerId: string;
          availabilityStatus: string;
          unitPriceUsd: number | null;
        }>;
      };
    };
    expect(body.data.providers.length).toBeGreaterThanOrEqual(5);
    const local = body.data.providers.find((p) => p.providerId === 'local-ffmpeg-audio-studio');
    expect(local?.availabilityStatus).toBe('LOCAL_DETERMINISTIC');
    const runway = body.data.providers.find((p) => p.providerId === 'runway-gen');
    expect(runway?.unitPriceUsd).toBeNull();
  });

  it('returns honest UNAVAILABLE state when requireLiveProvider=true and credentials are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/jobs',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        providerId: 'runway-gen',
        taskType: 'TEXT_TO_VIDEO',
        prompt: 'Aerial drone shot of minimalist studio desk at sunrise',
        requireLiveProvider: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      data: { status: string; executionMode: string; costStatus: string };
    };
    expect(body.data.status).toBe('UNAVAILABLE');
    expect(body.data.executionMode).toBe('UNAVAILABLE');
    expect(body.data.costStatus).toBe('UNKNOWN');
  });

  it('enforces idempotency, saves accepted asset to Media Library with provenance, and enforces workspace isolation', async () => {
    const idemKey = `idem-stage5-${randomUUID()}`;
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/jobs',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        providerId: 'local-ffmpeg-audio-studio',
        taskType: 'TEXT_TO_IMAGE',
        prompt: 'Clean product hero card with crisp lighting',
        aspectRatio: 'PORTRAIT_9_16',
        idempotencyKey: idemKey,
      },
    });
    expect(first.statusCode).toBe(201);
    const jobA = (first.json() as { data: { id: string; idempotentReplay: boolean } }).data;
    expect(jobA.idempotentReplay).toBe(false);

    // Replay with same idempotencyKey returns existing job without creating duplicate
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/jobs',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        providerId: 'local-ffmpeg-audio-studio',
        taskType: 'TEXT_TO_IMAGE',
        prompt: 'Clean product hero card with crisp lighting',
        aspectRatio: 'PORTRAIT_9_16',
        idempotencyKey: idemKey,
      },
    });
    expect(replay.statusCode).toBe(201);
    const replayBody = replay.json() as { data: { id: string; idempotentReplay: boolean } };
    expect(replayBody.data.id).toBe(jobA.id);
    expect(replayBody.data.idempotentReplay).toBe(true);

    // Cross-workspace accept must fail with 404
    const crossWs = await app.inject({
      method: 'POST',
      url: `/api/v1/generative/jobs/${jobA.id}/decision`,
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
      payload: { decision: 'ACCEPT' },
    });
    expect(crossWs.statusCode).toBe(404);

    // Accept in workspace A -> registers provenance-tagged Asset in Library
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/generative/jobs/${jobA.id}/decision`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { decision: 'ACCEPT' },
    });
    expect(accepted.statusCode).toBe(200);
    const accBody = accepted.json() as {
      data: {
        job: { status: string; assetId: string };
        asset: { id: string; folderPath: string; aiMetadataJson: { origin: string } };
        streamUrl: string;
      };
    };
    expect(accBody.data.job.status).toBe('ACCEPTED');
    expect(accBody.data.asset.folderPath).toBe('/generated');
    expect(accBody.data.asset.aiMetadataJson.origin).toBe('GENERATED');
    expect(accBody.data.streamUrl).toContain('/api/v1/assets/');
  });

  it('strictly blocks VOICE_CLONE without ACTIVE consent and blocks again after revocation', async () => {
    // 1. Blocked without consentId
    const blockedNoConsent = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/jobs',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        providerId: 'elevenlabs-voice',
        taskType: 'VOICE_CLONE',
        prompt: 'Welcome to our product demo.',
      },
    });
    expect(blockedNoConsent.statusCode).toBe(403);

    // 2. Grant explicit consent
    const consentRes = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/voice-consents',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        voiceOwnerName: 'Jane Founder',
        speakerLabel: 'FOUNDER_MAIN',
        consentScope: 'INTERNAL_PREVIEW',
        permittedUsage: 'Authorized product demo narration',
        attestationText: 'I hold signed authorization from Jane Founder for this workspace.',
      },
    });
    expect(consentRes.statusCode).toBe(201);
    const consentId = (consentRes.json() as { data: { id: string } }).data.id;

    // 3. Allowed with ACTIVE consent
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/jobs',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        providerId: 'elevenlabs-voice',
        taskType: 'VOICE_CLONE',
        prompt: 'Welcome to our product demo.',
        voiceConsentId: consentId,
      },
    });
    expect(allowed.statusCode).toBe(201);

    // 4. Revoke consent -> immediately blocked again (403)
    const revoke = await app.inject({
      method: 'POST',
      url: `/api/v1/generative/voice-consents/${consentId}/revoke`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {},
    });
    expect(revoke.statusCode).toBe(200);

    const blockedAfterRevoke = await app.inject({
      method: 'POST',
      url: '/api/v1/generative/jobs',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        providerId: 'elevenlabs-voice',
        taskType: 'VOICE_CLONE',
        prompt: 'Attempt after revocation.',
        voiceConsentId: consentId,
      },
    });
    expect(blockedAfterRevoke.statusCode).toBe(403);
  });
});
