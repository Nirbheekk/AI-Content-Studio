import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthenticationError } from '@ai-content-os/shared';

export type MediaTokenResourceType = 'asset' | 'render' | 'derivative';

export interface MediaStreamTokenPayload {
  sub: string;
  workspaceId: string;
  resourceType: MediaTokenResourceType;
  resourceId: string;
  exp: number;
}

function getMediaSigningSecret(): string {
  return (
    process.env['JWT_SECRET'] ??
    process.env['ENCRYPTION_MASTER_KEY'] ??
    'dev-aicos-media-signing-secret-change-in-prod'
  );
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

/**
 * Signs a short-lived HMAC-SHA256 media token strictly scoped to a single workspace + resource ID.
 * Enables native browser `<video src="/api/v1/.../stream?token=...">` playback with full RBAC checks.
 */
export function signMediaStreamToken(params: {
  userId: string;
  workspaceId: string;
  resourceType: MediaTokenResourceType;
  resourceId: string;
  ttlSec?: number;
}): string {
  const ttlSec = params.ttlSec ?? 3600;
  const payload: MediaStreamTokenPayload = {
    sub: params.userId,
    workspaceId: params.workspaceId,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', getMediaSigningSecret())
    .update(encoded, 'utf8')
    .digest();
  return `${encoded}.${base64UrlEncode(sig)}`;
}

/**
 * Verifies signature, expiration, and resource scope of a media stream token.
 */
export function verifyMediaStreamToken(
  token: string,
  expectedType: MediaTokenResourceType,
  expectedResourceId: string,
): MediaStreamTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AuthenticationError('Invalid media stream token format');
  }
  const [encoded, providedSig] = parts;
  const expectedSig = base64UrlEncode(
    createHmac('sha256', getMediaSigningSecret()).update(encoded, 'utf8').digest(),
  );

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AuthenticationError('Invalid media stream token signature');
  }

  let payload: MediaStreamTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as MediaStreamTokenPayload;
  } catch {
    throw new AuthenticationError('Malformed media stream token payload');
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthenticationError('Media stream token has expired');
  }

  if (
    payload.resourceType !== expectedType ||
    payload.resourceId !== expectedResourceId
  ) {
    throw new AuthenticationError('Media stream token is not scoped for this resource');
  }

  return payload;
}

export function buildAssetStreamUrl(params: {
  userId: string;
  workspaceId: string;
  assetId: string;
  download?: boolean;
}): string {
  const token = signMediaStreamToken({
    userId: params.userId,
    workspaceId: params.workspaceId,
    resourceType: 'asset',
    resourceId: params.assetId,
  });
  const suffix = params.download ? '&download=1' : '';
  return `/api/v1/assets/${encodeURIComponent(params.assetId)}/stream?token=${encodeURIComponent(token)}${suffix}`;
}

export function buildRenderStreamUrl(params: {
  userId: string;
  workspaceId: string;
  renderJobId: string;
  download?: boolean;
}): string {
  const token = signMediaStreamToken({
    userId: params.userId,
    workspaceId: params.workspaceId,
    resourceType: 'render',
    resourceId: params.renderJobId,
  });
  const suffix = params.download ? '&download=1' : '';
  return `/api/v1/renders/${encodeURIComponent(params.renderJobId)}/stream?token=${encodeURIComponent(token)}${suffix}`;
}
