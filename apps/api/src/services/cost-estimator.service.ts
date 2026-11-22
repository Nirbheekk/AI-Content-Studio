import {
  CostOperationRequest,
  PROVIDER_PRICING_REGISTRY,
  ProviderPriceEntry,
  UpsertBudgetPolicyRequest,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';

export interface EstimatedOperationLineItem {
  operation: CostOperationRequest['operation'];
  provider: string;
  model: string;
  quantity: number;
  unit: string | null;
  unitPriceUsd: number | null;
  estimatedCostUsd: number | null;
  priceStatus: 'CONFIGURED' | 'UNKNOWN';
  effectiveDate: string | null;
  lastVerifiedDate: string | null;
  sourceRef: string | null;
}

export interface PreflightCostEstimateResult {
  currency: 'USD';
  costKind: 'ESTIMATED';
  knownEstimatedTotalUsd: number;
  hasUnknownPricing: boolean;
  unknownOperationsCount: number;
  currentMonthActualSpendUsd: number;
  budgetPolicy: {
    monthlyLimitUsd: number;
    perOperationLimitUsd: number;
    approvalThresholdUsd: number;
    enforceHardStop: boolean;
  };
  budgetRemainingUsd: number;
  withinBudget: boolean;
  requiresApproval: boolean;
  hardStopBlocked: boolean;
  lowerCostAlternatives: string[];
  lineItems: EstimatedOperationLineItem[];
  estimatedAt: string;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function findProviderPriceEntry(
  operation: CostOperationRequest['operation'],
  provider: string,
  model: string,
  registry: readonly ProviderPriceEntry[] = PROVIDER_PRICING_REGISTRY,
): ProviderPriceEntry | null {
  const p = provider.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  return (
    registry.find(
      (entry) =>
        entry.operation === operation &&
        entry.provider.toLowerCase() === p &&
        entry.model.toLowerCase() === m,
    ) ?? null
  );
}

/**
 * Pure deterministic pre-flight cost calculator.
 * Never fabricates pricing for unlisted providers/models; marks them `UNKNOWN`.
 */
export function computePreflightCostEstimate(params: {
  operations: CostOperationRequest[];
  currentMonthActualSpendUsd: number;
  policy: {
    monthlyLimitUsd: number;
    perOperationLimitUsd: number;
    approvalThresholdUsd: number;
    enforceHardStop: boolean;
  };
  registry?: readonly ProviderPriceEntry[];
}): PreflightCostEstimateResult {
  const registry = params.registry ?? PROVIDER_PRICING_REGISTRY;
  const lineItems: EstimatedOperationLineItem[] = [];
  let knownTotal = 0;
  let unknownCount = 0;
  const lowerCostAlternatives: string[] = [];

  for (const op of params.operations) {
    const match = findProviderPriceEntry(op.operation, op.provider, op.model, registry);
    if (!match) {
      unknownCount += 1;
      lineItems.push({
        operation: op.operation,
        provider: op.provider,
        model: op.model,
        quantity: op.quantity,
        unit: null,
        unitPriceUsd: null,
        estimatedCostUsd: null,
        priceStatus: 'UNKNOWN',
        effectiveDate: null,
        lastVerifiedDate: null,
        sourceRef: null,
      });
      continue;
    }

    const lineCost = roundUsd(op.quantity * match.unitPriceUsd);
    knownTotal = roundUsd(knownTotal + lineCost);
    lineItems.push({
      operation: op.operation,
      provider: match.provider,
      model: match.model,
      quantity: op.quantity,
      unit: match.unit,
      unitPriceUsd: match.unitPriceUsd,
      estimatedCostUsd: lineCost,
      priceStatus: 'CONFIGURED',
      effectiveDate: match.effectiveDate,
      lastVerifiedDate: match.lastVerifiedDate,
      sourceRef: match.sourceRef,
    });

    if (op.operation === 'TTS' && match.provider === 'elevenlabs') {
      lowerCostAlternatives.push(
        'Switch TTS to local neural Edge TTS / espeak-ng fallback ($0.00) for draft previews.',
      );
    }
    if (op.operation === 'LLM_GENERATION' && lineCost > 0.05) {
      lowerCostAlternatives.push(
        'Use gemini-2.5-flash or gpt-4o-mini for initial concept planning to reduce LLM spend.',
      );
    }
  }

  const remaining = roundUsd(
    Math.max(0, params.policy.monthlyLimitUsd - params.currentMonthActualSpendUsd),
  );
  const exceedsPerOp = knownTotal > params.policy.perOperationLimitUsd;
  const exceedsMonthly = params.currentMonthActualSpendUsd + knownTotal > params.policy.monthlyLimitUsd;
  const withinBudget = !exceedsPerOp && !exceedsMonthly;
  const requiresApproval = knownTotal >= params.policy.approvalThresholdUsd || unknownCount > 0;
  const hardStopBlocked = params.policy.enforceHardStop && !withinBudget;

  return {
    currency: 'USD',
    costKind: 'ESTIMATED',
    knownEstimatedTotalUsd: knownTotal,
    hasUnknownPricing: unknownCount > 0,
    unknownOperationsCount: unknownCount,
    currentMonthActualSpendUsd: roundUsd(params.currentMonthActualSpendUsd),
    budgetPolicy: params.policy,
    budgetRemainingUsd: remaining,
    withinBudget,
    requiresApproval,
    hardStopBlocked,
    lowerCostAlternatives: Array.from(new Set(lowerCostAlternatives)),
    lineItems,
    estimatedAt: new Date().toISOString(),
  };
}

export async function getEffectiveBudgetPolicy(
  workspaceId: string,
  projectId?: string | null,
) {
  if (projectId) {
    const projectPolicy = await prisma.budgetPolicy.findFirst({
      where: { workspaceId, projectId },
    });
    if (projectPolicy) return projectPolicy;
  }

  const wsPolicy = await prisma.budgetPolicy.findFirst({
    where: { workspaceId, projectId: null },
  });
  if (wsPolicy) return wsPolicy;

  return {
    id: null,
    workspaceId,
    projectId: null,
    monthlyLimitUsd: 100,
    perOperationLimitUsd: 10,
    approvalThresholdUsd: 5,
    enforceHardStop: false,
    currency: 'USD',
  };
}

export async function upsertBudgetPolicyForWorkspace(params: {
  workspaceId: string;
  userId: string;
  input: UpsertBudgetPolicyRequest;
}) {
  const projectId = params.input.projectId ?? null;
  const existing = await prisma.budgetPolicy.findFirst({
    where: { workspaceId: params.workspaceId, projectId },
  });

  const saved = existing
    ? await prisma.budgetPolicy.update({
        where: { id: existing.id },
        data: {
          monthlyLimitUsd: params.input.monthlyLimitUsd,
          perOperationLimitUsd: params.input.perOperationLimitUsd,
          approvalThresholdUsd: params.input.approvalThresholdUsd,
          enforceHardStop: params.input.enforceHardStop,
          updatedByUserId: params.userId,
        },
      })
    : await prisma.budgetPolicy.create({
        data: {
          workspaceId: params.workspaceId,
          projectId,
          monthlyLimitUsd: params.input.monthlyLimitUsd,
          perOperationLimitUsd: params.input.perOperationLimitUsd,
          approvalThresholdUsd: params.input.approvalThresholdUsd,
          enforceHardStop: params.input.enforceHardStop,
          updatedByUserId: params.userId,
        },
      });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'BUDGET_POLICY_UPDATED',
      entityType: 'BudgetPolicy',
      entityId: saved.id,
      detailsJson: {
        projectId,
        monthlyLimitUsd: saved.monthlyLimitUsd,
        perOperationLimitUsd: saved.perOperationLimitUsd,
        approvalThresholdUsd: saved.approvalThresholdUsd,
        enforceHardStop: saved.enforceHardStop,
      },
    },
  });

  return saved;
}

export async function estimateWorkflowPreflightCost(params: {
  workspaceId: string;
  projectId?: string | undefined;
  operations: CostOperationRequest[];
}): Promise<PreflightCostEstimateResult> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [policy, spendAgg] = await Promise.all([
    getEffectiveBudgetPolicy(params.workspaceId, params.projectId),
    prisma.usageRecord.aggregate({
      where: {
        workspaceId: params.workspaceId,
        recordedAt: { gte: monthStart },
      },
      _sum: { estimatedCostUsd: true },
    }),
  ]);

  const currentMonthSpend = Number(spendAgg._sum.estimatedCostUsd ?? 0);

  return computePreflightCostEstimate({
    operations: params.operations,
    currentMonthActualSpendUsd: currentMonthSpend,
    policy: {
      monthlyLimitUsd: policy.monthlyLimitUsd,
      perOperationLimitUsd: policy.perOperationLimitUsd,
      approvalThresholdUsd: policy.approvalThresholdUsd,
      enforceHardStop: policy.enforceHardStop,
    },
  });
}
