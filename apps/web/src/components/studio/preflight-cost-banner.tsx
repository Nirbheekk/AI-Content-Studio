'use client';

import React, { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useStudio } from '@/context/studio-context';
import { apiRequest } from '@/lib/api-client';

interface EstimateResponse {
  knownEstimatedTotalUsd: number;
  hasUnknownPricing: boolean;
  budgetRemainingUsd: number;
  withinBudget: boolean;
  requiresApproval: boolean;
}

export function PreflightCostBanner({ projectId }: { projectId: string }) {
  const { accessToken, activeWorkspace } = useStudio();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);

  useEffect(() => {
    if (!accessToken || !activeWorkspace) return;
    apiRequest<EstimateResponse>({
      method: 'POST',
      path: '/api/v1/billing/estimate',
      accessToken,
      workspaceId: activeWorkspace.id,
      body: {
        ...(projectId ? { projectId } : {}),
        operations: [
          { operation: 'LLM_GENERATION', provider: 'google-gemini', model: 'gemini-2.5-flash', quantity: 4 },
          { operation: 'RENDERING', provider: 'local-ffmpeg', model: 'libx264-aac', quantity: 0.5 },
        ],
      },
    })
      .then((res) => setEstimate(res))
      .catch(() => setEstimate(null));
  }, [accessToken, activeWorkspace, projectId]);

  if (!estimate) return null;

  return (
    <div
      data-testid="preflight-cost-banner"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Calculator className="h-3.5 w-3.5 shrink-0" />
        <span>
          Est. run cost:{' '}
          <strong className="font-mono text-foreground tabular-nums">
            ${estimate.knownEstimatedTotalUsd.toFixed(4)}
          </strong>
          {estimate.hasUnknownPricing && ' (+ unknown)'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          Budget left: ${estimate.budgetRemainingUsd.toFixed(2)}
        </span>
        <Badge variant={estimate.withinBudget ? 'success' : 'destructive'}>
          {estimate.withinBudget ? 'Within Budget' : 'Over Budget'}
        </Badge>
      </div>
    </div>
  );
}
