import { describe, expect, it } from 'vitest';
import { buildApiServer } from '../server.js';

describe('@ai-content-os/api Phase 3 Advanced Creative Workflows End-to-End', () => {
  const suffix = Date.now();
  const email = `creative.${suffix}@aicontent.studio`;
  let accessToken = '';
  let workspaceId = '';
  let projectId = '';
  let sourceAssetId = '';
  let compositionId = '';

  it('completes Upload Long-Form -> Analyze -> Repurpose Short-Form Batch -> Timeline & Granular AI Scene Edits -> Brand Kit Application -> Aspect Ratio & Subtitles -> Render & Media Inspection -> Version Diff Comparison -> Comments & Approval', async () => {
    const app = await buildApiServer();

    // 1. Register user & workspace
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'CreativePassword!2026',
        fullName: 'Phase 3 Creative Lead',
        workspaceName: 'Advanced Creative Studio',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regData = regRes.json() as {
      data: { accessToken: string; activeWorkspaceId: string };
    };
    accessToken = regData.data.accessToken;
    workspaceId = regData.data.activeWorkspaceId;

    // 2. Create project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        name: 'Keynote Repurposing Campaign',
        description: '45-minute keynote repurposed into multi-platform shorts',
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = (projRes.json() as { data: { id: string } }).data.id;

    // 3. Upload & analyze long-form MP4 video asset
    const initUpload = await app.inject({
      method: 'POST',
      url: '/api/v1/assets/upload-url',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        originalName: 'founder-keynote-longform.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 24,
        projectId,
        folderPath: '/keynotes',
        tags: ['longform', 'keynote'],
      },
    });
    expect(initUpload.statusCode).toBe(201);
    sourceAssetId = (initUpload.json() as { data: { asset: { id: string } } }).data.asset.id;

    const mp4Payload = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02,
      0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assets/${sourceAssetId}/upload`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
        'Content-Type': 'video/mp4',
      },
      payload: mp4Payload,
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${sourceAssetId}/complete`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: { durationSec: 180, width: 1920, height: 1080, fps: 30 },
    });

    const analyzeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${sourceAssetId}/analyze`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(analyzeRes.statusCode).toBe(200);

    // 4. Configure Workspace Brand Kit
    const bkRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/brand-kit',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        brandName: 'Keynote Brand Identity',
        primaryColor: '#8B5CF6',
        secondaryColor: '#09090B',
        accentColor: '#10B981',
        headingFont: 'Plus Jakarta Sans',
        bodyFont: 'Inter',
        toneOfVoice: 'Bold, visionary, technical',
        editingStyle: 'Dynamic kinetic typography with fast cuts',
        captionStyle: 'karaoke-pop',
        captionFontSizePx: 60,
      },
    });
    expect(bkRes.statusCode).toBe(200);

    // 5. Repurpose Long-Form Video into Multi-Platform Short-Form Clips, Quote Graphics & Written Posts
    const repurposeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/repurpose',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        projectId,
        sourceAssetId,
        campaignTitle: 'Keynote Multi-Platform Wave',
        creativeBrief: 'Highlight autonomous video editing and Remotion composition compilation',
        targets: [
          {
            platform: 'INSTAGRAM_REELS',
            aspectRatio: 'PORTRAIT_9_16',
            templateId: 'instagram-reel',
            count: 1,
          },
          {
            platform: 'TIKTOK',
            aspectRatio: 'PORTRAIT_9_16',
            templateId: 'tiktok-short',
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
    expect(repurposeRes.statusCode).toBe(201);
    const repurposeData = repurposeRes.json() as {
      data: {
        compositions: Array<{ id: string; targetPlatform: string; downloadUrl: string }>;
        quoteGraphics: unknown[];
        writtenPosts: unknown[];
      };
    };
    expect(repurposeData.data.compositions).toHaveLength(3);
    expect(repurposeData.data.quoteGraphics).toHaveLength(2);
    expect(repurposeData.data.writtenPosts).toHaveLength(2);
    compositionId = repurposeData.data.compositions[0]!.id;

    // 6. Granular AI-Powered Single-Scene Edit on Scene #1 (`scene-hook-1`) -> creates Version 2
    const granularRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/scenes/scene-hook-1/ai-edit`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        instruction: 'Use whip-pan transition and stronger 3-second hook headline',
        headlineText: 'Why Autonomous Video Editing Wins in 2026',
        transitionIn: 'whip-pan',
        addOverlayComponent: 'KineticTypography',
      },
    });
    expect(granularRes.statusCode).toBe(200);
    const granularBody = granularRes.json() as {
      data: { version: { versionNumber: number } };
    };
    expect(granularBody.data.version.versionNumber).toBe(2);

    // 7. Multi-Track Timeline Edit (Add scene, trim clip, update audio & captions) -> creates Version 3
    const timelinePatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/patch`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        changeSummary: 'Added proof B-roll scene and adjusted audio ducking',
        patches: [
          {
            op: 'ADD_SCENE',
            insertAtIndex: 2,
            scene: {
              id: 'scene-broll-proof',
              durationInFrames: 90,
              layout: 'b-roll-overlay',
              primaryAssetId: sourceAssetId,
              trimStartSec: 12,
              headlineText: 'Live Telemetry & QA Verification',
              narrationText: 'Every frame is inspected automatically before publishing.',
              transitionIn: 'spring-slide',
              overlays: [],
            },
          },
          {
            op: 'UPDATE_AUDIO',
            patch: { musicVolume: 0.22, duckingEnabled: true },
          },
        ],
      },
    });
    expect(timelinePatchRes.statusCode).toBe(201);
    expect(
      (timelinePatchRes.json() as { data: { version: { versionNumber: number } } }).data.version
        .versionNumber,
    ).toBe(3);

    // 8. Adapt Aspect Ratio to 1:1 Square -> creates Version 4
    const aspectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/aspect-ratio`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        aspectRatio: 'SQUARE_1_1',
        targetPlatform: 'LINKEDIN',
        templateId: 'data-explainer',
      },
    });
    expect(aspectRes.statusCode).toBe(200);
    expect(
      (aspectRes.json() as { data: { version: { versionNumber: number } } }).data.version
        .versionNumber,
    ).toBe(4);

    // 9. Update Brand Kit and re-apply to Composition -> creates Version 5
    await app.inject({
      method: 'PUT',
      url: '/api/v1/brand-kit',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        brandName: 'Keynote Brand Identity v2',
        primaryColor: '#EC4899',
        secondaryColor: '#09090B',
        accentColor: '#F59E0B',
        headingFont: 'Poppins',
        bodyFont: 'Inter',
        toneOfVoice: 'High-impact executive summary',
        editingStyle: 'Punchy kinetic cuts',
        captionStyle: 'karaoke-pop',
        captionFontSizePx: 64,
      },
    });

    const applyBkRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/apply-brand-kit`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(applyBkRes.statusCode).toBe(200);
    expect(
      (applyBkRes.json() as { data: { version: { versionNumber: number } } }).data.version
        .versionNumber,
    ).toBe(5);

    // 10. Render Version 5 & Run Binary Media + Subtitle Inspection
    const renderRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/render`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(renderRes.statusCode).toBe(201);

    const mediaInspectRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compositions/${compositionId}/media-inspection`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(mediaInspectRes.statusCode).toBe(200);
    const mediaReport = mediaInspectRes.json() as {
      data: {
        mp4Inspection: {
          valid: boolean;
          majorBrand: string;
          width: number;
          height: number;
          hasValidKeyframeStream: boolean;
          audioSyncValid: boolean;
        };
        captionSync: { synchronized: boolean };
        subtitlesSrt: string;
        subtitlesVtt: string;
      };
    };
    expect(mediaReport.data.mp4Inspection.valid).toBe(true);
    expect(mediaReport.data.mp4Inspection.majorBrand).toBe('isom');
    expect(mediaReport.data.mp4Inspection.width).toBe(1080);
    expect(mediaReport.data.mp4Inspection.height).toBe(1080);
    expect(mediaReport.data.mp4Inspection.hasValidKeyframeStream).toBe(true);
    expect(mediaReport.data.mp4Inspection.audioSyncValid).toBe(true);
    expect(mediaReport.data.captionSync.synchronized).toBe(true);
    expect(mediaReport.data.subtitlesSrt).toContain('-->');
    expect(mediaReport.data.subtitlesVtt).toContain('WEBVTT');

    // 11. Compare Version 1 vs Version 5
    const compareRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compositions/${compositionId}/compare?fromVersion=1&toVersion=5`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(compareRes.statusCode).toBe(200);
    const compareData = compareRes.json() as {
      data: {
        diff: {
          dimensionsChanged: boolean;
          brandChanges: string[];
          captionChanges: string[];
          audioChanges: string[];
          totalChangesCount: number;
        };
      };
    };
    expect(compareData.data.diff.dimensionsChanged).toBe(true);
    expect(compareData.data.diff.brandChanges.length).toBeGreaterThanOrEqual(2);
    expect(compareData.data.diff.captionChanges.length).toBeGreaterThanOrEqual(1);
    expect(compareData.data.diff.audioChanges.length).toBeGreaterThanOrEqual(1);
    expect(compareData.data.diff.totalChangesCount).toBeGreaterThanOrEqual(5);

    // 12. Add Collaboration Comment, Resolve Comment, and Approve Composition
    const commentRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/comments`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        versionNumber: 5,
        sceneId: 'scene-hook-1',
        frameIndex: 15,
        content: 'Hook transition and Brand Kit v2 colors look great—ready to approve!',
      },
    });
    expect(commentRes.statusCode).toBe(201);
    const commentId = (commentRes.json() as { data: { id: string } }).data.id;

    const resolveRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/compositions/${compositionId}/comments/${commentId}/resolve`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect((resolveRes.json() as { data: { resolved: boolean } }).data.resolved).toBe(true);

    const approveCompRes = await app.inject({
      method: 'POST',
      url: `/api/v1/compositions/${compositionId}/approve`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(approveCompRes.statusCode).toBe(200);
    expect(
      (approveCompRes.json() as { data: { approvalStatus: string } }).data.approvalStatus,
    ).toBe('APPROVED');

    await app.close();
  });
});
