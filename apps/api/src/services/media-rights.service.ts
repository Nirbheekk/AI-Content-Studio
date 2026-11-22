import {
  MediaRightsStatus,
  NotFoundError,
  PublishRightsEvaluation,
  RightsCheckAssetOutcome,
  RightsDecision,
  UpsertMediaRightsRequest,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';

export interface RightsEvaluationContext {
  platform?: string | undefined;
  territory?: string | undefined;
  commercialUse?: boolean | undefined;
  requireVerifiedRights?: boolean | undefined;
  now?: Date | undefined;
}

export interface RightsRecordLike {
  status: MediaRightsStatus;
  source: string;
  commercialAllowed: boolean;
  attributionRequired: boolean;
  attributionText: string | null;
  territoryRestrictions: string[];
  usageRestrictions: string[];
  expiresAt: Date | null;
  consentStatus: string;
}

export function evaluateSingleAssetRights(
  asset: { id: string; originalName: string },
  record: RightsRecordLike | null | undefined,
  context: RightsEvaluationContext = {},
): RightsCheckAssetOutcome {
  const now = context.now ?? new Date();
  const commercialUse = context.commercialUse ?? true;
  const territory = (context.territory ?? 'US').trim().toUpperCase();
  const platform = (context.platform ?? '').trim().toUpperCase();

  if (!record) {
    return {
      assetId: asset.id,
      assetName: asset.originalName,
      decision: 'REVIEW_REQUIRED',
      status: 'UNKNOWN',
      reasons: ['Media rights have not been declared or verified for this asset.'],
      attributionRequired: false,
      attributionText: null,
    };
  }

  const reasons: string[] = [];
  let effectiveStatus: MediaRightsStatus = record.status;

  if (record.expiresAt && record.expiresAt.getTime() <= now.getTime()) {
    effectiveStatus = 'EXPIRED';
    reasons.push(`Media licence expired on ${record.expiresAt.toISOString().slice(0, 10)}.`);
  }

  if (effectiveStatus === 'REVOKED') {
    reasons.push('Media rights for this asset have been revoked.');
  } else if (effectiveStatus === 'EXPIRED' && reasons.length === 0) {
    reasons.push('Media rights for this asset are marked EXPIRED.');
  } else if (effectiveStatus === 'RESTRICTED') {
    reasons.push('Asset is marked RESTRICTED and cannot be published.');
  }

  if (commercialUse && !record.commercialAllowed) {
    reasons.push('Commercial usage is not permitted by this asset licence.');
  }

  if (record.source === 'VOICE_CLONED' && record.consentStatus !== 'VERIFIED') {
    reasons.push('Cloned voice requires verified informed consent before publication.');
  }

  const blockedTerritories = record.territoryRestrictions.map((t) => t.trim().toUpperCase());
  if (territory && blockedTerritories.includes(territory)) {
    reasons.push(`Publishing is restricted in territory "${territory}".`);
  }

  const blockedUsage = record.usageRestrictions.map((u) => u.trim().toUpperCase());
  if (platform && blockedUsage.includes(platform)) {
    reasons.push(`Usage restriction prohibits publishing on platform "${platform}".`);
  }

  if (reasons.length > 0) {
    return {
      assetId: asset.id,
      assetName: asset.originalName,
      decision: 'BLOCKED',
      status: effectiveStatus,
      reasons,
      attributionRequired: record.attributionRequired,
      attributionText: record.attributionText,
    };
  }

  if (effectiveStatus === 'UNKNOWN' || effectiveStatus === 'PENDING_VERIFICATION') {
    return {
      assetId: asset.id,
      assetName: asset.originalName,
      decision: 'REVIEW_REQUIRED',
      status: effectiveStatus,
      reasons: [
        effectiveStatus === 'PENDING_VERIFICATION'
          ? 'Media rights are pending verification.'
          : 'Media rights status is UNKNOWN.',
      ],
      attributionRequired: record.attributionRequired,
      attributionText: record.attributionText,
    };
  }

  // VERIFIED and all checks passed
  if (record.attributionRequired) {
    return {
      assetId: asset.id,
      assetName: asset.originalName,
      decision: 'ALLOWED_WITH_ATTRIBUTION',
      status: 'VERIFIED',
      reasons: [],
      attributionRequired: true,
      attributionText: record.attributionText ?? 'Attribution required by licence.',
    };
  }

  return {
    assetId: asset.id,
    assetName: asset.originalName,
    decision: 'ALLOWED',
    status: 'VERIFIED',
    reasons: [],
    attributionRequired: false,
    attributionText: null,
  };
}

export async function upsertAssetMediaRights(params: {
  workspaceId: string;
  userId: string;
  assetId: string;
  input: UpsertMediaRightsRequest;
}) {
  const asset = await prisma.asset.findFirst({
    where: { id: params.assetId, workspaceId: params.workspaceId },
  });
  if (!asset) {
    throw new NotFoundError('Asset', params.assetId);
  }

  const isVerifying = params.input.status === 'VERIFIED';
  const expiresAtDate = params.input.expiresAt ? new Date(params.input.expiresAt) : null;

  const record = await prisma.mediaRightsRecord.upsert({
    where: { assetId: asset.id },
    update: {
      rightsOwner: params.input.rightsOwner,
      creatorName: params.input.creatorName ?? null,
      source: params.input.source,
      licenseType: params.input.licenseType,
      commercialAllowed: params.input.commercialAllowed,
      attributionRequired: params.input.attributionRequired,
      attributionText: params.input.attributionText ?? null,
      territoryRestrictions: params.input.territoryRestrictions,
      usageRestrictions: params.input.usageRestrictions,
      expiresAt: expiresAtDate,
      consentStatus: params.input.consentStatus,
      consentDocKey: params.input.consentDocKey ?? null,
      status: params.input.status,
      verifiedByUserId: isVerifying ? params.userId : null,
      verifiedAt: isVerifying ? new Date() : null,
      notes: params.input.notes ?? null,
    },
    create: {
      workspaceId: params.workspaceId,
      assetId: asset.id,
      rightsOwner: params.input.rightsOwner,
      creatorName: params.input.creatorName ?? null,
      source: params.input.source,
      licenseType: params.input.licenseType,
      commercialAllowed: params.input.commercialAllowed,
      attributionRequired: params.input.attributionRequired,
      attributionText: params.input.attributionText ?? null,
      territoryRestrictions: params.input.territoryRestrictions,
      usageRestrictions: params.input.usageRestrictions,
      expiresAt: expiresAtDate,
      consentStatus: params.input.consentStatus,
      consentDocKey: params.input.consentDocKey ?? null,
      status: params.input.status,
      verifiedByUserId: isVerifying ? params.userId : null,
      verifiedAt: isVerifying ? new Date() : null,
      notes: params.input.notes ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'MEDIA_RIGHTS_UPDATED',
      entityType: 'Asset',
      entityId: asset.id,
      detailsJson: {
        status: record.status,
        source: record.source,
        commercialAllowed: record.commercialAllowed,
        attributionRequired: record.attributionRequired,
        expiresAt: record.expiresAt?.toISOString() ?? null,
      },
    },
  });

  return record;
}

export async function evaluatePublishRightsGate(params: {
  workspaceId: string;
  userId?: string | undefined;
  assetId?: string | null | undefined;
  compositionId?: string | null | undefined;
  renderJobId?: string | null | undefined;
  platform?: string | undefined;
  territory?: string | undefined;
  commercialUse?: boolean | undefined;
  requireVerifiedRights?: boolean | undefined;
}): Promise<PublishRightsEvaluation> {
  const assetIds = new Set<string>();
  if (params.assetId) {
    assetIds.add(params.assetId);
  }

  if (params.renderJobId) {
    const rj = await prisma.renderJob.findFirst({
      where: { id: params.renderJobId, workspaceId: params.workspaceId },
    });
    if (rj?.outputStorageKey) {
      const linkedAsset = await prisma.asset.findFirst({
        where: { workspaceId: params.workspaceId, storageKey: rj.outputStorageKey },
        select: { id: true },
      });
      if (linkedAsset) assetIds.add(linkedAsset.id);
    }
  }

  if (params.compositionId) {
    const comp = await prisma.composition.findFirst({
      where: { id: params.compositionId, workspaceId: params.workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const latestSpec = comp?.versions[0]?.specJson as
      | { scenes?: Array<{ assetId?: string }>; brand?: { logoAssetId?: string } }
      | undefined;
    if (latestSpec?.brand?.logoAssetId) assetIds.add(latestSpec.brand.logoAssetId);
    for (const scene of latestSpec?.scenes ?? []) {
      if (scene.assetId) assetIds.add(scene.assetId);
    }
  }

  const assets =
    assetIds.size > 0
      ? await prisma.asset.findMany({
          where: {
            workspaceId: params.workspaceId,
            id: { in: Array.from(assetIds) },
          },
          include: { rightsRecord: true },
        })
      : [];

  const evaluatedAssets: RightsCheckAssetOutcome[] = assets.map((asset) =>
    evaluateSingleAssetRights(
      { id: asset.id, originalName: asset.originalName },
      asset.rightsRecord
        ? {
            status: asset.rightsRecord.status,
            source: asset.rightsRecord.source,
            commercialAllowed: asset.rightsRecord.commercialAllowed,
            attributionRequired: asset.rightsRecord.attributionRequired,
            attributionText: asset.rightsRecord.attributionText,
            territoryRestrictions: asset.rightsRecord.territoryRestrictions,
            usageRestrictions: asset.rightsRecord.usageRestrictions,
            expiresAt: asset.rightsRecord.expiresAt,
            consentStatus: asset.rightsRecord.consentStatus,
          }
        : null,
      {
        platform: params.platform,
        territory: params.territory,
        commercialUse: params.commercialUse,
        requireVerifiedRights: params.requireVerifiedRights,
      },
    ),
  );

  const requireVerified = params.requireVerifiedRights ?? false;
  const blockedOutcomes = evaluatedAssets.filter(
    (item) =>
      item.decision === 'BLOCKED' ||
      (requireVerified && item.decision === 'REVIEW_REQUIRED'),
  );
  const reviewOutcomes = evaluatedAssets.filter((item) => item.decision === 'REVIEW_REQUIRED');
  const attributionOutcomes = evaluatedAssets.filter(
    (item) => item.decision === 'ALLOWED_WITH_ATTRIBUTION',
  );

  let decision: RightsDecision = 'ALLOWED';
  if (blockedOutcomes.length > 0) {
    decision = 'BLOCKED';
  } else if (reviewOutcomes.length > 0) {
    decision = 'REVIEW_REQUIRED';
  } else if (attributionOutcomes.length > 0) {
    decision = 'ALLOWED_WITH_ATTRIBUTION';
  }

  const allowedToPublish = decision === 'ALLOWED' || decision === 'ALLOWED_WITH_ATTRIBUTION';
  const reasons = blockedOutcomes.flatMap((b) =>
    b.reasons.map((r) => `${b.assetName}: ${r}`),
  );
  const requiredAttributions = attributionOutcomes
    .map((a) => a.attributionText)
    .filter((t): t is string => Boolean(t));

  const result: PublishRightsEvaluation = {
    decision,
    allowedToPublish: requireVerified ? allowedToPublish : blockedOutcomes.length === 0,
    reasons,
    requiredAttributions,
    blockedAssetIds: blockedOutcomes.map((b) => b.assetId),
    evaluatedAssets,
    evaluatedAt: new Date().toISOString(),
  };

  if (assets.length > 0) {
    await prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId ?? null,
        action: 'PUBLISH_RIGHTS_GATE_EVALUATED',
        entityType: 'PublishGate',
        entityId: params.assetId ?? params.compositionId ?? params.renderJobId ?? 'post',
        detailsJson: {
          decision: result.decision,
          allowedToPublish: result.allowedToPublish,
          blockedAssetIds: result.blockedAssetIds,
          platform: params.platform ?? null,
        },
      },
    });
  }

  return result;
}

export async function assertPublishRightsPermitted(params: {
  workspaceId: string;
  userId?: string | undefined;
  assetId?: string | null | undefined;
  compositionId?: string | null | undefined;
  renderJobId?: string | null | undefined;
  platform?: string | undefined;
  territory?: string | undefined;
  requireVerifiedRights?: boolean | undefined;
}): Promise<PublishRightsEvaluation> {
  const evaluation = await evaluatePublishRightsGate(params);
  if (!evaluation.allowedToPublish) {
    throw new ValidationError(
      `Publishing blocked by Media Rights Gate: ${evaluation.reasons.join(' | ') || 'Unresolved rights'}`,
      evaluation,
    );
  }
  return evaluation;
}
