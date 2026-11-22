'use client';

import React, { useState } from 'react';
import { Loader2, Play, Search, Sparkles } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
} from '@/components/design-system/primitives';
import { useStudio } from '@/context/studio-context';
import { apiRequest } from '@/lib/api-client';

interface SearchHit {
  hitId: string;
  assetId: string;
  fileName: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  matchingTranscript: string;
  visualDescription: string;
  matchExplanation: string;
  confidence: number;
  rightsStatus: string;
}

export function SemanticSearchPanel({
  projectId,
  onSelectAssetId,
}: {
  projectId: string;
  onSelectAssetId: (assetId: string) => void;
}) {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await apiRequest<{ hits: SearchHit[] }>({
        method: 'POST',
        path: '/api/v1/editorial/search',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          query: query.trim(),
          ...(projectId ? { projectId } : {}),
          limit: 8,
        },
      });
      setHits(res.hits);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Semantic search failed',
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card data-testid="semantic-search-panel">
      <CardContent className="space-y-3 p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ai" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Semantic search footage (e.g. "founder explaining pricing", "product close-up")...'
              className="pl-9 text-xs"
            />
          </div>
          <Button type="submit" size="sm" disabled={searching || query.trim().length < 2}>
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Find Moments
          </Button>
        </form>

        {hits !== null && (
          <div className="space-y-2">
            {hits.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No matching timestamped moments found for &ldquo;{query}&rdquo;. Analyze assets first to index transcripts and scenes.
              </p>
            ) : (
              hits.map((hit) => (
                <div
                  key={hit.hitId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold text-foreground">{hit.fileName}</span>
                      <Badge variant="secondary">
                        {hit.startSec.toFixed(1)}s – {hit.endSec.toFixed(1)}s
                      </Badge>
                      <Badge variant="outline">{Math.round(hit.confidence * 100)}% match</Badge>
                      <Badge variant={hit.rightsStatus === 'VERIFIED' ? 'success' : 'warning'}>
                        Rights: {hit.rightsStatus}
                      </Badge>
                    </div>
                    {hit.matchingTranscript && (
                      <p className="line-clamp-2 text-foreground/90">
                        &ldquo;{hit.matchingTranscript}&rdquo;
                      </p>
                    )}
                    <p className="text-muted-foreground">{hit.matchExplanation}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectAssetId(hit.assetId)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Inspect
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
