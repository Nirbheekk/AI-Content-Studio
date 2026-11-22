'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/design-system/primitives';
import { useStudio } from '@/context/studio-context';
import { apiRequest } from '@/lib/api-client';

interface EditorialConceptView {
  id: string;
  rank: number;
  title: string;
  hook: string;
  narrativeStructure: string;
  editorialRationale: string;
  overallEditorialScore: number;
  status: string;
  cta: string;
}

interface EditorialPlanView {
  id: string;
  status: string;
  revisionNumber: number;
  estimatedCostUsd: number;
  concepts: EditorialConceptView[];
}

export function EditorialPlannerPanel({
  projectId,
  brief,
  platform,
  onUseApprovedConcept,
}: {
  projectId: string;
  brief: string;
  platform: string;
  onUseApprovedConcept: (promptText: string) => void;
}) {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<EditorialPlanView | null>(null);

  const handleGenerateConcepts = async () => {
    if (!accessToken || !activeWorkspace || !projectId || brief.trim().length < 5) {
      setFeedback({ type: 'error', message: 'Enter a brief (5+ chars) to generate editorial concepts.' });
      return;
    }
    setGenerating(true);
    try {
      const res = await apiRequest<{ plan: EditorialPlanView; matchedHighlightsCount: number }>({
        method: 'POST',
        path: '/api/v1/editorial/plans',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId,
          brief: brief.trim(),
          platform,
          conceptCount: 3,
        },
      });
      setPlan(res.plan);
      setFeedback({
        type: 'success',
        message: `Generated ${res.plan.concepts.length} editorial concepts (${res.matchedHighlightsCount} source highlights matched)`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to generate editorial plan',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleConceptAction = async (concept: EditorialConceptView, status: 'APPROVED' | 'REJECTED') => {
    if (!accessToken || !activeWorkspace || !plan) return;
    try {
      const res = await apiRequest<{ plan: EditorialPlanView }>({
        method: 'PATCH',
        path: `/api/v1/editorial/plans/${plan.id}/concepts/${concept.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { status },
      });
      setPlan(res.plan);
      if (status === 'APPROVED') {
        onUseApprovedConcept(`${concept.title}\nHook: ${concept.hook}\nStructure: ${concept.narrativeStructure}\nCTA: ${concept.cta}`);
        setFeedback({ type: 'success', message: `Approved "${concept.title}" -> loaded into producer brief` });
      } else {
        setFeedback({ type: 'success', message: `Rejected "${concept.title}"` });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update concept',
      });
    }
  };

  return (
    <Card data-testid="editorial-planner-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-sm">Editorial Concepts &amp; Anti-Slop Plan</CardTitle>
          <CardDescription className="text-xs">
            Compare 3 evidence-backed concepts before spending render credits.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={generating || !projectId || brief.trim().length < 5}
          onClick={() => void handleGenerateConcepts()}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Plan 3 Concepts
        </Button>
      </CardHeader>

      {plan && (
        <CardContent className="space-y-2 pt-0">
          {plan.concepts.map((c) => (
            <div
              key={c.id}
              className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2.5 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-foreground">{c.title}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">Editorial {c.overallEditorialScore}/100</Badge>
                  <Badge
                    variant={
                      c.status === 'APPROVED'
                        ? 'success'
                        : c.status === 'REJECTED'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {c.status}
                  </Badge>
                </div>
              </div>
              <p className="font-medium text-foreground">&ldquo;{c.hook}&rdquo;</p>
              <p className="text-muted-foreground">{c.editorialRationale}</p>
              {c.status === 'PROPOSED' && (
                <div className="flex items-center gap-1.5 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleConceptAction(c, 'APPROVED')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve &amp; Use
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleConceptAction(c, 'REJECTED')}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
