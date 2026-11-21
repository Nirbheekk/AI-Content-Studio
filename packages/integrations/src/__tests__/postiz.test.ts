import { describe, expect, it } from 'vitest';
import { PostizPublishingAdapter } from '../postiz.js';

describe('@ai-content-os/integrations PostizPublishingAdapter', () => {
  const adapter = new PostizPublishingAdapter({
    apiUrl: 'http://localhost:4200/api',
    apiKey: '',
  });

  it('generates OAuth authorization URLs with platform scopes and state', () => {
    const authUrl = adapter.getOAuthAuthorizationUrl({
      platform: 'INSTAGRAM_REELS',
      workspaceId: '11111111-2222-3333-4444-555555555555',
    });

    expect(authUrl.platform).toBe('INSTAGRAM_REELS');
    expect(authUrl.requiredScopes).toContain('instagram_content_publish');
    expect(authUrl.authorizationUrl).toContain('oauth/instagram_reels/authorize');
    expect(authUrl.state).toContain('aicos_11111111_');
    expect(authUrl.isSimulated).toBe(true);
  });

  it('exchanges OAuth codes, detects expired tokens in health checks, and refreshes tokens', async () => {
    const exchanged = await adapter.exchangeOAuthCode({
      platform: 'YOUTUBE_SHORTS',
      code: 'oauth_code_valid_123',
      accountName: 'Studio YT Channel',
      accountHandle: '@studio_yt',
      simulateExpiredToken: true,
    });

    expect(exchanged.accountHandle).toBe('@studio_yt');
    expect(exchanged.accessToken).toContain('pzs_acc_youtube_shorts_');
    expect(exchanged.tokenExpiresAt.getTime()).toBeLessThan(Date.now());

    // Health check detects expired token
    const expiredHealth = await adapter.checkAccountHealth({
      platform: 'YOUTUBE_SHORTS',
      accessToken: exchanged.accessToken,
      tokenExpiresAt: exchanged.tokenExpiresAt,
      scopes: exchanged.scopes,
      currentStatus: 'CONNECTED',
    });
    expect(expiredHealth.healthy).toBe(false);
    expect(expiredHealth.status).toBe('EXPIRED');

    // Refresh rotates tokens and restores future expiration
    const refreshed = await adapter.refreshAccessToken({
      platform: 'YOUTUBE_SHORTS',
      refreshToken: exchanged.refreshToken,
    });
    expect(refreshed.accessToken).not.toBe(exchanged.accessToken);
    expect(refreshed.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const healthyCheck = await adapter.checkAccountHealth({
      platform: 'YOUTUBE_SHORTS',
      accessToken: refreshed.accessToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
      scopes: exchanged.scopes,
      currentStatus: 'CONNECTED',
    });
    expect(healthyCheck.healthy).toBe(true);
    expect(healthyCheck.status).toBe('CONNECTED');
  });

  it('publishes posts, distinguishes PROCESSING vs PUBLISHED confirmation, and classifies provider errors', async () => {
    const successRes = await adapter.publishPost({
      postId: 'post-1',
      platform: 'LINKEDIN',
      contentType: 'VIDEO',
      captionText: 'Launching our new AI Content Operating System!',
      hashtags: ['ai', 'saas'],
      mediaUrl: 'http://localhost:9000/aicos-rendered-outputs/video.mp4',
      accessToken: 'pzs_acc_linkedin_valid',
      idempotencyKey: 'pub-1234567890abcdef1234567890abcdef',
    });

    expect(successRes.success).toBe(true);
    expect(successRes.providerStatus).toBe('PUBLISHED');
    expect(successRes.externalPostId).toContain('sim_postiz_linkedin_');
    expect(successRes.externalPostUrl).toContain('linkedin.com');
    expect(successRes.isSimulated).toBe(true);

    // Provider asynchronous processing state (not yet confirmed PUBLISHED)
    const processingRes = await adapter.publishPost({
      postId: 'post-2',
      platform: 'TIKTOK',
      contentType: 'VIDEO',
      captionText: 'Clip being transcoded [SIMULATE_PROVIDER_PROCESSING]',
      hashtags: ['tiktok'],
      accessToken: 'pzs_acc_tiktok_valid',
      idempotencyKey: 'pub-abcdef1234567890abcdef1234567890',
    });
    expect(processingRes.success).toBe(true);
    expect(processingRes.providerStatus).toBe('PROCESSING');

    // Rate limit 429 error classification
    const rateLimitRes = await adapter.publishPost({
      postId: 'post-3',
      platform: 'X_TWITTER',
      contentType: 'WRITTEN',
      captionText: 'Thread drop [SIMULATE_RATE_LIMIT]',
      hashtags: [],
      accessToken: 'pzs_acc_x_valid',
      idempotencyKey: 'pub-ratelimit1234567890',
    });
    expect(rateLimitRes.success).toBe(false);
    expect(rateLimitRes.httpStatus).toBe(429);
    expect(rateLimitRes.errorCategory).toBe('RATE_LIMIT');
    expect(rateLimitRes.retryable).toBe(true);
  });
});
