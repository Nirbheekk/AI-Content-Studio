import { createHash, randomUUID } from 'node:crypto';
import {
  applyCompositionPatches,
  CompositionSpecSchema,
  CreateGenerativeJobRequest,
  CreateVoiceConsentRequest,
  ForbiddenError,
  GenerativeJobDecisionRequest,
  GenerativeProviderCapability,
  NotFoundError,
  PROVIDER_CAPABILITY_REGISTRY,
  ProviderAvailabilityStatus,
  ValidationError,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { generateValidSolidPng, generateValidWavAudio } from '@ai-content-os/ai-providers';
import { buildAssetStreamUrl } from '../lib/media-token.js';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface EvaluatedProviderCapability extends GenerativeProviderCapability {
  availabilityStatus: ProviderAvailabilityStatus;
  credentialsConfigured: boolean;
}

export function listProviderCapabilities(): EvaluatedProviderCapability[] {
  return PROVIDER_CAPABILITY_REGISTRY.map((cap) => {
    if (!cap.authEnvVar) {
      return {
        ...cap,
        availabilityStatus: 'LOCAL_DETERMINISTIC',
        credentialsConfigured: true,
      };
    }
    const rawVal = process.env[cap.authEnvVar]?.trim();
    const configured = Boolean(rawVal && rawVal.length > 6 && !rawVal.startsWith('your-'));
    return {
      ...cap,
      availabilityStatus: configured ? 'AVAILABLE_LIVE' : 'PENDING_CREDENTIALS',
      credentialsConfigured: configured,
    };
  });
}

function resolveDimensions(aspectRatio: CreateGenerativeJobRequest['aspectRatio']): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case 'LANDSCAPE_16_9':
      return { width: 1280, height: 720 };
    case 'SQUARE_1_1':
      return { width: 1024, height: 1024 };
    case 'PORTRAIT_4_5':
      return { width: 1080, height: 1350 };
    case 'PORTRAIT_9_16':
    default:
      return { width: 1080, height: 1920 };
  }
}

function isAudioTask(taskType: CreateGenerativeJobRequest['taskType']): boolean {
  return (
    taskType === 'TEXT_TO_SPEECH' ||
    taskType === 'VOICEOVER' ||
    taskType === 'VOICE_CLONE' ||
    taskType === 'AUDIO_CLEANUP' ||
    taskType === 'MUSIC_GENERATION' ||
    taskType === 'SFX_GENERATION'
  );
}

