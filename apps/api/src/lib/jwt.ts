import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticationError, QuotaExceededError } from '@ai-content-os/shared';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  fullName: string;
  isSystemAdmin: boolean;
  iat: number;
  exp: number;
}

const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getJwtSecret(): string {
  const secret =
    process.env['JWT_SECRET'] ?? 'dev_jwt_secret_minimum_32_characters_long_for_local_testing_only';
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return secret;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

export function signAccessToken(user: {
  id: string;
  email: string;
  fullName: string;
  isSystemAdmin: boolean;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    isSystemAdmin: user.isSystemAdmin,
    iat: nowSec,
    exp: nowSec + ACCESS_TOKEN_TTL_SEC,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${encodedPayload}`;
  const signature = createHmac('sha256', getJwtSecret())
    .update(signingInput, 'utf8')
    .digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthenticationError('Malformed access token');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new AuthenticationError('Invalid access token segments');
  }

  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSig = createHmac('sha256', getJwtSecret())
    .update(signingInput, 'utf8')
    .digest();
  const actualSig = Buffer.from(
    signaturePart.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  );

  if (
    expectedSig.byteLength !== actualSig.byteLength ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    throw new AuthenticationError('Invalid access token signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart)) as AccessTokenPayload;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new AuthenticationError('Access token expired');
  }

  return payload;
}

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  const isProd = process.env['NODE_ENV'] === 'production';
  const secureFlag = isProd ? '; Secure' : '';
  reply.header('Set-Cookie', [
    `aicos_access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_TOKEN_TTL_SEC}${secureFlag}`,
    `aicos_refresh_token=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(REFRESH_TOKEN_TTL_MS / 1000)}${secureFlag}`,
  ]);
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.header('Set-Cookie', [
    'aicos_access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'aicos_refresh_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  ]);
}

/**
 * Sliding-window rate limiter for authentication routes.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests = 20, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public enforce(request: FastifyRequest, keySuffix = ''): void {
    const ip = request.ip || '127.0.0.1';
    const key = `${ip}:${keySuffix}`;
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      throw new QuotaExceededError('authentication rate limit');
    }

    recent.push(now);
    this.hits.set(key, recent);
  }
}
