'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  Lock,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/components/design-system/primitives';
import { MediaVideoPlayer } from '@/components/video/media-video-player';
import { apiRequest } from '@/lib/api-client';

interface PublicReviewPayload {
  title: string;
  permission: 'VIEW_ONLY' | 'COMMENT' | 'APPROVE';
  allowDownload: boolean;
  expiresAt: string;
  composition: {
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
      createdAt: string;
    }>;
    approvals: Array<{
      id: string;
      versionNumber: number;
      stage: string;
      reviewerName: string;
      decision: string;
      notes: string | null;
      createdAt: string;
    }>;
  } | null;
}

export default function ClientReviewPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [data, setData] = useState<PublicReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reviewerName, setReviewerName] = useState('');
  const [timestampSec, setTimestampSec] = useState(0);
  const [commentBody, setCommentBody] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadReview = useCallback(
    async (pw?: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const query = pw ? `?password=${encodeURIComponent(pw)}` : '';
        const res = await apiRequest<PublicReviewPayload>({
          path: `/api/v1/public/review/${encodeURIComponent(token)}${query}`,
        });
        setData(res);
        setNeedsPassword(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to open review link';
        if (msg.toLowerCase().includes('password')) {
          setNeedsPassword(true);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName.trim() || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/public/review/${encodeURIComponent(token)}/comments`,
        body: {
          reviewerName: reviewerName.trim(),
          timestampSec,
          body: commentBody.trim(),
          ...(password ? { password } : {}),
        },
      });
      setCommentBody('');
      setStatusMessage('Timestamped comment added.');
      await loadReview(password || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: 'APPROVED' | 'CHANGES_REQUESTED') => {
    if (!reviewerName.trim()) {
      setError('Enter your name before submitting a review decision.');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/public/review/${encodeURIComponent(token)}/decision`,
        body: {
          reviewerName: reviewerName.trim(),
          decision,
          ...(decisionNotes.trim() ? { notes: decisionNotes.trim() } : {}),
          ...(password ? { password } : {}),
        },
      });
      setDecisionNotes('');
      setStatusMessage(
        decision === 'APPROVED'
          ? 'Version approved and recorded.'
          : 'Revision request submitted to the creative team.',
      );
      await loadReview(password || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-semibold">
              {data?.title ?? 'Client Creative Review'}
            </h1>
            <p className="text-xs text-muted-foreground">
              Secure external review portal — leave timestamped feedback or approve this version.
            </p>
          </div>
          {data?.composition && (
            <Badge variant={data.composition.isCurrentVersionApproved ? 'success' : 'warning'}>
              v{data.composition.currentVersionNumber} • {data.composition.approvalStatus}
            </Badge>
          )}
        </div>

        {statusMessage && (
          <div className="rounded-xl border border-primary/40 bg-accent px-3.5 py-2.5 text-xs text-accent-foreground">
            {statusMessage}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {needsPassword ? (
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-primary" />
                Password Required
              </CardTitle>
              <CardDescription>Enter the review password shared by your creative team.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadReview(password);
                }}
                className="space-y-3"
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Review password"
                  required
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  Unlock Review
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Loading secure client review…
          </Card>
        ) : data?.composition ? (
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <Card className="p-4">
                {data.composition.streamUrl ? (
                  <MediaVideoPlayer
                    src={data.composition.streamUrl}
                    label={`${data.composition.title} (v${data.composition.currentVersionNumber})`}
                  />
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 p-8 text-center text-xs text-muted-foreground">
                    Video preview has not been rendered for v{data.composition.currentVersionNumber} yet.
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Version-Bound Approval History ({data.composition.approvals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.composition.approvals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No decisions recorded yet.</p>
                  ) : (
                    data.composition.approvals.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold">{a.reviewerName}</span> • v{a.versionNumber} ({a.stage})
                          {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
                        </div>
                        <Badge variant={a.decision === 'APPROVED' ? 'success' : 'warning'}>
                          {a.decision}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 lg:col-span-5">
              {data.permission !== 'VIEW_ONLY' && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Your Feedback &amp; Decision
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="rev-name">Your Name</Label>
                      <Input
                        id="rev-name"
                        value={reviewerName}
                        onChange={(e) => setReviewerName(e.target.value)}
                        placeholder="Alex Client"
                        required
                      />
                    </div>

                    <form onSubmit={handleSubmitComment} className="space-y-2 border-t border-border pt-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="rev-ts" className="shrink-0 text-xs">
                          Timestamp (s)
                        </Label>
                        <Input
                          id="rev-ts"
                          type="number"
                          min={0}
                          step={0.5}
                          value={timestampSec}
                          onChange={(e) => setTimestampSec(Number(e.target.value))}
                          className="h-8 w-24 text-xs"
                        />
                      </div>
                      <Textarea
                        rows={2}
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Add a timestamped note…"
                      />
                      <Button type="submit" size="sm" variant="outline" className="w-full" disabled={submitting}>
                        Post Timestamped Comment
                      </Button>
                    </form>

                    {data.permission === 'APPROVE' && (
                      <div className="space-y-2 border-t border-border pt-3">
                        <Textarea
                          rows={2}
                          value={decisionNotes}
                          onChange={(e) => setDecisionNotes(e.target.value)}
                          placeholder="Optional approval or revision notes…"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={submitting}
                            onClick={() => void handleDecision('CHANGES_REQUESTED')}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Request Changes
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={submitting}
                            onClick={() => void handleDecision('APPROVED')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve v{data.composition.currentVersionNumber}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Timestamped Comments ({data.composition.comments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.composition.comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  ) : (
                    data.composition.comments.map((c) => (
                      <div key={c.id} className="rounded-lg border border-border p-2.5 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>v{c.versionNumber}</span>
                          {c.frameIndex !== null && <span>Frame {c.frameIndex}</span>}
                        </div>
                        <p className="mt-1 text-foreground">{c.content}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
