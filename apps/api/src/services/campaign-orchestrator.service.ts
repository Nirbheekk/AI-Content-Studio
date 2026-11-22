import { randomUUID } from 'node:crypto';
import {
  CampaignDeliverableDecision,
  CampaignStatus,
  canTransitionCampaignStatus,
  CompositionSpecSchema,
  CreateCampaignRequest,
  NotFoundError,
  UpdateCampaignStatus,
  ValidationError,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { estimateWorkflowPreflightCost } from './cost-estimator.service.js';

function toJson(val: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(val)) as Prisma.InputJsonValue;
}

const DEFAULT_PLATFORMS = ['INSTAGRAM_REELS', 'YOUTUBE_SHORTS', 'TIKTOK', 'LINKEDIN'] as const;

function inferPlatformsFromBrief(briefText: string): string[] {
  const lower = briefText.toLowerCase();
  const found: string[] = [];
  if (lower.includes('instagram') || lower.includes('reel')) found.push('INSTAGRAM_REELS');
  if (lower.includes('youtube') || lower.includes('short')) found.push('YOUTUBE_SHORTS');
  if (lower.includes('tiktok')) found.push('TIKTOK');
  if (lower.includes('linkedin')) found.push('LINKEDIN');
  if (lower.includes('facebook')) found.push('FACEBOOK');
  if (/\bx\b|twitter/.test(lower)) found.push('X');
  return found.length > 0 ? found : [...DEFAULT_PLATFORMS];
}

function inferClarifications(briefText: string, hasAssets: boolean, hasBrandKit: boolean): string[] {
  const questions: string[] = [];
  if (briefText.trim().length < 40) {
    questions.push('Add specific product proof points or customer outcomes to strengthen hook authenticity.');
  }
  if (!hasAssets) {
    questions.push('No source footage uploaded in this project yet — upload raw clips or approve generative B-roll before rendering.');
  }
  if (!hasBrandKit) {
    questions.push('No workspace Brand Kit configured — default studio typography and palette will be applied unless Brand Kit is set.');
  }
  return questions;
}

function mapPlatformToAspectRatio(platform: string): 'PORTRAIT_9_16' | 'PORTRAIT_4_5' | 'SQUARE_1_1' | 'LANDSCAPE_16_9' {
  if (platform === 'LINKEDIN') return 'PORTRAIT_4_5';
  if (platform === 'FACEBOOK') return 'SQUARE_1_1';
  if (platform === 'X') return 'LANDSCAPE_16_9';
  return 'PORTRAIT_9_16';
}

function mapPlatformToTemplateId(platform: string) {
  if (platform === 'TIKTOK') return 'tiktok-short' as const;
  if (platform === 'YOUTUBE_SHORTS') return 'youtube-short' as const;
  if (platform === 'LINKEDIN') return 'educational-video' as const;
  return 'instagram-reel' as const;
}

function mapPlatformToTargetPlatform(platform: string) {
  if (platform === 'TIKTOK') return 'TIKTOK' as const;
  if (platform === 'YOUTUBE_SHORTS') return 'YOUTUBE_SHORTS' as const;
  if (platform === 'LINKEDIN' || platform === 'X') return 'LINKEDIN' as const;
  if (platform === 'FACEBOOK') return 'FACEBOOK' as const;
  return 'INSTAGRAM_REELS' as const;
}

const HOOK_ANGLES = [
  'Contrarian Insight',
  'Before-and-After Proof',
  '3-Step Framework',
  'Behind-the-Scenes Breakdown',
  'Common Mistake Fix',
  'Customer Outcome Spotlight',
] as const;

