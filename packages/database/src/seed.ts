import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { CompositionSpec, CompositionSpecSchema } from '@ai-content-os/shared';
import { prisma } from './client.js';
import { encryptSecret } from './encryption.js';

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function seedDatabase(): Promise<{
  userId: string;
  workspaceId: string;
  projectId: string;
  compositionId: string;
}> {
  const demoPasswordHash = createHash('sha256').update('DemoStudioPass!2026').digest('hex');

  const user = await prisma.user.upsert({
    where: { email: 'founder@aicontent.studio' },
    update: { fullName: 'Studio Founder' },
    create: {
      email: 'founder@aicontent.studio',
      passwordHash: demoPasswordHash,
      fullName: 'Studio Founder',
      isSystemAdmin: true,
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'ai-content-studio-hq' },
    update: { name: 'AI Content Studio HQ' },
    create: {
      name: 'AI Content Studio HQ',
      slug: 'ai-content-studio-hq',
      planTier: 'ENTERPRISE',
      monthlyTokenQuota: 10000000,
      monthlyRenderMinutesQuota: 600,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: { role: 'OWNER' },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
    },
  });

  await prisma.brandKit.upsert({
    where: { workspaceId: workspace.id },
    update: {
      brandName: 'AI Content Studio Brand',
    },
    create: {
      workspaceId: workspace.id,
      brandName: 'AI Content Studio Brand',
      primaryColor: '#6366F1',
      secondaryColor: '#09090B',
      accentColor: '#22D3EE',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      toneOfVoice: 'High-clarity, authoritative, builder-focused',
      editingStyle: 'Fast hook in first 3 seconds, word-synced captions, punchy spring transitions',
      captionStyleJson: {
        style: 'word-highlight',
        fontSizePx: 56,
        highlightColor: '#22D3EE',
        safeBottomMarginPx: 220,
      },
      musicPreferences: {
        genres: ['electronic-ambient', 'lofi-beats'],
        duckingDb: -14,
      },
      targetAudience: 'Creators, SaaS Founders, Marketing Teams',
      contentObjectives: 'High-retention short-form Reels, TikToks, and YouTube Shorts',
    },
  });

  const existingProject = await prisma.project.findFirst({
    where: {
      workspaceId: workspace.id,
      name: 'Founder Podcast Launch Campaign',
    },
  });

  const project =
    existingProject ??
    (await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        createdById: user.id,
        name: 'Founder Podcast Launch Campaign',
        description:
          'Multi-platform short-form Reels, TikToks, and YouTube Shorts generated from raw podcast clips.',
        status: 'ACTIVE',
      },
    }));

  const initialCompositionSpec: CompositionSpec = CompositionSpecSchema.parse({
    schemaVersion: '1.0',
    templateId: 'instagram-reel',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 450,
    brand: {
      primaryColor: '#6366F1',
      secondaryColor: '#09090B',
      accentColor: '#22D3EE',
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    captions: {
      enabled: true,
      style: 'word-highlight',
      fontSizePx: 56,
      highlightColor: '#22D3EE',
      safeBottomMarginPx: 220,
    },
    audio: {
      musicVolume: 0.15,
      duckingEnabled: true,
    },
    scenes: [
      {
        id: 'scene-hook-01',
        orderIndex: 0,
        startFrame: 0,
        durationInFrames: 90,
        layout: 'talking-head',
        trimStartSec: 0,
        headlineText: 'Why 90% of Video Workflows Fail',
        narrationText: 'Most teams spend 6 hours editing a single 30-second clip manually.',
        transitionIn: 'zoom-punch',
        overlays: [
          {
            id: 'overlay-headline-01',
            component: 'AnimatedHeadline',
            startOffsetFrames: 0,
            durationInFrames: 90,
            props: {
              text: 'Why 90% of Video Workflows Fail',
              accentColor: '#22D3EE',
            },
          },
        ],
      },
      {
        id: 'scene-body-02',
        orderIndex: 1,
        startFrame: 90,
        durationInFrames: 270,
        layout: 'podcast-split',
        trimStartSec: 3,
        headlineText: 'Autonomous 9-Agent Pipeline',
        narrationText:
          'Describe your outcome in plain English and let Remotion + Vision QA handle the rest.',
        transitionIn: 'spring-slide',
        overlays: [
          {
            id: 'overlay-captions-02',
            component: 'WordSyncedCaptions',
            startOffsetFrames: 0,
            durationInFrames: 270,
            props: {
              highlightColor: '#22D3EE',
            },
          },
        ],
      },
      {
        id: 'scene-cta-03',
        orderIndex: 2,
        startFrame: 360,
        durationInFrames: 90,
        layout: 'full-bleed',
        trimStartSec: 0,
        headlineText: 'Describe it. Create it. Publish it.',
        narrationText: 'Start your next campaign inside AI Content Studio.',
        transitionIn: 'fade',
        overlays: [
          {
            id: 'overlay-cta-03',
            component: 'CallToActionScene',
            startOffsetFrames: 0,
            durationInFrames: 90,
            props: {
              ctaText: 'Follow for Episode 2',
            },
          },
        ],
      },
    ],
  });

  const existingComposition = await prisma.composition.findFirst({
    where: {
      workspaceId: workspace.id,
      projectId: project.id,
      title: 'Episode 1 — Hook Reel #1',
    },
  });

  const composition =
    existingComposition ??
    (await prisma.composition.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        title: 'Episode 1 — Hook Reel #1',
        targetPlatform: 'INSTAGRAM_REELS',
        aspectRatio: 'PORTRAIT_9_16',
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 450,
      },
    }));

  const version1 = await prisma.compositionVersion.upsert({
    where: {
      compositionId_versionNumber: {
        compositionId: composition.id,
        versionNumber: 1,
      },
    },
    update: {
      specJson: toInputJson(initialCompositionSpec),
    },
    create: {
      compositionId: composition.id,
      versionNumber: 1,
      specJson: toInputJson(initialCompositionSpec),
      changeSummary: 'Initial AI Studio composition specification (v1)',
      createdByType: 'AI_AGENT',
      createdById: user.id,
    },
  });

  await prisma.composition.update({
    where: { id: composition.id },
    data: { currentVersionId: version1.id },
  });

  // Seed a sample encrypted Postiz social account connection
  const encryptedToken = encryptSecret('postiz_simulated_oauth_access_token_demo');
  await prisma.socialAccount.upsert({
    where: {
      workspaceId_platform_externalAccountId: {
        workspaceId: workspace.id,
        platform: 'INSTAGRAM_REELS',
        externalAccountId: 'postiz-ig-demo-001',
      },
    },
    update: {
      encryptedAccessToken: encryptedToken,
    },
    create: {
      workspaceId: workspace.id,
      platform: 'INSTAGRAM_REELS',
      accountName: 'AI Content Studio Official',
      accountHandle: '@aicontentstudio',
      externalAccountId: 'postiz-ig-demo-001',
      encryptedAccessToken: encryptedToken,
      status: 'CONNECTED',
    },
  });

  return {
    userId: user.id,
    workspaceId: workspace.id,
    projectId: project.id,
    compositionId: composition.id,
  };
}

const isDirectExecution =
  process.argv[1] !== undefined && process.argv[1].endsWith('seed.ts');

if (isDirectExecution) {
  seedDatabase()
    .then((result) => {
      console.log('Database seed completed successfully:', JSON.stringify(result));
      return prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error('Database seed failed:', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
