import { describe, expect, it } from 'vitest';
import { detectMimeTypeFromMagicBytes } from '@ai-content-os/shared';
import { buildApiServer } from '../server.js';

describe('@ai-content-os/api Phase 2 End-to-End AI Production Pipeline', () => {
  const suffix = Date.now();
  const email = `producer.${suffix}@aicontent.studio`;
  let accessToken = '';
  let workspaceId = '';
  let projectId = '';
  let assetId = '';
  let conversationId = '';
  let workflowId = '';
  let compositionId = '';
  let renderJobId = '';

  it('completes Upload -> Analyze -> Plan -> Script -> Storyboard/Compose -> Render -> Visual QA Auto-Revise -> Conversational Revise -> Undo/Redo -> Human Approval', async () => {
    const app = await buildApiServer();

    // 1. Register producer account & workspace
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'ProducerSecurePassword!2026',
        fullName: 'Phase 2 Producer',
        workspaceName: 'AI Production Engine Studio',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regData = regRes.json() as {
      data: { accessToken: string; activeWorkspaceId: string };
    };
    accessToken = regData.data.accessToken;
    workspaceId = regData.data.activeWorkspaceId;

    // 2. Create project & conversation
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        name: 'Autonomous Reels Production Project',
        description: 'End-to-end Phase 2 verification campaign',
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = (projRes.json() as { data: { id: string } }).data.id;

    const convRes = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        projectId,
        title: 'Phase 2 Production Session',
      },
    });
    expect(convRes.statusCode).toBe(201);
    conversationId = (convRes.json() as { data: { id: string } }).data.id;

    // 3. Upload raw MP4 video clip to MinIO
    const initUpload = await app.inject({
      method: 'POST',
      url: '/api/v1/assets/upload-url',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        originalName: 'raw-podcast-clip-01.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 24,
        projectId,
        folderPath: '/podcast-clips',
        tags: ['podcast', 'raw'],
      },
    });
    expect(initUpload.statusCode).toBe(201);
    assetId = (initUpload.json() as { data: { asset: { id: string } } }).data.asset.id;

    const mp4HeaderPayload = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02,
      0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${assetId}/upload`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
        'Content-Type': 'video/mp4',
      },
      payload: mp4HeaderPayload,
    });
    expect(putRes.statusCode).toBe(200);

    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${assetId}/complete`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: { durationSec: 15, width: 1080, height: 1920, fps: 30 },
    });
    expect(completeRes.statusCode).toBe(200);

    // 4. Analyze Asset (Thumbnail + Waveform derivatives, STT word-timestamped Transcript, Scene cuts)
    const analyzeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${assetId}/analyze`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(analyzeRes.statusCode).toBe(200);
    const analyzedAsset = analyzeRes.json() as {
      data: {
        aiSummary: string;
        derivatives: Array<{ derivativeType: string }>;
        transcript: { fullText: string; segmentsJson: unknown[] };
        scenes: Array<{ sceneIndex: number; hookScore: number }>;
      };
    };
    expect(analyzedAsset.data.derivatives).toHaveLength(2);
    expect(analyzedAsset.data.transcript.fullText.length).toBeGreaterThan(10);
    expect(analyzedAsset.data.scenes).toHaveLength(3);
    expect(analyzedAsset.data.scenes[0]?.hookScore).toBeGreaterThanOrEqual(0.9);

    // 5. Execute Autonomous Production Workflow with Visual QA Auto-Revision (simulateDefectsOnce: true)
    const produceRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/produce',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        projectId,
        conversationId,
        userPrompt:
          'Create an engaging Instagram Reel from our podcast clip with a strong 3-second hook and dynamic word-synced captions.',
        targetPlatform: 'INSTAGRAM_REELS',
        templateId: 'instagram-reel',
        simulateDefectsOnce: true,
      },
    });

    expect(produceRes.statusCode).toBe(201);
    const prodBody = produceRes.json() as {
      success: boolean;
      meta: { isSimulated: boolean };
      data: {
        workflow: {
          id: string;
          stage: string;
          status: string;
          qaIterationCount: number;
          planJson: Record<string, unknown>;
          scriptJson: Record<string, unknown>;
          steps: Array<{ stage: string }>;
          agentRuns: Array<{ agent: string; isSimulated: boolean }>;
        };
        compositionId: string;
        compositionVersion: { id: string; versionNumber: number };
        renderJob: {
          id: string;
          status: string;
          outputSizeBytes: number;
          downloadUrl: string;
          qaFrameUrls: string[];
        };
        qaReport: { passed: boolean; overallScore: number; defects: unknown[] };
      };
    };

    expect(prodBody.success).toBe(true);
    // Workflow must pause at AWAITING_APPROVAL after completing the auto-revision cycle
    expect(prodBody.data.workflow.stage).toBe('AWAITING_APPROVAL');
    expect(prodBody.data.workflow.status).toBe('PAUSED_APPROVAL');
    expect(prodBody.data.workflow.qaIterationCount).toBe(1);
    // Version 1 had a caption safe-zone defect -> QA Agent auto-patched to Version 2!
    expect(prodBody.data.compositionVersion.versionNumber).toBe(2);
    expect(prodBody.data.qaReport.passed).toBe(true);
    expect(prodBody.data.qaReport.overallScore).toBe(100);
    expect(prodBody.data.renderJob.status).toBe('COMPLETED');
    expect(prodBody.data.renderJob.outputSizeBytes).toBeGreaterThan(100);
    expect(prodBody.data.renderJob.qaFrameUrls).toHaveLength(3);

    workflowId = prodBody.data.workflow.id;
    compositionId = prodBody.data.compositionId;
    renderJobId = prodBody.data.renderJob.id;

    // Download the rendered MP4 and first QA PNG frame directly from MinIO presigned URLs and verify magic bytes
    const mp4DownloadRes = await fetch(prodBody.data.renderJob.downloadUrl);
    expect(mp4DownloadRes.ok).toBe(true);
    const mp4Bytes = new Uint8Array(await mp4DownloadRes.arrayBuffer());
    expect(detectMimeTypeFromMagicBytes(mp4Bytes)).toBe('video/mp4');

    const frameDownloadRes = await fetch(prodBody.data.renderJob.qaFrameUrls[0]!);
    expect(frameDownloadRes.ok).toBe(true);
    const frameBytes = new Uint8Array(await frameDownloadRes.arrayBuffer());
    expect(detectMimeTypeFromMagicBytes(frameBytes)).toBe('image/png');

    // 6. Conversational Revision ('Make captions larger and use a stronger hook') -> creates Version 3
    const reviseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workflows/${workflowId}/revise`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        instruction: 'Make captions larger and use a stronger hook',
      },
    });
    expect(reviseRes.statusCode).toBe(200);
    const reviseData = reviseRes.json() as {
      data: {
        workflow: { stage: string };
        compositionVersion: { versionNumber: number };
        qaReport: { passed: boolean };
      };
    };
    expect(reviseData.data.compositionVersion.versionNumber).toBe(3);
    expect(reviseData.data.workflow.stage).toBe('AWAITING_APPROVAL');
    expect(reviseData.data.qaReport.passed).toBe(true);

    // 7. Verify Composition Undo (v3 -> v2) and Redo (v2 -> v3)
    const undoRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/undo`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(undoRes.statusCode).toBe(200);
    expect(
      (undoRes.json() as { data: { version: { versionNumber: number } } }).data.version
        .versionNumber,
    ).toBe(2);

    const redoRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/redo`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(redoRes.statusCode).toBe(200);
    expect(
      (redoRes.json() as { data: { version: { versionNumber: number } } }).data.version
        .versionNumber,
    ).toBe(3);

    // 8. Verify RenderJob inspection endpoint
    const renderDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/renders/${renderJobId}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(renderDetailRes.statusCode).toBe(200);

    // 9. Human Approval Gate: Approve workflow (`AWAITING_APPROVAL` -> `APPROVED`)
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workflows/${workflowId}/approve`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const approvedWf = approveRes.json() as {
      data: { stage: string; status: string; approvedByUserId: string; approvedAt: string };
    };
    expect(approvedWf.data.stage).toBe('APPROVED');
    expect(approvedWf.data.status).toBe('COMPLETED');
    expect(approvedWf.data.approvedByUserId).toBeTruthy();
    expect(approvedWf.data.approvedAt).toBeTruthy();

    await app.close();
  });
});