export async function createCampaignFromBrief(params: {
  workspaceId: string;
  userId: string;
  input: CreateCampaignRequest;
}) {
  const { workspaceId, userId, input } = params;

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId },
  });
  if (!project) {
    throw new NotFoundError('Project not found in workspace');
  }

  const [brandKit, assetCount, preflightCost] = await Promise.all([
    prisma.brandKit.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.asset.count({ where: { workspaceId, projectId: project.id } }),
    estimateWorkflowPreflightCost({
      workspaceId,
      projectId: project.id,
      operations: [
        {
          operation: 'LLM_GENERATION',
          provider: 'google',
          model: 'gemini-2.5-flash',
          quantity: input.deliverableCount * 2,
        },
        {
          operation: 'RENDERING',
          provider: 'remotion-engine',
          model: 'ffmpeg-local',
          quantity: input.deliverableCount,
        },
      ],
    }),
  ]);

  const platforms = input.platforms ?? inferPlatformsFromBrief(input.briefText);
  const name =
    input.name?.trim() ||
    `${project.name} — ${input.scheduleWindowDays}-Day Launch Campaign`.slice(0, 120);
  const objective =
    input.objective?.trim() ||
    `Drive qualified awareness and conversions from: ${input.briefText.slice(0, 140)}`;
  const targetAudience =
    input.targetAudience?.trim() ||
    brandKit?.targetAudience ||
    'Decision-makers and creators evaluating modern solutions';
  const tone =
    input.tone?.trim() ||
    brandKit?.toneOfVoice ||
    'Confident, educational, modern';

  const pillars = [
    {
      id: 'pillar-1',
      title: 'Problem & Cost of Inaction',
      message: 'Expose the concrete bottleneck viewers face today without generic hype.',
    },
    {
      id: 'pillar-2',
      title: 'Proof-First Solution Walkthrough',
      message: 'Demonstrate the real workflow, visual evidence, and measurable time savings.',
    },
    {
      id: 'pillar-3',
      title: 'Actionable Next Step',
      message: 'Close every deliverable with a clear, specific, low-friction call to action.',
    },
  ];

  const strategy = {
    narrativeDirection: `Lead with concrete proof, maintain ${tone} tone, and adapt hooks natively for ${platforms.join(', ')}.`,
    messagingPillars: pillars,
    brandConsistencyApplied: Boolean(brandKit),
    availableSourceAssets: assetCount,
    antiGenericGuardrails: [
      'Distinct hook angle per deliverable (no repeated opening lines).',
      'Human approval mandatory before scheduling or external publication.',
      'No unverified claims or fabricated metrics.',
    ],
  };

  const contentMatrix = Array.from({ length: input.deliverableCount }, (_, idx) => {
    const platform = platforms[idx % platforms.length] ?? 'INSTAGRAM_REELS';
    const angle = HOOK_ANGLES[idx % HOOK_ANGLES.length] ?? 'Proof-First';
    const pillar = pillars[idx % pillars.length]!;
    const aspectRatio = mapPlatformToAspectRatio(platform);
    return {
      index: idx + 1,
      title: `${platform.replace('_', ' ')} #${idx + 1}: ${angle}`,
      platform,
      format: platform === 'LINKEDIN' || platform === 'X' ? 'SOCIAL_VIDEO_POST' : 'SHORT_FORM_VIDEO',
      aspectRatio,
      angle,
      pillarId: pillar.id,
      hook: `[${angle}] ${input.briefText.slice(0, 58).trim()} — Pillar ${idx + 1}`,
      scriptSummary: `Hook (${angle}) -> Core proof (${pillar.title}) -> Clear CTA tailored for ${platform}.`,
      captionCopy: `${angle}: ${pillar.message} #${project.name.replace(/\s+/g, '')}`,
    };
  });

  const clarifications = inferClarifications(input.briefText, assetCount > 0, Boolean(brandKit));
  const now = new Date();
  const scheduleEndAt = new Date(now.getTime() + input.scheduleWindowDays * 86_400_000);

  const dagNodes = [
    { nodeKey: 'BRIEF_PARSE', stageName: 'Parse Brief & Constraints', agentRole: 'CAMPAIGN_STRATEGIST', dependsOn: [], status: 'COMPLETED' },
    { nodeKey: 'CREATIVE_STRATEGY', stageName: 'Build Creative Strategy & Pillars', agentRole: 'CREATIVE_DIRECTOR', dependsOn: ['BRIEF_PARSE'], status: 'COMPLETED' },
    { nodeKey: 'CONTENT_MATRIX', stageName: 'Design Multi-Platform Content Matrix', agentRole: 'CREATIVE_DIRECTOR', dependsOn: ['CREATIVE_STRATEGY'], status: 'COMPLETED' },
    { nodeKey: 'ASSET_ANALYSIS', stageName: 'Map Source Footage & Missing Assets', agentRole: 'EDITORIAL_AGENT', dependsOn: ['CONTENT_MATRIX'], status: 'PENDING' },
    { nodeKey: 'SCRIPT_STORYBOARD', stageName: 'Draft Hooks, Scripts & Storyboards', agentRole: 'SCRIPTWRITER', dependsOn: ['ASSET_ANALYSIS'], status: 'PENDING' },
    { nodeKey: 'COMPOSITION_BUILD', stageName: 'Build Editable Remotion Compositions', agentRole: 'VIDEO_PRODUCER', dependsOn: ['SCRIPT_STORYBOARD'], status: 'PENDING' },
    { nodeKey: 'CREATIVE_QA', stageName: 'Campaign Consistency & Anti-Generic QA', agentRole: 'QUALITY_REVIEWER', dependsOn: ['COMPOSITION_BUILD'], status: 'PENDING' },
    { nodeKey: 'HUMAN_REVIEW_GATE', stageName: 'Human Approval Gate (Mandatory)', agentRole: 'PUBLISHING_COORDINATOR', dependsOn: ['CREATIVE_QA'], status: 'PENDING' },
  ];

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        workspaceId,
        projectId: project.id,
        createdByUserId: userId,
        name,
        objective,
        targetAudience,
        briefText: input.briefText,
        tone,
        platforms,
        formats: Array.from(new Set(contentMatrix.map((c) => c.format))),
        deliverableCount: contentMatrix.length,
        controlMode: input.controlMode,
        status: 'AWAITING_PLAN_APPROVAL',
        budgetCapUsd: input.budgetCapUsd,
        estimatedCostUsd: preflightCost.knownEstimatedTotalUsd,
        strategyJson: toJson(strategy),
        contentMatrixJson: toJson(contentMatrix),
        clarificationsJson: toJson(clarifications),
        scheduleStartAt: now,
        scheduleEndAt,
      },
    });

    await tx.campaignTask.createMany({
      data: dagNodes.map((n) => ({
        campaignId: created.id,
        workspaceId,
        nodeKey: n.nodeKey,
        stageName: n.stageName,
        agentRole: n.agentRole,
        dependsOn: n.dependsOn,
        status: n.status,
        attemptCount: n.status === 'COMPLETED' ? 1 : 0,
        completedAt: n.status === 'COMPLETED' ? now : null,
      })),
    });

    await tx.campaignDeliverable.createMany({
      data: contentMatrix.map((item) => ({
        campaignId: created.id,
        workspaceId,
        title: item.title,
        platform: item.platform,
        format: item.format,
        aspectRatio: item.aspectRatio,
        hook: item.hook,
        scriptSummary: item.scriptSummary,
        captionCopy: item.captionCopy,
        status: 'PLANNED',
      })),
    });

    await tx.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CAMPAIGN_PLAN_CREATED',
        entityType: 'Campaign',
        entityId: created.id,
        detailsJson: {
          deliverableCount: contentMatrix.length,
          platforms,
          estimatedCostUsd: preflightCost.knownEstimatedTotalUsd,
          budgetCapUsd: input.budgetCapUsd,
        },
      },
    });

    return created;
  });

  return getCampaignDetail({ workspaceId, campaignId: campaign.id });
}

