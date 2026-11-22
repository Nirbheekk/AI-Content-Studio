'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/design-system/primitives';
import { apiRequest } from '@/lib/api-client';

interface ReviewLinkDto {
  id: string;
  title: string;
  compositionId: string | null;
  permission: string;
  passwordProtected: boolean;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
}

export interface ReviewLinkPanelProps {
  accessToken: string | null;
  workspaceId: string | null;
  compositionId: string | null;
  onFeedback: (fb: { type: 'success' | 'error'; message: string }) => void;
}

export function ReviewLinkPanel({
  accessToken,
  workspaceId,
  compositionId,
  onFeedback,
}: ReviewLinkPanelProps) {
  const [links, setLinks] = useState<ReviewLinkDto[]>([]);
  const [password, setPassword] = useState('');
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLinks = useCallback(async () => {
    if (!accessToken || !workspaceId) return;
    try {
      const res = await apiRequest<{ links: ReviewLinkDto[] }>({
        path: '/api/v1/collaboration/review-links',
        accessToken,
        workspaceId,
      });
      setLinks(
        compositionId
          ? res.links.filter((l) => l.compositionId === compositionId)
          : res.links,
      );
    } catch {
      // Non-fatal
    }
  }, [accessToken, workspaceId, compositionId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const handleCreate = async () => {
    if (!accessToken || !workspaceId || !compositionId) return;
    setBusy(true);
    try {
      const created = await apiRequest<{ reviewPath: string }>({
        method: 'POST',
        path: '/api/v1/collaboration/review-links',
        accessToken,
        workspaceId,
        body: {
          compositionId,
          permission: 'APPROVE',
          ...(password.trim().length >= 4 ? { password: password.trim() } : {}),
          expiresInHours: 168,
        },
      });
      const fullUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${created.reviewPath}`
          : created.reviewPath;
      setLatestUrl(fullUrl);
      setPassword('');
      await loadLinks();
      onFeedback({ type: 'success', message: 'Created expiring client review link.' });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create review link',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    if (!accessToken || !workspaceId) return;
    try {
      await apiRequest({
        method: 'POST',
        path: `/api/v1/collaboration/review-links/${linkId}/revoke`,
        accessToken,
        workspaceId,
        body: {},
      });
      await loadLinks();
      onFeedback({ type: 'success', message: 'Revoked client review link.' });
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to revoke link',
      });
    }
  };

  return (
    <Card className="space-y-2.5 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Link2 className="h-3.5 w-3.5 text-primary" />
          <span>Client Review Links</span>
        </div>
        <Badge variant="outline">{links.filter((l) => !l.revokedAt).length} active</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Optional password (4+ chars)"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || !compositionId}
          onClick={() => void handleCreate()}
        >
          Share Link
        </Button>
      </div>

      {latestUrl && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-accent px-2.5 py-1.5 text-xs">
          <span className="truncate font-mono">{latestUrl}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(latestUrl);
              onFeedback({ type: 'success', message: 'Copied review link to clipboard.' });
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      )}

      {links.slice(0, 3).map((l) => (
        <div
          key={l.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
        >
          <div className="truncate">
            <span className="font-medium text-foreground">{l.permission}</span>
            <span className="ml-1.5 text-muted-foreground">
              • {l.accessCount} views {l.passwordProtected ? '• Locked' : ''}
            </span>
          </div>
          {l.revokedAt ? (
            <Badge variant="secondary">Revoked</Badge>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRevoke(l.id)}
              title="Revoke link"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
