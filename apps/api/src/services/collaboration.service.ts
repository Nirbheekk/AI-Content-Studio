import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  AuthenticationError,
  CreateInternalApprovalRequest,
  CreateReviewLinkRequest,
  ForbiddenError,
  NotFoundError,
  PublicReviewCommentRequest,
  PublicReviewDecisionRequest,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { buildRenderStreamUrl } from '../lib/media-token.js';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function verifySecretHash(plain: string, expectedHex: string): boolean {
  const actual = Buffer.from(sha256Hex(plain), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function createIdempotentNotification(params: {
  workspaceId: string;
  recipientUserId?: string | null;
  eventType: string;
  dedupeKey: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
}) {
  return prisma.notification.upsert({
    where: { dedupeKey: params.dedupeKey },
    update: {},
    create: {
      workspaceId: params.workspaceId,
      recipientUserId: params.recipientUserId ?? null,
      eventType: params.eventType,
      dedupeKey: params.dedupeKey,
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.entityId,
    },
  });
}

export async function createReviewLink(params: {
  workspaceId: string;
  userId: string;
  input: CreateReviewLinkRequest;
}) {
  const { workspaceId, userId, input } = params;
  if (!input.compositionId && !input.campaignId) {
    throw new ValidationError('Provide either compositionId or campaignId to create a review link.');
  }

  let resolvedTitle = input.title?.trim() ?? '';
  if (input.compositionId) {
    const comp = await prisma.composition.findFirst({
      where: { id: input.compositionId, workspaceId },
    });
    if (!comp) throw new NotFoundError('Composition not found in workspace');
    if (!resolvedTitle) resolvedTitle = `Client Review — ${comp.title}`;
  }
  if (input.campaignId) {
    const camp = await prisma.campaign.findFirst({
      where: { id: input.campaignId, workspaceId },
    });
    if (!camp) throw new NotFoundError('Campaign not found in workspace');
    if (!resolvedTitle) resolvedTitle = `Campaign Review — ${camp.name}`;
  }

  const rawToken = randomBytes(24).toString('base64url');
  const tokenHash = sha256Hex(rawToken);
  const passwordHash = input.password ? sha256Hex(`pw:${input.password}`) : null;
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3_600_000);

  const link = await prisma.reviewLink.create({
    data: {
      workspaceId,
      createdByUserId: userId,
      compositionId: input.compositionId ?? null,
      campaignId: input.campaignId ?? null,
      title: resolvedTitle,
      tokenHash,
      permission: input.permission,
      passwordHash,
      allowDownload: input.allowDownload,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId,
      action: 'REVIEW_LINK_CREATED',
      entityType: 'ReviewLink',
      entityId: link.id,
      detailsJson: {
        permission: link.permission,
        passwordProtected: Boolean(passwordHash),
        expiresAt: expiresAt.toISOString(),
        compositionId: link.compositionId,
        campaignId: link.campaignId,
      },
    },
  });

  return {
    id: link.id,
    title: link.title,
    permission: link.permission,
    passwordProtected: Boolean(link.passwordHash),
    allowDownload: link.allowDownload,
    expiresAt: link.expiresAt,
    reviewPath: `/review/${rawToken}`,
    token: rawToken, // Returned once upon creation
  };
}

export async function listReviewLinks(workspaceId: string) {
  const links = await prisma.reviewLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return links.map((l) => ({
    id: l.id,
    title: l.title,
    compositionId: l.compositionId,
    campaignId: l.campaignId,
    permission: l.permission,
    passwordProtected: Boolean(l.passwordHash),
    allowDownload: l.allowDownload,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    accessCount: l.accessCount,
    lastAccessedAt: l.lastAccessedAt,
    createdAt: l.createdAt,
  }));
}

export async function revokeReviewLink(params: {
  workspaceId: string;
  userId: string;
  linkId: string;
}) {
  const link = await prisma.reviewLink.findFirst({
    where: { id: params.linkId, workspaceId: params.workspaceId },
  });
  if (!link) throw new NotFoundError('Review link not found in workspace');

  const revoked = await prisma.reviewLink.update({
    where: { id: link.id },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'REVIEW_LINK_REVOKED',
      entityType: 'ReviewLink',
      entityId: link.id,
      detailsJson: { revokedAt: revoked.revokedAt?.toISOString() ?? null },
    },
  });

  return revoked;
}