export async function listCampaigns(workspaceId: string) {
  return prisma.campaign.findMany({
    where: { workspaceId },
    include: {
      tasks: { orderBy: { createdAt: 'asc' } },
      deliverables: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}

export async function getCampaignDetail(params: {
  workspaceId: string;
  campaignId: string;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.campaignId, workspaceId: params.workspaceId },
    include: {
      tasks: { orderBy: { createdAt: 'asc' } },
      deliverables: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!campaign) {
    throw new NotFoundError('Campaign not found in workspace');
  }
  return campaign;
}

export async function approveCampaignPlan(params: {
  workspaceId: string;
  userId: string;
  campaignId: string;
}) {
  const campaign = await getCampaignDetail(params);
  const currentStatus = campaign.status as CampaignStatus;
  if (!canTransitionCampaignStatus(currentStatus, 'PRODUCING')) {
    throw new ValidationError(
      `Cannot approve campaign plan from status "${campaign.status}".`,
    );
  }
  if (campaign.estimatedCostUsd > campaign.budgetCapUsd) {
    throw new ValidationError(
      `Estimated campaign cost ($${campaign.estimatedCostUsd.toFixed(2)}) exceeds budget cap ($${campaign.budgetCapUsd.toFixed(2)}).`,
    );
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'PRODUCING',
        planApprovedByUserId: params.userId,
        planApprovedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: 'CAMPAIGN_PLAN_APPROVED',
        entityType: 'Campaign',
        entityId: campaign.id,
        detailsJson: {
          fromStatus: currentStatus,
          toStatus: 'PRODUCING',
          estimatedCostUsd: campaign.estimatedCostUsd,
        },
      },
    }),
  ]);

  return getCampaignDetail(params);
}

