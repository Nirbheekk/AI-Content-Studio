import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundError } from '@ai-content-os/shared';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { authorizeWorkspace } from '../middleware/auth.js';
import { MediaTokenResourceType, verifyMediaStreamToken } from './media-token.js';

export async function resolveMediaStreamWorkspace(params: {
  request: FastifyRequest;
  resourceType: MediaTokenResourceType;
  resourceId: string;
}): Promise<{ workspaceId: string; userId: string }> {
  const query = (params.request.query ?? {}) as { token?: string };
  if (typeof query.token === 'string' && query.token.trim().length > 0) {
    const payload = verifyMediaStreamToken(
      query.token.trim(),
      params.resourceType,
      params.resourceId,
    );
    return { workspaceId: payload.workspaceId, userId: payload.sub };
  }

  const ctx = await authorizeWorkspace(params.request, 'VIEWER');
  return { workspaceId: ctx.workspaceId, userId: ctx.userId };
}

function sanitizeDownloadFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'video.mp4';
}

/**
 * Streams a private MinIO object through Fastify with HTTP 200 / 206 / 416 Range support,
 * zero full-file RAM buffering, and strict security headers.
 */
export async function streamStorageObjectToReply(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  storage: MinioStorageAdapter;
  bucket: string;
  storageKey: string;
  fallbackMimeType?: string;
  fileName?: string;
  download?: boolean;
}): Promise<FastifyReply> {
  const rangeHeader =
    typeof params.request.headers.range === 'string'
      ? params.request.headers.range
      : undefined;

  const obj = await params.storage.getObjectStream({
    bucket: params.bucket,
    storageKey: params.storageKey,
    range: rangeHeader,
  });

  if (obj.status === 404) {
    throw new NotFoundError('MediaObject', params.fileName ?? 'object');
  }

  if (obj.status === 416) {
    if (obj.contentRange) {
      params.reply.header('Content-Range', obj.contentRange);
    }
    params.reply.header('Accept-Ranges', 'bytes');
    return params.reply.status(416).send();
  }

  const contentType =
    obj.contentType && obj.contentType !== 'application/octet-stream'
      ? obj.contentType
      : (params.fallbackMimeType ?? 'video/mp4');

  params.reply.header('Content-Type', contentType);
  params.reply.header('Accept-Ranges', obj.acceptRanges || 'bytes');
  params.reply.header('Cache-Control', 'private, no-store');
  params.reply.header('X-Content-Type-Options', 'nosniff');

  if (obj.contentLength !== null && Number.isFinite(obj.contentLength)) {
    params.reply.header('Content-Length', String(obj.contentLength));
  }
  if (obj.contentRange) {
    params.reply.header('Content-Range', obj.contentRange);
  }
  if (params.download) {
    const safeName = sanitizeDownloadFileName(params.fileName ?? 'video.mp4');
    params.reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
  }

  if (!obj.body) {
    return params.reply.status(obj.status === 206 ? 206 : 200).send();
  }

  const nodeStream = Readable.fromWeb(obj.body as unknown as NodeWebReadableStream);
  return params.reply.status(obj.status === 206 ? 206 : 200).send(nodeStream);
}
