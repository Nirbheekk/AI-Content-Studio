import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { buildApiServer } from '../server.js';
import { signMediaStreamToken, verifyMediaStreamToken } from '../lib/media-token.js';

function makeMinimalMp4Bytes(size = 4096): Uint8Array {
  const buf = new Uint8Array(size);
  // Minimal ISO BMFF ftyp box header
  buf[0] = 0x00;
  buf[1] = 0x00;
  buf[2] = 0x00;
  buf[3] = 0x18;
  buf[4] = 0x66; // f
  buf[5] = 0x74; // t
  buf[6] = 0x79; // y
  buf[7] = 0x70; // p
  buf[8] = 0x69; // i
  buf[9] = 0x73; // s
  buf[10] = 0x6f; // o
  buf[11] = 0x6d; // m
  for (let i = 12; i < size; i++) {
    buf[i] = i % 251;
  }
  return buf;
}

describe('Phase 12 — Video Streaming, HTTP Range & Tenant Isolation', () => {
  let app: FastifyInstance;
  const storage = new MinioStorageAdapter();

  let userAToken = '';
  let workspaceAId = '';
  let projectAId = '';
  let userBToken = '';
  let workspaceBId = '';

  beforeAll(async () => {
    app = await buildApiServer({ storage });
    await app.ready();

    const suffix = randomUUID().slice(0, 8);
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `p12-a-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Phase12 User A',
        workspaceName: `P12 WS A ${suffix}`,
      },
    });
    const bodyA = regA.json() as {
      data: { accessToken: string; activeWorkspaceId: string };
    };
    userAToken = bodyA.data.accessToken;
    workspaceAId = bodyA.data.activeWorkspaceId;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        authorization: `Bearer ${userAToken}`,
        'x-workspace-id': workspaceAId,
      },
      payload: { name: 'Phase 12 Playback Project' },
    });
    projectAId = (projRes.json() as { data: { id: string } }).data.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `p12-b-${suffix}@studio.test`,
        password: 'StrongPassword!123',
        fullName: 'Phase12 User B',
        workspaceName: `P12 WS B ${suffix}`,
      },
    });
    const bodyB = regB.json() as {
      data: { accessToken: string; activeWorkspaceId: string };
    };
    userBToken = bodyB.data.accessToken;
    workspaceBId = bodyB.data.activeWorkspaceId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates media stream tokens and rejects expired or wrong-resource tokens', () => {
    const valid = signMediaStreamToken({
      userId: 'u1',
      workspaceId: 'w1',
      resourceType: 'asset',
      resourceId: 'asset-123',
      ttlSec: 60,
    });
    const decoded = verifyMediaStreamToken(valid, 'asset', 'asset-123');
    expect(decoded.workspaceId).toBe('w1');

    expect(() => verifyMediaStreamToken(valid, 'asset', 'asset-999')).toThrow();
    expect(() => verifyMediaStreamToken(`${valid}tampered`, 'asset', 'asset-123')).toThrow();

    const expired = signMediaStreamToken({
      userId: 'u1',
      workspaceId: 'w1',
      resourceType: 'asset',
      resourceId: 'asset-123',
      ttlSec: -10,
    });
    expect(() => verifyMediaStreamToken(expired, 'asset', 'asset-123')).toThrow(/expired/i);
  });

  it('streams MP4 with 200, 206 partial range, 416 invalid range, attachment download, cross-tenant denial, and post-delete 404', async () => {
    const mp4 = makeMinimalMp4Bytes(4096);
    const key = `workspaces/${workspaceAId}/p12-test-${randomUUID()}.mp4`;
    const bucket = storage.getConfig().rawBucket;

    await storage.putObject({
      bucket,
      storageKey: key,
      body: mp4,
      contentType: 'video/mp4',
    });

    const asset = await prisma.asset.create({
      data: {
        workspaceId: workspaceAId,
        projectId: projectAId,
        folderPath: '/rendered-videos',
        originalName: 'phase12-test-clip.mp4',
        storageKey: key,
        bucketName: bucket,
        mimeType: 'video/mp4',
        assetType: 'VIDEO',
        sizeBytes: BigInt(mp4.byteLength),
        checksumSha256: createHash('sha256').update(mp4).digest('hex'),
        status: 'READY',
        tags: ['rendered-video'],
      },
    });

    // 1. Asset detail returns canonical streamUrl
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${asset.id}`,
      headers: {
        authorization: `Bearer ${userAToken}`,
        'x-workspace-id': workspaceAId,
      },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = detailRes.json() as { data: { streamUrl: string } };
    expect(detailBody.data.streamUrl).toContain(`/api/v1/assets/${asset.id}/stream?token=`);

    // 2. HTTP 200 full video stream via signed streamUrl
    const fullRes = await app.inject({
      method: 'GET',
      url: detailBody.data.streamUrl,
    });
    expect(fullRes.statusCode).toBe(200);
    expect(fullRes.headers['content-type']).toBe('video/mp4');
    expect(fullRes.headers['accept-ranges']).toBe('bytes');
    expect(fullRes.rawPayload.byteLength).toBe(4096);

    // 3. HTTP 206 partial content range request (browser seeking)
    const rangeRes = await app.inject({
      method: 'GET',
      url: detailBody.data.streamUrl,
      headers: { range: 'bytes=0-127' },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers['content-range']).toBe('bytes 0-127/4096');
    expect(rangeRes.rawPayload.byteLength).toBe(128);

    // 4. HTTP 416 unsatisfiable range
    const badRangeRes = await app.inject({
      method: 'GET',
      url: detailBody.data.streamUrl,
      headers: { range: 'bytes=999999-1000000' },
    });
    expect(badRangeRes.statusCode).toBe(416);

    // 5. Authenticated attachment download
    const dlRes = await app.inject({
      method: 'GET',
      url: `${detailBody.data.streamUrl}&download=1`,
    });
    expect(dlRes.statusCode).toBe(200);
    expect(String(dlRes.headers['content-disposition'])).toContain('attachment');

    // 6. Security: Unauthorized request without token or Bearer fails (401)
    const unauthRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${asset.id}/stream`,
    });
    expect(unauthRes.statusCode).toBe(401);

    // 7. Security: Cross-workspace user B cannot stream workspace A's asset (404)
    const crossWsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${asset.id}/stream`,
      headers: {
        authorization: `Bearer ${userBToken}`,
        'x-workspace-id': workspaceBId,
      },
    });
    expect(crossWsRes.statusCode).toBe(404);

    // 8. Deleted asset immediately returns 404 even with previously issued stream token
    await prisma.asset.delete({ where: { id: asset.id } });
    const afterDeleteRes = await app.inject({
      method: 'GET',
      url: detailBody.data.streamUrl,
    });
    expect(afterDeleteRes.statusCode).toBe(404);
  });
});