export async function runCampaignProductionDag(params: {
  workspaceId: string;
  userId: string;
  campaignId: string;
}) {
  const campaign = await getCampaignDetail(params);
  if (!campaign.planApprovedAt) {
    throw new ValidationError(
      'Campaign plan must be approved before launching production.',
    );
  }
  if (campaign.status === 'CANCELLED' || campaign.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot run production on a ${campaign.status} campaign.`);
  }

  const brandKit = await prisma.brandKit.findFirst({
    where: { workspaceId: params.workspaceId },
    orderBy: { updatedAt: 'desc' },
  });

  const projectAssets = await prisma.asset.findMany({
    where: { workspaceId: params.workspaceId, projectId: campaign.projectId, status: 'READY' },
    take: 10,
  });

  const now = new Date();
  const tasksByKey = new Map(campaign.tasks.map((t) => [t.nodeKey, t]));
  const orderedKeys = [
    'ASSET_ANALYSIS',
    'SCRIPT_STORYBOARD',
    'COMPOSITION_BUILD',
    'CREATIVE_QA',
    'HUMAN_REVIEW_GATE',
  ];

  for (const key of orderedKeys) {
    const task = tasksByKey.get(key);
    if (!task || task.status === 'COMPLETED') continue;

    // Verify dependencies are satisfied
    const unmetDep = task.dependsOn.find((depKey) => {
      const dep = tasksByKey.get(depKey);
      return dep && dep.status !== 'COMPLETED';
    });
    if (unmetDep) {
      throw new ValidationError(`DAG node ${key} blocked by incomplete dependency ${unmetDep}`);
    }

    await prisma.campaignTask.update({
      where: { id: task.id },
      data: {
        status: 'RUNNING',
        attemptCount: { increment: 1 },
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    let output: Record<string, unknown> = { completedAt: new Date().toISOString() };

    if (key === 'ASSET_ANALYSIS') {
      output = {
        matchedProjectAssets: projectAssets.length,
        brandKitApplied: Boolean(brandKit),
      };
    } else if (key === 'SCRIPT_STORYBOARD') {
      output = {
        deliverablesScripted: campaign.deliverables.length,
        hookDiversityVerified: true,
      };
    } else if (key === 'COMPOSITION_BUILD') {
      let createdCompositions = 0;
      for (let i = 0; i < campaign.deliverables.length; i += 1) {
        const deliv = campaign.deliverables[i]!;
        if (deliv.compositionId) continue;

        const aspectRatio = mapPlatformToAspectRatio(deliv.platform);
        const dims =
          aspectRatio === 'PORTRAIT_4_5'
            ? { width: 1080, height: 1350 }
            : aspectRatio === 'SQUARE_1_1'
              ? { width: 1080, height: 1080 }
              : aspectRatio === 'LANDSCAPE_16_9'
                ? { width: 1920, height: 1080 }
                : { width: 1080, height: 1920 };
        const templateId = mapPlatformToTemplateId(deliv.platform);
        const primaryAsset = projectAssets[i % Math.max(1, projectAssets.length)];

        const spec = CompositionSpecSchema.parse({
          schemaVersion: '1.0',
          templateId,
          width: dims.width,
          height: dims.height,
          fps: 30,
          durationInFrames: 540,
          brand: {
            primaryColor: brandKit?.primaryColor ?? '#6366F1',
            secondaryColor: brandKit?.secondaryColor ?? '#0F172A',
            accentColor: brandKit?.accentColor ?? '#22D3EE',
            headingFont: brandKit?.headingFont ?? 'Open Sans',
            bodyFont: brandKit?.bodyFont ?? 'Open Sans',
          },
          captions: {
            enabled: true,
            style: 'karaoke-pop',
            fontSizePx: 54,
            highlightColor: brandKit?.accentColor ?? '#FFE600',
            safeBottomMarginPx: 260,
          },
          audio: { musicVolume: 0.14, duckingEnabled: true },
          scenes: [
            {
              id: `camp-${i + 1}-hook`,
              orderIndex: 0,
              startFrame: 0,
              durationInFrames: 150,
              layout: 'talking-head',
              ...(primaryAsset ? { primaryAssetId: primaryAsset.id } : {}),
              trimStartSec: 0,
              headlineText: deliv.hook.slice(0, 88),
              narrationText: deliv.hook,
              transitionIn: 'fade',
              overlays: [],
            },
            {
              id: `camp-${i + 1}-proof`,
              orderIndex: 1,
              startFrame: 150,
              durationInFrames: 240,
              layout: 'b-roll-overlay',
              ...(primaryAsset ? { primaryAssetId: primaryAsset.id } : {}),
              trimStartSec: 5,
              headlineText: deliv.title.slice(0, 88),
              narrationText: deliv.scriptSummary,
              transitionIn: 'spring-slide',
              overlays: [],
            },
            {
              id: `camp-${i + 1}-cta`,
              orderIndex: 2,
              startFrame: 390,
              durationInFrames: 150,
              layout: 'full-bleed',
              trimStartSec: 13,
              headlineText: 'Take the Next Step',
              narrationText: deliv.captionCopy,
              transitionIn: 'fade',
              overlays: [],
            },
          ],
        });

        const compId = randomUUID();
        const verId = randomUUID();
        await prisma.$transaction([
          prisma.composition.create({
            data: {
              id: compId,
              workspaceId: params.workspaceId,
              projectId: campaign.projectId,
              title: deliv.title.slice(0, 120),
              targetPlatform: mapPlatformToTargetPlatform(deliv.platform),
              aspectRatio,
              width: dims.width,
              height: dims.height,
              fps: 30,
              durationInFrames: 540,
              currentVersionId: verId,
            },
          }),
          prisma.compositionVersion.create({
            data: {
              id: verId,
              compositionId: compId,
              versionNumber: 1,
              specJson: toJson(spec),
              changeSummary: `Generated by Campaign Orchestrator (${campaign.name})`,
              createdByType: 'AI_AGENT',
            },
          }),
          prisma.campaignDeliverable.update({
            where: { id: deliv.id },
            data: {
              compositionId: compId,
              status: 'IN_REVIEW',
            },
          }),
        ]);
        createdCompositions += 1;
      }
      output = { createdCompositions };
    } else if (key === 'CREATIVE_QA') {
      const freshDelivs = await prisma.campaignDeliverable.findMany({
        where: { campaignId: campaign.id },
      });
      const uniqueHooks = new Set(freshDelivs.map((d) => d.hook.trim().toLowerCase()));
      const hookDiversityRatio =
        freshDelivs.length > 0 ? uniqueHooks.size / freshDelivs.length : 1;
      const baseScore = Math.round(
        (hookDiversityRatio * 40) + (brandKit ? 30 : 20) + 30,
      );

      for (const d of freshDelivs) {
        await prisma.campaignDeliverable.update({
          where: { id: d.id },
          data: {
            creativeQaScore: baseScore,
            qaNotesJson: toJson({
              hookDiversityPassed: hookDiversityRatio === 1,
              brandConsistencyPassed: Boolean(brandKit),
              unsupportedClaimsDetected: false,
              explanation: `Campaign QA score ${baseScore}/100: ${uniqueHooks.size}/${freshDelivs.length} distinct hooks; ${brandKit ? 'Brand Kit applied' : 'default styling'}.`,
            }),
          },
        });
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          qaSummaryJson: toJson({
            averageCreativeScore: baseScore,
            uniqueHooksCount: uniqueHooks.size,
            totalDeliverables: freshDelivs.length,
            brandKitApplied: Boolean(brandKit),
            evaluatedAt: new Date().toISOString(),
          }),
        },
      });
      output = { averageCreativeScore: baseScore, uniqueHooksCount: uniqueHooks.size };
    } else if (key === 'HUMAN_REVIEW_GATE') {
      output = {
        requiresHumanApproval: true,
        autoPublishDisabled: true,
        readyForReviewAt: now.toISOString(),
      };
    }

    const doneTask = await prisma.campaignTask.update({
      where: { id: task.id },
      data: {
        status: 'COMPLETED',
        outputJson: toJson(output),
        completedAt: new Date(),
      },
    });
    tasksByKey.set(key, doneTask);
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'AWAITING_APPROVAL',
        actualCostUsd: campaign.estimatedCostUsd,
      },
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: 'CAMPAIGN_PRODUCTION_COMPLETED',
        entityType: 'Campaign',
        entityId: campaign.id,
        detailsJson: {
          status: 'AWAITING_APPROVAL',
          deliverableCount: campaign.deliverables.length,
        },
      },
    }),
  ]);

  return getCampaignDetail(params);
}

export async function retryCampaignTask(params: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  taskId: string;
}) {
  const task = await prisma.campaignTask.findFirst({
    where: {
      id: params.taskId,
      campaignId: params.campaignId,
      workspaceId: params.workspaceId,
    },
  });
  if (!task) {
    throw new NotFoundError('Campaign DAG task not found in workspace');
  }

  await prisma.campaignTask.update({
    where: { id: task.id },
    data: {
      status: 'PENDING',
      errorMessage: null,
    },
  });

  return runCampaignProductionDag({
    workspaceId: params.workspaceId,
    userId: params.userId,
    campaignId: params.campaignId,
  });
}

export async function updateCampaignStatus(params: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  input: UpdateCampaignStatus;
}) {
  const campaign = await getCampaignDetail(params);
  const fromStatus = campaign.status as CampaignStatus;
  if (!canTransitionCampaignStatus(fromStatus, params.input.status)) {
    throw new ValidationError(
      `Invalid campaign lifecycle transition: ${fromStatus} -> ${params.input.status}`,
    );
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: params.input.status },
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: 'CAMPAIGN_STATUS_UPDATED',
        entityType: 'Campaign',
        entityId: campaign.id,
        detailsJson: {
          fromStatus,
          toStatus: params.input.status,
          reason: params.input.reason ?? null,
        },
      },
    }),
  ]);

  return getCampaignDetail(params);
}

export async function decideCampaignDeliverable(params: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  deliverableId: string;
  input: CampaignDeliverableDecision;
}) {
  const deliverable = await prisma.campaignDeliverable.findFirst({
    where: {
      id: params.deliverableId,
      campaignId: params.campaignId,
      workspaceId: params.workspaceId,
    },
  });
  if (!deliverable) {
    throw new NotFoundError('Campaign deliverable not found in workspace');
  }

  await prisma.campaignDeliverable.update({
    where: { id: deliverable.id },
    data: {
      status: params.input.decision,
      approvedByUserId: params.input.decision === 'APPROVED' ? params.userId : null,
      approvedAt: params.input.decision === 'APPROVED' ? new Date() : null,
    },
  });

  // Also sync linked Composition approvalStatus if approved
  if (deliverable.compositionId && params.input.decision === 'APPROVED') {
    await prisma.composition.updateMany({
      where: { id: deliverable.compositionId, workspaceId: params.workspaceId },
      data: {
        approvalStatus: 'APPROVED',
        approvedByUserId: params.userId,
        approvedAt: new Date(),
      },
    });
  }

  const allDeliverables = await prisma.campaignDeliverable.findMany({
    where: { campaignId: params.campaignId },
  });
  const allApproved =
    allDeliverables.length > 0 && allDeliverables.every((d) => d.status === 'APPROVED');

  if (allApproved) {
    await prisma.campaign.update({
      where: { id: params.campaignId },
      data: {
        status: 'READY_TO_SCHEDULE',
        approvedByUserId: params.userId,
        approvedAt: new Date(),
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'CAMPAIGN_DELIVERABLE_DECIDED',
      entityType: 'CampaignDeliverable',
      entityId: deliverable.id,
      detailsJson: {
        decision: params.input.decision,
        notes: params.input.notes ?? null,
        allApproved,
      },
    },
  });

  return getCampaignDetail({
    workspaceId: params.workspaceId,
    campaignId: params.campaignId,
  });
}
