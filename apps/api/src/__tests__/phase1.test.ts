import { describe, expect, it } from 'vitest';
import { buildApiServer } from '../server.js';

describe('@ai-content-os/api Phase 1 full integration (Auth, RBAC, Tenant Isolation, Projects, MinIO Assets, Dashboard, AI Studio & SSE)', () => {
  const uniqueSuffix = Date.now();
  const aliceEmail = `alice.${uniqueSuffix}@aicontent.studio`;
  const bobEmail = `bob.${uniqueSuffix}@aicontent.studio`;

  let aliceAccessToken = '';
  let aliceRefreshToken = '';
  let aliceWorkspaceId = '';

  let bobAccessToken = '';
  let bobWorkspaceId = '';

  let projectId = '';
  let assetId = '';
  let conversationId = '';
  let workflowId = '';

  it('1. registers Alice and Bob, logs in, rotates refresh tokens, and prevents secret leakage', async () => {
    const app = await buildApiServer();

    const regAlice = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: aliceEmail,
        password: 'AliceSecurePassword!2026',
        fullName: 'Alice Director',
        workspaceName: 'Alice Creative Lab',
      },
    });

    expect(regAlice.statusCode).toBe(201);
    const aliceBody = regAlice.json() as {
      success: boolean;
      data: {
        user: Record<string, unknown>;
        workspaces: Array<{ id: string; role: string }>;
        activeWorkspaceId: string;
        accessToken: string;
        refreshToken: string;
      };
    };
    expect(aliceBody.success).toBe(true);
    expect(aliceBody.data.user['passwordHash']).toBeUndefined();
    aliceAccessToken = aliceBody.data.accessToken;
    aliceRefreshToken = aliceBody.data.refreshToken;
    aliceWorkspaceId = aliceBody.data.activeWorkspaceId;
    expect(aliceWorkspaceId).toBeTruthy();

    // Register Bob in a separate isolated tenant workspace
    const regBob = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: bobEmail,
        password: 'BobSecurePassword!2026',
        fullName: 'Bob Competitor',
        workspaceName: 'Bob Studio',
      },
    });
    expect(regBob.statusCode).toBe(201);
    const bobBody = regBob.json() as {
      data: { accessToken: string; activeWorkspaceId: string };
    };
    bobAccessToken = bobBody.data.accessToken;
    bobWorkspaceId = bobBody.data.activeWorkspaceId;

    // Test refresh token rotation for Alice
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: aliceRefreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const rotated = refreshRes.json() as {
      data: { accessToken: string; refreshToken: string };
    };
    expect(rotated.data.refreshToken).not.toBe(aliceRefreshToken);

    // Reusing the old rotated refresh token must fail and revoke the family
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: aliceRefreshToken },
    });
    expect(replayRes.statusCode).toBe(401);

    // Log Alice back in to get a fresh session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: aliceEmail,
        password: 'AliceSecurePassword!2026',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json() as {
      data: { accessToken: string; refreshToken: string };
    };
    aliceAccessToken = loginBody.data.accessToken;
    aliceRefreshToken = loginBody.data.refreshToken;

    // Verify /api/v1/auth/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: `Bearer ${aliceAccessToken}` },
    });
    expect(meRes.statusCode).toBe(200);

    await app.close();
  });

  it('2. enforces strict tenant isolation and RBAC invitation permissions', async () => {
    const app = await buildApiServer();

    // Bob attempts to read Alice's workspace -> 403 Forbidden
    const unauthorizedWs = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${aliceWorkspaceId}`,
      headers: { Authorization: `Bearer ${bobAccessToken}` },
    });
    expect(unauthorizedWs.statusCode).toBe(403);

    // Alice invites Bob to Alice's workspace as a VIEWER
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${aliceWorkspaceId}/invitations`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        email: bobEmail,
        role: 'VIEWER',
      },
    });
    expect(inviteRes.statusCode).toBe(201);
    const inviteBody = inviteRes.json() as { data: { inviteToken: string } };
    expect(inviteBody.data.inviteToken).toBeTruthy();

    // Bob accepts the invitation
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/invitations/accept',
      headers: { Authorization: `Bearer ${bobAccessToken}` },
      payload: { token: inviteBody.data.inviteToken },
    });
    expect(acceptRes.statusCode).toBe(200);

    // Now Bob can read Alice's workspace as VIEWER
    const viewerRead = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${aliceWorkspaceId}`,
      headers: { Authorization: `Bearer ${bobAccessToken}` },
    });
    expect(viewerRead.statusCode).toBe(200);

    // But Bob (VIEWER) is forbidden from creating a project in Alice's workspace (requires EDITOR)
    const viewerWrite = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        Authorization: `Bearer ${bobAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        name: 'Unauthorized Viewer Project',
      },
    });
    expect(viewerWrite.statusCode).toBe(403);

    await app.close();
  });

  it('3. manages projects (create, update, archive, restore, safeguarded delete)', async () => {
    const app = await buildApiServer();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        name: 'Q4 Podcast Reels Campaign',
        description: '40 raw clips transformed into 10 Reels',
      },
    });
    expect(createRes.statusCode).toBe(201);
    projectId = (createRes.json() as { data: { id: string } }).data.id;

    // Safeguard: cannot delete active project without archiving first or confirmDelete=true
    const unsafeDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
    });
    expect(unsafeDelete.statusCode).toBe(400);

    // Archive and restore project
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/archive`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect((archiveRes.json() as { data: { status: string } }).data.status).toBe('ARCHIVED');

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect((restoreRes.json() as { data: { status: string } }).data.status).toBe('ACTIVE');

    await app.close();
  });

  it('4. uploads assets to MinIO, validates magic bytes, generates download URLs, and blocks cross-tenant access', async () => {
    const app = await buildApiServer();

    const initUpload = await app.inject({
      method: 'POST',
      url: '/api/v1/assets/upload-url',
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        originalName: '../../podcast-cover.png',
        mimeType: 'image/png',
        sizeBytes: 16,
        projectId,
        folderPath: 'podcast/covers',
        tags: ['brand', 'cover'],
      },
    });
    expect(initUpload.statusCode).toBe(201);
    const uploadData = initUpload.json() as {
      data: { asset: { id: string; originalName: string; folderPath: string }; uploadUrl: string };
    };
    assetId = uploadData.data.asset.id;
    // Filename traversal must be sanitized
    expect(uploadData.data.asset.originalName).toBe('podcast-cover.png');
    expect(uploadData.data.asset.folderPath).toBe('/podcast/covers');

    // Upload real PNG binary payload
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${assetId}/upload`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
        'Content-Type': 'image/png',
      },
      payload: validPngBuffer,
    });
    expect(putRes.statusCode).toBe(200);

    // Complete upload & trigger server-side magic-byte inspection in MinIO
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${assetId}/complete`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        width: 1080,
        height: 1080,
      },
    });
    expect(completeRes.statusCode).toBe(200);
    const finalizedAsset = completeRes.json() as {
      data: { status: string; downloadUrl: string };
    };
    expect(finalizedAsset.data.status).toBe('READY');
    expect(finalizedAsset.data.downloadUrl).toContain('X-Amz-Signature=');

    // Verify Asset cannot be fetched under Bob's private workspace
    const crossTenantAsset = await app.inject({
      method: 'GET',
      url: `/api/v1/assets/${assetId}`,
      headers: {
        Authorization: `Bearer ${bobAccessToken}`,
        'X-Workspace-Id': bobWorkspaceId,
      },
    });
    expect(crossTenantAsset.statusCode).toBe(404);

    await app.close();
  });

  it('5. serves real dashboard telemetry, creates AI Studio conversation, triggers persistent workflow, and streams SSE', async () => {
    const app = await buildApiServer();

    const convRes = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        projectId,
        title: 'Episode 1 Reels Edit Session',
      },
    });
    expect(convRes.statusCode).toBe(201);
    conversationId = (convRes.json() as { data: { id: string } }).data.id;

    // Send prompt in AI Studio conversation -> creates persistent messages & Workflow
    const msgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
      payload: {
        content: 'Create 5 Instagram Reels with dynamic captions and strong 3-second hooks.',
      },
    });
    expect(msgRes.statusCode).toBe(201);
    const msgData = msgRes.json() as {
      data: {
        userMessage: { id: string };
        assistantMessage: { id: string };
        workflow: { id: string; stage: string };
      };
    };
    workflowId = msgData.data.workflow.id;
    expect(msgData.data.workflow.stage).toBe('PLANNING');

    // Verify SSE stream endpoint returns real-time workflow snapshot
    const sseRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workflows/${workflowId}/stream?once=true`,
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
    });
    expect(sseRes.statusCode).toBe(200);
    expect(sseRes.headers['content-type']).toContain('text/event-stream');
    expect(sseRes.body).toContain('event: workflow.update');
    expect(sseRes.body).toContain(workflowId);

    // Verify Dashboard returns real aggregated counts for Alice's workspace
    const dashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: {
        Authorization: `Bearer ${aliceAccessToken}`,
        'X-Workspace-Id': aliceWorkspaceId,
      },
    });
    expect(dashRes.statusCode).toBe(200);
    const dashData = dashRes.json() as {
      data: {
        stats: { totalProjects: number; totalAssets: number; totalStorageBytes: number };
        recentProjects: unknown[];
        recentConversations: unknown[];
        processingJobs: unknown[];
      };
    };
    expect(dashData.data.stats.totalProjects).toBe(1);
    expect(dashData.data.stats.totalAssets).toBe(1);
    expect(dashData.data.stats.totalStorageBytes).toBe(16);
    expect(dashData.data.recentConversations).toHaveLength(1);
    expect(dashData.data.processingJobs).toHaveLength(1);

    await app.close();
  });
});
