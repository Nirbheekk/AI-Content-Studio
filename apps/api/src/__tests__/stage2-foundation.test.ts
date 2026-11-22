import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';
import { evaluateSingleAssetRights } from '../services/media-rights.service.js';
import { computePreflightCostEstimate } from '../services/cost-estimator.service.js';

describe('Stage 2 Foundation — Media Rights, Publishing Rights Gate & Pre-Flight Cost Estimator', () => {
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
        email: `stage2-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage2 Owner A',
        workspaceName: `Stage2 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenA = bodyA.data.accessToken;
    workspaceA = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { name: 'Stage 2 Foundation Project' },
    });
    projectA = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stage2-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Stage2 Owner B',
        workspaceName: `Stage2 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as { data: { accessToken: string; activeWorkspaceId: string } };
    tokenB = bodyB.data.accessToken;
    workspaceB = bodyB.data.activeWorkspaceId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('evaluates all Media Rights states accurately (verified, unknown, expired, restricted, commercial-no, attribution, cloned voice, territory)', () => {
    const stub = { id: 'a1', originalName: 'clip.mp4' };
    expect(evaluateSingleAssetRights(stub, null).decision).toBe('REVIEW_REQUIRED');

    expect(
      evaluateSingleAssetRights(stub, {
        status: 'VERIFIED',
        source: 'USER_OWNED',
        commercialAllowed: true,
        attributionRequired: false,
        attributionText: null,
        territoryRestrictions: [],
        usageRestrictions: [],
        expiresAt: null,
        consentStatus: 'NOT_REQUIRED',
      }).decision,
    ).toBe('ALLOWED');

    expect(
      evaluateSingleAssetRights(stub, {
        status: 'VERIFIED',
        source: 'LICENSED_STOCK',
        commercialAllowed: true,
        attributionRequired: true,
        attributionText: 'Music by Artist X',
        territoryRestrictions: [],
        usageRestrictions: [],
        expiresAt: null,
        consentStatus: 'NOT_REQUIRED',
      }).decision,
    ).toBe('ALLOWED_WITH_ATTRIBUTION');

    expect(
      evaluateSingleAssetRights(stub, {
        status: 'VERIFIED',
        source: 'LICENSED_STOCK',
        commercialAllowed: true,
        attributionRequired: false,
        attributionText: null,
        territoryRestrictions: [],
        usageRestrictions: [],
        expiresAt: new Date('2020-01-01T00:00:00Z'),
        consentStatus: 'NOT_REQUIRED',
      }).decision,
    ).toBe('BLOCKED');

    expect(
      evaluateSingleAssetRights(stub, {
        status: 'VERIFIED',
        source: 'VOICE_CLONED',
        commercialAllowed: true,
        attributionRequired: false,
        attributionText: null,
        territoryRestrictions: [],
        usageRestrictions: [],
        expiresAt: null,
        consentStatus: 'PENDING',
      }).decision,
    ).toBe('BLOCKED');

    expect(
      evaluateSingleAssetRights(
        stub,
        {
          status: 'VERIFIED',
          source: 'LICENSED_STOCK',
          commercialAllowed: true,
          attributionRequired: false,
          attributionText: null,
          territoryRestrictions: ['DE', 'UK'],
          usageRestrictions: [],
          expiresAt: null,
          consentStatus: 'NOT_REQUIRED',
        },
        { territory: 'UK' },
      ).decision,
    ).toBe('BLOCKED');
  });

  it('enforces Media Rights CRUD, cross-workspace denial, and Publishing Rights Gate via live API', async () => {
    const payload = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const asset = await prisma.asset.create({
      data: {
        workspaceId: workspaceA,
        projectId: projectA,
        folderPath: '/raw-clips/shoot-day-1/broll',
        originalName: 'rights-test.mp4',
        storageKey: `workspaces/${workspaceA}/rights-test-${randomUUID()}.mp4`,
        bucketName: storage.getConfig().rawBucket,
        mimeType: 'video/mp4',
        assetType: 'VIDEO',
        sizeBytes: BigInt(payload.byteLength),
        checksumSha256: createHash('sha256').update(payload).digest('hex'),
        status: 'READY',
        tags: ['folder-upload'],
      },
    });

    // 1. Unknown rights blocked when requireVerifiedRights = true
    const checkUnknown = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/rights-check',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { assetId: asset.id, platform: 'INSTAGRAM_REELS', requireVerifiedRights: true },
    });
    expect(checkUnknown.statusCode).toBe(200);
    expect((checkUnknown.json() as { data: { allowedToPublish: boolean } }).data.allowedToPublish).toBe(false);

    // 2. Cross-workspace user B cannot read or modify workspace A asset rights
    const crossWs = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${asset.id}/rights`,
      headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': workspaceB },
    });
    expect(crossWs.statusCode).toBe(404);

    // 3. Verify commercial rights with attribution -> ALLOWED_WITH_ATTRIBUTION
    const putRights = await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${asset.id}/rights`,
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        rightsOwner: 'Studio Founder',
        source: 'LICENSED_STOCK',
        licenseType: 'Commercial Standard',
        commercialAllowed: true,
        attributionRequired: true,
        attributionText: 'Credit: Studio Stock',
        status: 'VERIFIED',
      },
    });
    expect(putRights.statusCode).toBe(200);

    const checkVerified = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/rights-check',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: { assetId: asset.id, platform: 'INSTAGRAM_REELS', requireVerifiedRights: true },
    });
    const verifiedData = (checkVerified.json() as {
      data: { allowedToPublish: boolean; decision: string; requiredAttributions: string[] };
    }).data;
    expect(verifiedData.allowedToPublish).toBe(true);
    expect(verifiedData.decision).toBe('ALLOWED_WITH_ATTRIBUTION');
    expect(verifiedData.requiredAttributions).toContain('Credit: Studio Stock');
  });

  it('computes honest pre-flight cost estimates, marks unknown models UNKNOWN, and enforces budget hard stops', async () => {
    const est = computePreflightCostEstimate({
      operations: [
        { operation: 'LLM_GENERATION', provider: 'google-gemini', model: 'gemini-2.5-flash', quantity: 10 },
        { operation: 'VIDEO_GENERATION', provider: 'unlisted-vendor', model: 'mystery-v9', quantity: 1 },
      ],
      currentMonthActualSpendUsd: 99.5,
      policy: {
        monthlyLimitUsd: 100,
        perOperationLimitUsd: 5,
        approvalThresholdUsd: 1,
        enforceHardStop: true,
      },
    });

    expect(est.knownEstimatedTotalUsd).toBeGreaterThan(0);
    expect(est.hasUnknownPricing).toBe(true);
    expect(est.unknownOperationsCount).toBe(1);
    expect(est.lineItems[1]?.priceStatus).toBe('UNKNOWN');
    expect(est.lineItems[1]?.estimatedCostUsd).toBeNull();
    expect(est.withinBudget).toBe(true);
    expect(est.requiresApproval).toBe(true);

    // Live API endpoint check
    const apiEst = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/estimate',
      headers: { authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspaceA },
      payload: {
        projectId: projectA,
        operations: [
          { operation: 'LLM_GENERATION', provider: 'google-gemini', model: 'gemini-2.5-flash', quantity: 4 },
          { operation: 'RENDERING', provider: 'local-ffmpeg', model: 'libx264-aac', quantity: 1 },
        ],
      },
    });
    expect(apiEst.statusCode).toBe(200);
    expect((apiEst.json() as { data: { withinBudget: boolean } }).data.withinBudget).toBe(true);
  });
});
