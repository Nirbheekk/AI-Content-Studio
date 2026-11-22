'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Globe, ShieldCheck, Sparkles } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/design-system/primitives';
import { apiRequest } from '@/lib/api-client';

interface PlatformCapabilityDto {
  platform: string;
  displayName: string;
  supportedAspectRatios: string[];
  maxDurationSec: number;
  maxCaptionChars: number;
  maxHashtags: number;
  directPublishingRequires: string;
  integrationState: string;
}

interface IntelligenceReportDto {
  sampleSize: number;
  confidenceLevel: string;
  methodologyDisclaimer: string;
  provenanceBreakdown: {
    actualPlatformCount: number;
    userImportedCount: number;
    unavailableCount: number;
  };
  platformBreakdown: Array<{
    platform: string;
    sampleCount: number;
    avgViews: number;
    engagementRatePct: number | null;
  }>;
  recommendations: string[];
  autoCampaignModificationEnabled: boolean;
}

export interface DistributionIntelligencePanelProps {
  accessToken: string | null;
  workspaceId: string | null;
}

export function DistributionIntelligencePanel({
  accessToken,
  workspaceId,
}: DistributionIntelligencePanelProps) {
  const [platforms, setPlatforms] = useState<PlatformCapabilityDto[]>([]);
  const [report, setReport] = useState<IntelligenceReportDto | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !workspaceId) return;
    try {
      const [capRes, intelRes] = await Promise.all([
        apiRequest<{ platforms: PlatformCapabilityDto[] }>({
          path: '/api/v1/distribution/capabilities',
          accessToken,
          workspaceId,
        }),
        apiRequest<IntelligenceReportDto>({
          path: '/api/v1/distribution/intelligence',
          accessToken,
          workspaceId,
        }),
      ]);
      setPlatforms(capRes.platforms);
      setReport(intelRes);
    } catch {
      // Non-fatal
    }
  }, [accessToken, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Card className="lg:col-span-7">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-primary" />
            Platform Capability Registry (6 Channels)
          </CardTitle>
          <CardDescription>
            Verified format, duration, caption limits, and honest OAuth/approval boundaries per social platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-2">
          {platforms.map((p) => (
            <div key={p.platform} className="rounded-xl border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{p.displayName}</span>
                <Badge variant="warning">
                  {p.integrationState === 'SANDBOX_SIMULATED' ? 'Sandbox' : 'OAuth Required'}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground tabular-nums">
                Max {p.maxDurationSec}s • {p.maxCaptionChars} chars • {p.maxHashtags} tags
              </p>
              <p className="mt-1 text-muted-foreground">
                Ratios: {p.supportedAspectRatios.join(', ')}
              </p>
              <p className="mt-1 text-muted-foreground">{p.directPublishingRequires}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Content Intelligence
            </CardTitle>
            {report && (
              <Badge variant={report.confidenceLevel === 'LOW_SAMPLE_SIZE' ? 'warning' : 'info'}>
                {report.confidenceLevel} (n={report.sampleSize})
              </Badge>
            )}
          </div>
          <CardDescription>
            Evidence-backed recommendations for future campaigns (never auto-modifies approved campaigns).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {report ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">
                  <BarChart3 className="mr-1 h-3 w-3" />
                  Actual: {report.provenanceBreakdown.actualPlatformCount}
                </Badge>
                <Badge variant="outline">
                  Imported: {report.provenanceBreakdown.userImportedCount}
                </Badge>
                <Badge variant="outline">
                  Unavailable: {report.provenanceBreakdown.unavailableCount}
                </Badge>
              </div>

              <ul className="space-y-1.5">
                {report.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-muted/30 p-2.5 text-foreground"
                  >
                    {rec}
                  </li>
                ))}
              </ul>

              <p className="flex items-start gap-1.5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{report.methodologyDisclaimer}</span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Loading content intelligence…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