async function resolveValidPublicLink(rawToken: string, password?: string) {
  const tokenHash = sha256Hex(rawToken);
  const link = await prisma.reviewLink.findUnique({ where: { tokenHash } });
  if (!link) {
    throw new NotFoundError('Review link is invalid or does not exist.');
  }
  if (link.revokedAt) {
    throw new ForbiddenError('This review link has been revoked.');
  }
  if (link.expiresAt.getTime() <= Date.now()) {
    throw new ForbiddenError('This review link has expired.');
  }
  if (link.passwordHash) {
    if (!password || !verifySecretHash(`pw:${password}`, link.passwordHash)) {
      throw new AuthenticationError('Valid review password is required.');
    }
  }
  return link;
}

export async function accessPublicReviewLink(rawToken: string, password?: string) {
  const link = await resolveValidPublicLink(rawToken, password);

  await prisma.reviewLink.update({
    where: { id: link.id },
    data: {
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });

  let compositionView: {
    id: string;
    title: string;
    aspectRatio: string;
    fps: number;
    currentVersionNumber: number;
    approvalStatus: string;
    isCurrentVersionApproved: boolean;
    streamUrl: string | null;
    comments: Array<{
      id: string;
      versionNumber: number;
      frameIndex: number | null;
      content: string;
      resolved: boolean;
      createdAt: Date;
    }>;
    approvals: Array<{
      id: string;
      versionNumber: number;
      stage: string;
      reviewerName: string;
      decision: string;
      notes: string | null;
      createdAt: Date;
    }>;
  } | null = null;

  if (link.compositionId) {
    const comp = await prisma.composition.findFirst({
      where: { id: link.compositionId, workspaceId: link.workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            renderJobs: {
              where: { status: 'COMPLETED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (comp) {
      const latestVersion = comp.versions[0];
      const latestVersionNum = latestVersion?.versionNumber ?? 1;
      const latestRender = latestVersion?.renderJobs[0];
      const approvals = await prisma.approvalRecord.findMany({
        where: { workspaceId: link.workspaceId, compositionId: comp.id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });

      // Version-bound approval check: approval of v1 does NOT silently approve v2!
      const isCurrentVersionApproved = approvals.some(
        (a) => a.versionNumber === latestVersionNum && a.decision === 'APPROVED',
      );

      compositionView = {
        id: comp.id,
        title: comp.title,
        aspectRatio: comp.aspectRatio,
        fps: comp.fps,
        currentVersionNumber: latestVersionNum,
        approvalStatus: isCurrentVersionApproved ? 'APPROVED' : comp.approvalStatus,
        isCurrentVersionApproved,
        streamUrl: latestRender
          ? buildRenderStreamUrl({
              userId: 'client-review',
              workspaceId: link.workspaceId,
              renderJobId: latestRender.id,
            })
          : null,
        comments: comp.comments.map((c) => ({
          id: c.id,
          versionNumber: c.versionNumber,
          frameIndex: c.frameIndex,
          content: c.content,
          resolved: c.resolved,
          createdAt: c.createdAt,
        })),
        approvals: approvals.map((a) => ({
          id: a.id,
          versionNumber: a.versionNumber,
          stage: a.stage,
          reviewerName: a.reviewerName,
          decision: a.decision,
          notes: a.notes,
          createdAt: a.createdAt,
        })),
      };
    }
  }

  // Strictly scoped public payload — zero internal workspace data or credentials exposed
  return {
    title: link.title,
    permission: link.permission,
    allowDownload: link.allowDownload,
    expiresAt: link.expiresAt,
    composition: compositionView,
  };
}

export async function submitPublicReviewComment(params: {
  rawToken: string;
  input: PublicReviewCommentRequest;
}) {
  const link = await resolveValidPublicLink(params.rawToken, params.input.password);
  if (link.permission === 'VIEW_ONLY') {
    throw new ForbiddenError('This review link is view-only and does not permit commenting.');
  }
  if (!link.compositionId) {
    throw new ValidationError('Review link has no target composition for timestamped comments.');
  }

  const comp = await prisma.composition.findFirst({
    where: { id: link.compositionId, workspaceId: link.workspaceId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!comp) throw new NotFoundError('Target composition not found');

  const latestVersionNum = comp.versions[0]?.versionNumber ?? 1;
  const frameIndex = Math.round(params.input.timestampSec * comp.fps);

  const comment = await prisma.compositionComment.create({
    data: {
      workspaceId: link.workspaceId,
      compositionId: comp.id,
      versionNumber: latestVersionNum,
      authorId: link.createdByUserId,
      frameIndex,
      content: `[Client: ${params.input.reviewerName} @ ${params.input.timestampSec.toFixed(1)}s] ${params.input.body}`,
    },
  });

  await createIdempotentNotification({
    workspaceId: link.workspaceId,
    recipientUserId: link.createdByUserId,
    eventType: 'COMMENT_ADDED',
    dedupeKey: `comment-${comment.id}`,
    title: `Client comment on ${comp.title} (v${latestVersionNum})`,
    body: `${params.input.reviewerName} commented at ${params.input.timestampSec.toFixed(1)}s: "${params.input.body.slice(0, 120)}"`,
    entityType: 'Composition',
    entityId: comp.id,
  });

  return {
    id: comment.id,
    versionNumber: comment.versionNumber,
    frameIndex: comment.frameIndex,
    content: comment.content,
    createdAt: comment.createdAt,
  };
}

export async function submitPublicReviewDecision(params: {
  rawToken: string;
  input: PublicReviewDecisionRequest;
}) {
  const link = await resolveValidPublicLink(params.rawToken, params.input.password);
  if (link.permission !== 'APPROVE') {
    throw new ForbiddenError('This review link does not grant approval permissions.');
  }
  if (!link.compositionId) {
    throw new ValidationError('Review link has no target composition for approval.');
  }

  const comp = await prisma.composition.findFirst({
    where: { id: link.compositionId, workspaceId: link.workspaceId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  const latestVersion = comp?.versions[0];
  if (!comp || !latestVersion) {
    throw new NotFoundError('Target composition or version not found');
  }

  const record = await prisma.$transaction(async (tx) => {
    const rec = await tx.approvalRecord.create({
      data: {
        workspaceId: link.workspaceId,
        compositionId: comp.id,
        compositionVersionId: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        stage: 'CLIENT_APPROVAL',
        reviewerName: params.input.reviewerName,
        reviewLinkId: link.id,
        decision: params.input.decision,
        notes: params.input.notes ?? null,
      },
    });

    await tx.composition.update({
      where: { id: comp.id },
      data: {
        approvalStatus:
          params.input.decision === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED',
        approvedAt: params.input.decision === 'APPROVED' ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: link.workspaceId,
        userId: link.createdByUserId,
        action: 'CLIENT_REVIEW_DECISION',
        entityType: 'Composition',
        entityId: comp.id,
        detailsJson: {
          versionNumber: latestVersion.versionNumber,
          reviewerName: params.input.reviewerName,
          decision: params.input.decision,
          reviewLinkId: link.id,
        },
      },
    });

    return rec;
  });

  await createIdempotentNotification({
    workspaceId: link.workspaceId,
    recipientUserId: link.createdByUserId,
    eventType:
      params.input.decision === 'APPROVED' ? 'DELIVERABLE_APPROVED' : 'CHANGE_REQUESTED',
    dedupeKey: `approval-${record.id}`,
    title: `${params.input.reviewerName} marked ${comp.title} v${latestVersion.versionNumber} as ${params.input.decision}`,
    body: params.input.notes?.slice(0, 180) || `Decision recorded on v${latestVersion.versionNumber}.`,
    entityType: 'Composition',
    entityId: comp.id,
  });

  return record;
}

export async function recordInternalApproval(params: {
  workspaceId: string;
  userId: string;
  reviewerName: string;
  input: CreateInternalApprovalRequest;
}) {
  const comp = await prisma.composition.findFirst({
    where: { id: params.input.compositionId, workspaceId: params.workspaceId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  const latestVersion = comp?.versions[0];
  if (!comp || !latestVersion) {
    throw new NotFoundError('Composition not found in workspace');
  }

  return prisma.approvalRecord.create({
    data: {
      workspaceId: params.workspaceId,
      compositionId: comp.id,
      compositionVersionId: latestVersion.id,
      versionNumber: latestVersion.versionNumber,
      stage: params.input.stage,
      reviewerName: params.reviewerName,
      reviewerUserId: params.userId,
      decision: params.input.decision,
      notes: params.input.notes ?? null,
    },
  });
}

export async function listNotifications(workspaceId: string) {
  return prisma.notification.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markNotificationRead(params: {
  workspaceId: string;
  notificationId: string;
}) {
  const existing = await prisma.notification.findFirst({
    where: { id: params.notificationId, workspaceId: params.workspaceId },
  });
  if (!existing) throw new NotFoundError('Notification not found in workspace');
  return prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: new Date() },
  });
}