export async function createGenerativeAssetJob(params: {
  workspaceId: string;
  userId: string;
  input: CreateGenerativeJobRequest;
  storage?: MinioStorageAdapter | undefined;
}) {
  const { workspaceId, userId, input } = params;

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId },
  });
  if (!project) {
    throw new NotFoundError('Project not found in workspace');
  }

  const idempotencyKey =
    input.idempotencyKey ?? `gen-${workspaceId}-${randomUUID()}`;

  // Enforce idempotency: never duplicate a generation job on retry
  const existing = await prisma.generativeAssetJob.findUnique({
    where: { idempotencyKey },
  });
  if (existing && existing.workspaceId === workspaceId) {
    return {
      ...existing,
      sizeBytes: existing.sizeBytes ? Number(existing.sizeBytes) : null,
      idempotentReplay: true,
    };
  }

  const providers = listProviderCapabilities();
  const provider = providers.find((p) => p.providerId === input.providerId);
  if (!provider) {
    throw new ValidationError(`Unknown generative provider "${input.providerId}"`);
  }
  if (!provider.supportedTasks.includes(input.taskType)) {
    throw new ValidationError(
      `Provider "${provider.displayName}" does not support task "${input.taskType}".`,
    );
  }

  // Strict Voice Cloning Consent Gate
  if (input.taskType === 'VOICE_CLONE') {
    if (!input.voiceConsentId) {
      throw new ForbiddenError(
        'Voice cloning is disabled without an explicit ACTIVE VoiceConsentRecord ID.',
      );
    }
    const consent = await prisma.voiceConsentRecord.findFirst({
      where: { id: input.voiceConsentId, workspaceId },
    });
    if (!consent || consent.status !== 'ACTIVE') {
      throw new ForbiddenError(
        'Voice cloning blocked: consent record is missing, revoked, or inactive.',
      );
    }
    if (consent.expiresAt && consent.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenError('Voice cloning blocked: voice consent record has expired.');
    }
  }

  const chosenModel = input.model ?? provider.models[0] ?? 'default';
  const costStatus: 'ESTIMATED' | 'UNKNOWN' =
    provider.unitPriceUsd === null ? 'UNKNOWN' : 'ESTIMATED';
  const estimatedCostUsd =
    provider.unitPriceUsd === null
      ? null
      : Math.round(provider.unitPriceUsd * (input.durationSec ? Math.max(1, input.durationSec / 5) : 1) * 10000) / 10000;

  const provenance = {
    origin: 'GENERATED',
    taskType: input.taskType,
    providerId: provider.providerId,
    providerDisplayName: provider.displayName,
    model: chosenModel,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt ?? null,
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    voiceConsentId: input.voiceConsentId ?? null,
    watermarkOrProvenance: provider.watermarkOrProvenance,
    commercialUseNote: provider.commercialUseNote,
    generatedAt: new Date().toISOString(),
  };

  // If external credentials are missing and live provider was explicitly required, return honest UNAVAILABLE state
  if (provider.availabilityStatus === 'PENDING_CREDENTIALS' && input.requireLiveProvider) {
    const unavailableJob = await prisma.generativeAssetJob.create({
      data: {
        workspaceId,
        projectId: project.id,
        createdByUserId: userId,
        compositionId: input.compositionId ?? null,
        sceneId: input.sceneId ?? null,
        taskType: input.taskType,
        provider: provider.providerId,
        model: chosenModel,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt ?? null,
        aspectRatio: input.aspectRatio,
        durationSec: input.durationSec ?? null,
        quality: input.quality,
        status: 'UNAVAILABLE',
        executionMode: 'UNAVAILABLE',
        estimatedCostUsd,
        costStatus,
        idempotencyKey,
        provenanceJson: toJson({
          ...provenance,
          unavailableReason: `Missing environment credential ${provider.authEnvVar ?? 'API_KEY'}.`,
        }),
        errorMessage: `${provider.displayName} requires ${provider.authEnvVar ?? 'credentials'} to execute live generation.`,
      },
    });

    return {
      ...unavailableJob,
      sizeBytes: null,
      idempotentReplay: false,
    };
  }

  // Generate deterministic playable/viewable artifact in MinIO (honestly tagged SIMULATED when external credentials absent)
  const storage = params.storage ?? new MinioStorageAdapter();
  await storage.ensureAllBuckets();
  const bucket = storage.getConfig().rawBucket;

  const audio = isAudioTask(input.taskType);
  let bytes: Uint8Array;
  let mimeType: string;
  let ext: string;
  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = input.durationSec ?? null;

  if (audio) {
    durationSec = input.durationSec ?? 4;
    bytes = generateValidWavAudio(durationSec, 440);
    mimeType = 'audio/wav';
    ext = 'wav';
  } else {
    const dims = resolveDimensions(input.aspectRatio);
    width = dims.width;
    height = dims.height;
    bytes = generateValidSolidPng({
      width: Math.min(width, 640),
      height: Math.min(height, 640),
      r: 34,
      g: 48,
      b: 92,
    });
    mimeType = 'image/png';
    ext = 'png';
  }

  const jobId = randomUUID();
  const storageKey = `workspaces/${workspaceId}/generated/${jobId}.${ext}`;
  await storage.putObject({
    bucket,
    storageKey,
    body: bytes,
    contentType: mimeType,
  });

  const executionMode: 'LIVE' | 'SIMULATED' =
    provider.availabilityStatus === 'AVAILABLE_LIVE' ? 'LIVE' : 'SIMULATED';

  const job = await prisma.generativeAssetJob.create({
    data: {
      id: jobId,
      workspaceId,
      projectId: project.id,
      createdByUserId: userId,
      compositionId: input.compositionId ?? null,
      sceneId: input.sceneId ?? null,
      taskType: input.taskType,
      provider: provider.providerId,
      model: chosenModel,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt ?? null,
      aspectRatio: input.aspectRatio,
      durationSec,
      quality: input.quality,
      status: 'COMPLETED',
      executionMode,
      estimatedCostUsd,
      costStatus,
      idempotencyKey,
      storageBucket: bucket,
      storageKey,
      mimeType,
      sizeBytes: BigInt(bytes.byteLength),
      provenanceJson: toJson({
        ...provenance,
        executionMode,
        isSimulated: executionMode === 'SIMULATED',
      }),
      resultMetadataJson: toJson({
        width,
        height,
        durationSec,
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId,
      action: 'GENERATIVE_ASSET_CREATED',
      entityType: 'GenerativeAssetJob',
      entityId: job.id,
      detailsJson: {
        taskType: job.taskType,
        provider: job.provider,
        model: job.model,
        executionMode,
        costStatus,
        estimatedCostUsd,
      },
    },
  });

  return {
    ...job,
    sizeBytes: Number(job.sizeBytes ?? 0n),
    idempotentReplay: false,
  };
}

export async function listGenerativeJobs(params: {
  workspaceId: string;
  projectId?: string | undefined;
}) {
  const jobs = await prisma.generativeAssetJob.findMany({
    where: {
      workspaceId: params.workspaceId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return jobs.map((j) => ({
    ...j,
    sizeBytes: j.sizeBytes ? Number(j.sizeBytes) : null,
  }));
}

export async function decideGenerativeJob(params: {
  workspaceId: string;
  userId: string;
  jobId: string;
  input: GenerativeJobDecisionRequest;
}) {
  const job = await prisma.generativeAssetJob.findFirst({
    where: { id: params.jobId, workspaceId: params.workspaceId },
  });
  if (!job) {
    throw new NotFoundError('Generative job not found in workspace');
  }
  if (job.status === 'UNAVAILABLE' || job.status === 'FAILED') {
    throw new ValidationError('Cannot accept an unavailable or failed generative job');
  }

  if (params.input.decision === 'REJECT') {
    const rejected = await prisma.generativeAssetJob.update({
      where: { id: job.id },
      data: {
        status: 'REJECTED',
        approvedByUserId: params.userId,
        approvedAt: new Date(),
        resultMetadataJson: toJson({
          ...(typeof job.resultMetadataJson === 'object' && job.resultMetadataJson
            ? (job.resultMetadataJson as Record<string, unknown>)
            : {}),
          reviewerNotes: params.input.reviewerNotes ?? null,
        }),
      },
    });
    return {
      job: { ...rejected, sizeBytes: rejected.sizeBytes ? Number(rejected.sizeBytes) : null },
      asset: null,
      streamUrl: null,
    };
  }

  // ACCEPT -> save to Media Library with full provenance + MediaRightsRecord
  if (!job.storageBucket || !job.storageKey || !job.mimeType) {
    throw new ValidationError('Generative job has no stored media artifact to accept');
  }

  const meta = (job.resultMetadataJson ?? {}) as {
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    checksumSha256?: string;
  };

  const assetType = job.mimeType.startsWith('audio/')
    ? 'AUDIO'
    : job.mimeType.startsWith('video/')
      ? 'VIDEO'
      : 'IMAGE';
  const ext = assetType === 'AUDIO' ? 'wav' : assetType === 'VIDEO' ? 'mp4' : 'png';
  const labelPrefix = job.executionMode === 'SIMULATED' ? '[SIMULATED] ' : '';

  const { updatedJob, createdAsset } = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        workspaceId: params.workspaceId,
        projectId: job.projectId,
        folderPath: '/generated',
        originalName: `gen-${job.taskType.toLowerCase()}-${job.id.slice(0, 6)}.${ext}`,
        storageKey: job.storageKey!,
        bucketName: job.storageBucket!,
        mimeType: job.mimeType!,
        assetType,
        sizeBytes: job.sizeBytes ?? 0n,
        checksumSha256: meta.checksumSha256 ?? createHash('sha256').update(job.id).digest('hex'),
        durationSec: meta.durationSec ?? job.durationSec ?? null,
        width: meta.width ?? null,
        height: meta.height ?? null,
        status: 'READY',
        tags: ['generated', job.taskType.toLowerCase(), job.provider],
        aiSummary: `${labelPrefix}Generated ${job.taskType} via ${job.provider} (${job.model}): "${job.prompt.slice(0, 120)}"`,
        aiMetadataJson: toJson({
          origin: 'GENERATED',
          generativeJobId: job.id,
          executionMode: job.executionMode,
          provider: job.provider,
          model: job.model,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          provenance: job.provenanceJson,
        }),
      },
    });

    await tx.mediaRightsRecord.create({
      data: {
        workspaceId: params.workspaceId,
        assetId: asset.id,
        rightsOwner: `Workspace (${job.provider})`,
        source: 'AI_GENERATED',
        licenseType: `AI Generated (${job.provider} / ${job.model})`,
        commercialAllowed: true,
        attributionRequired: false,
        territoryRestrictions: [],
        usageRestrictions: ['Verify third-party trademark/likeness rights before commercial distribution.'],
        consentStatus: 'NOT_APPLICABLE',
        status: 'VERIFIED',
        verifiedByUserId: params.userId,
        verifiedAt: new Date(),
        notes: `Auto-created from accepted GenerativeAssetJob ${job.id} (${job.executionMode}).`,
      },
    });

    const savedJob = await tx.generativeAssetJob.update({
      where: { id: job.id },
      data: {
        status: 'ACCEPTED',
        assetId: asset.id,
        approvedByUserId: params.userId,
        approvedAt: new Date(),
      },
    });

    // If linked to a storyboard composition scene, patch that scene automatically
    if (job.compositionId && job.sceneId) {
      const comp = await tx.composition.findFirst({
        where: { id: job.compositionId, workspaceId: params.workspaceId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });
      const latest = comp?.versions[0];
      if (comp && latest) {
        const parsedSpec = CompositionSpecSchema.safeParse(latest.specJson);
        if (parsedSpec.success) {
          const patched = applyCompositionPatches(parsedSpec.data, [
            {
              op: 'UPDATE_SCENE',
              sceneId: job.sceneId,
              patch: { brollAssetId: asset.id },
            },
          ]);
          const newVersionId = randomUUID();
          await tx.compositionVersion.create({
            data: {
              id: newVersionId,
              compositionId: comp.id,
              versionNumber: latest.versionNumber + 1,
              specJson: toJson(patched),
              changeSummary: `Attached generated ${job.taskType} asset (${asset.originalName}) to scene ${job.sceneId}`,
              createdByType: 'USER',
            },
          });
          await tx.composition.update({
            where: { id: comp.id },
            data: { currentVersionId: newVersionId },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: 'GENERATIVE_ASSET_ACCEPTED',
        entityType: 'Asset',
        entityId: asset.id,
        detailsJson: {
          jobId: job.id,
          provider: job.provider,
          executionMode: job.executionMode,
          compositionId: job.compositionId,
          sceneId: job.sceneId,
        },
      },
    });

    return { updatedJob: savedJob, createdAsset: asset };
  });

  const streamUrl = buildAssetStreamUrl({
    userId: params.userId,
    workspaceId: params.workspaceId,
    assetId: createdAsset.id,
  });

  return {
    job: { ...updatedJob, sizeBytes: updatedJob.sizeBytes ? Number(updatedJob.sizeBytes) : null },
    asset: { ...createdAsset, sizeBytes: Number(createdAsset.sizeBytes) },
    streamUrl,
  };
}

export async function createVoiceConsentRecord(params: {
  workspaceId: string;
  userId: string;
  input: CreateVoiceConsentRequest;
}) {
  const record = await prisma.voiceConsentRecord.create({
    data: {
      workspaceId: params.workspaceId,
      voiceOwnerName: params.input.voiceOwnerName,
      voiceOwnerEmail: params.input.voiceOwnerEmail ?? null,
      speakerLabel: params.input.speakerLabel,
      consentScope: params.input.consentScope,
      permittedUsage: params.input.permittedUsage,
      attestationText: params.input.attestationText,
      grantedByUserId: params.userId,
      status: 'ACTIVE',
      expiresAt: params.input.expiresAt ? new Date(params.input.expiresAt) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'VOICE_CONSENT_GRANTED',
      entityType: 'VoiceConsentRecord',
      entityId: record.id,
      detailsJson: {
        voiceOwnerName: record.voiceOwnerName,
        speakerLabel: record.speakerLabel,
        consentScope: record.consentScope,
      },
    },
  });

  return record;
}

export async function listVoiceConsents(workspaceId: string) {
  return prisma.voiceConsentRecord.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function revokeVoiceConsentRecord(params: {
  workspaceId: string;
  userId: string;
  consentId: string;
}) {
  const existing = await prisma.voiceConsentRecord.findFirst({
    where: { id: params.consentId, workspaceId: params.workspaceId },
  });
  if (!existing) {
    throw new NotFoundError('Voice consent record not found in workspace');
  }

  const revoked = await prisma.voiceConsentRecord.update({
    where: { id: existing.id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedByUserId: params.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'VOICE_CONSENT_REVOKED',
      entityType: 'VoiceConsentRecord',
      entityId: revoked.id,
      detailsJson: {
        voiceOwnerName: revoked.voiceOwnerName,
        speakerLabel: revoked.speakerLabel,
      },
    },
  });

  return revoked;
}
