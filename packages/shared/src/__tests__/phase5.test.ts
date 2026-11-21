import { describe, expect, it } from 'vitest';
import {
  computeEngagementRate,
  computeEvidenceInsights,
  evaluateQuota,
  InsightPostInput,
  redactSensitive,
  sanitizeUrlForLog,
  SnapshotMetrics,
} from '../index.js';

const m = (o: Partial<SnapshotMetrics>): SnapshotMetrics => ({
  views: null,
  impressions: null,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  watchTimeSec: null,
  completionRate: null,
  followerDelta: null,
  ...o,
});

const post = (
  id: string,
  platform: string,
  caption: string,
  metrics: SnapshotMetrics,
  hour = 12,
  hashtags: string[] = [],
): InsightPostInput => ({
  id,
  platform,
  contentType: 'VIDEO',
  title: null,
  captionText: caption,
  hashtags,
  publishedAt: new Date(Date.UTC(2026, 0, 5, hour)).toISOString(),
  metrics,
});

describe('@ai-content-os/shared Phase 5 analytics, intelligence, redaction & quotas', () => {
  it('computes engagement rate only when data exists (never fabricates)', () => {
    expect(computeEngagementRate(m({}))).toBeNull();
    expect(computeEngagementRate(m({ likes: 10 }))).toBeNull(); // no denominator
    expect(computeEngagementRate(m({ impressions: 1000, likes: 50, comments: 10, shares: 10 }))).toBeCloseTo(0.07);
    expect(computeEngagementRate(m({ views: 200, likes: 20 }))).toBeCloseTo(0.1);
  });

  it('derives evidence-only insights and reports missing data explicitly', () => {
    const posts = [
      post('a', 'LINKEDIN', 'Why do posts flop? Here is how.', m({ impressions: 1000, likes: 100 }), 9, ['ai']),
      post('b', 'LINKEDIN', 'Why is retention low? Fix it.', m({ impressions: 1000, likes: 90 }), 9, ['ai']),
      post('c', 'X_TWITTER', 'Announcing the long product update for everyone today', m({ impressions: 1000, likes: 10 }), 15, ['ai']),
      post('d', 'X_TWITTER', 'Another long unremarkable status update post here today', m({ impressions: 1000, likes: 5 }), 15),
      post('e', 'X_TWITTER', 'No metrics here', m({})),
    ];
    const { insights, sampleSize, postsWithoutEngagementData } = computeEvidenceInsights(posts);
    expect(sampleSize).toBe(4);
    expect(postsWithoutEngagementData).toBe(1);
    expect(insights.every((i) => i.kind === 'EVIDENCE')).toBe(true);
    expect(insights.find((i) => i.type === 'DATA_QUALITY')?.basedOnPostIds).toEqual(['e']);
    expect(insights.find((i) => i.type === 'TOP_PERFORMER')?.basedOnPostIds[0]).toBe('a');
    expect(insights.find((i) => i.type === 'PLATFORM_COMPARISON')?.summary).toContain('LINKEDIN');
    const best = insights.find((i) => i.type === 'BEST_PUBLISH_HOUR');
    expect(best?.summary).toContain('09:00 UTC');
    expect(insights.find((i) => i.type === 'HOOK_PATTERN')?.summary).toContain('question');
    expect(computeEvidenceInsights([]).insights).toHaveLength(0);
  });

  it('redacts secrets and tokens from log payloads and URLs', () => {
    const out = redactSensitive({
      password: 'hunter2',
      refreshToken: 'abc',
      nested: { Authorization: 'Bearer eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl', ok: 'visible' },
      msg: 'header was Bearer abc.def.ghi here',
    }) as Record<string, unknown>;
    const json = JSON.stringify(out);
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('abc.def.ghi');
    expect(json).toContain('visible');
    expect(sanitizeUrlForLog('/api/v1/x/stream?accessToken=SECRET&a=1')).toBe(
      '/api/v1/x/stream?accessToken=[REDACTED]&a=1',
    );
  });

  it('evaluates quotas with alert and exceeded states', () => {
    expect(evaluateQuota('LLM_TOKENS', 50, 100, 80)).toMatchObject({ exceeded: false, alert: false });
    expect(evaluateQuota('LLM_TOKENS', 85, 100, 80)).toMatchObject({ exceeded: false, alert: true });
    expect(evaluateQuota('LLM_TOKENS', 100, 100, 80)).toMatchObject({ exceeded: true, alert: true });
  });
});
