import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Redis } from 'ioredis';
import {
  AppError,
  DependencyHealth,
  HealthCheckResponse,
  HealthCheckResponseSchema,
} from '@ai-content-os/shared';
import { checkDatabaseHealth, prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerWorkspaceRoutes } from './routes/workspaces.routes.js';
import { registerProjectAndDashboardRoutes } from './routes/projects.routes.js';
import { registerAssetRoutes } from './routes/assets.routes.js';
import { registerStudioRoutes } from './routes/studio.routes.js';
import { registerProductionRoutes } from './routes/production.routes.js';
import { registerCreativeWorkflowRoutes } from './routes/creative.routes.js';
import { registerPublishingRoutes } from './routes/publishing.routes.js';
import { registerIntelligenceRoutes } from './routes/intelligence.routes.js';
import { registerEditorialRoutes } from './routes/editorial.routes.js';
import { registerShortsRoutes } from './routes/shorts.routes.js';
import { registerGenerativeRoutes } from './routes/generative.routes.js';
import { logEvent, metrics, routeKey } from './lib/observability.js';
import { SlidingWindowRateLimiter } from './lib/jwt.js';
import { sanitizeUrlForLog } from '@ai-content-os/shared';

export interface ServerDependencies {
  checkPostgres?: () => Promise<DependencyHealth>;
  checkRedis?: () => Promise<DependencyHealth>;
  checkMinio?: () => Promise<DependencyHealth>;
  storage?: MinioStorageAdapter;
}

export async function checkRedisHealth(redisUrl: string): Promise<DependencyHealth> {
  const start = performance.now();
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2500,
    maxRetriesPerRequest: 1,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return {
      status: pong === 'PONG' ? 'healthy' : 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    client.disconnect();
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : 'Redis ping failed',
    };
  }
}

export async function checkMinioHealth(s3Endpoint: string): Promise<DependencyHealth> {
  const start = performance.now();
  try {
    const response = await fetch(`${s3Endpoint.replace(/\/$/, '')}/minio/health/live`, {
      signal: AbortSignal.timeout(2500),
    });
    return {
      status: response.ok ? 'healthy' : 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      ...(response.ok ? {} : { message: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : 'MinIO health check failed',
    };
  }
}

export async function buildApiServer(deps: ServerDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 520 * 1024 * 1024,
    trustProxy: true,
  });

  const allowedOrigins = (process.env['CORS_ALLOWED_ORIGINS'] ?? 'http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Accept raw binary payloads for direct asset uploads
  const binaryMimeTypes = [
    'application/octet-stream',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'application/pdf',
  ];
  for (const mime of binaryMimeTypes) {
    app.addContentTypeParser(mime, { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });
  }

  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const s3Endpoint = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000';

  const probePostgres = deps.checkPostgres ?? (() => checkDatabaseHealth(prisma));
  const probeRedis = deps.checkRedis ?? (() => checkRedisHealth(redisUrl));
  const probeMinio = deps.checkMinio ?? (() => checkMinioHealth(s3Endpoint));

  // ---- Security headers, API rate limiting, request metrics & structured logging ----
  const apiLimiter = new SlidingWindowRateLimiter(
    Number(process.env['API_RATE_LIMIT_PER_MIN'] ?? 1500),
    60_000,
  );
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    reply.header('Cache-Control', 'no-store');
    if (process.env['NODE_ENV'] === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    (request as unknown as { _startedAt: number })._startedAt = performance.now();
    if (request.url.startsWith('/api/v1/') && process.env['NODE_ENV'] !== 'test') {
      apiLimiter.enforce(request, 'api');
    }
  });
  app.addHook('onResponse', async (request, reply) => {
    const started = (request as unknown as { _startedAt?: number })._startedAt ?? performance.now();
    const ms = performance.now() - started;
    const key = routeKey(request.method, request.url);
    metrics.recordRequest(key, reply.statusCode, ms);
    if (!request.url.startsWith('/api/health') && !request.url.startsWith('/api/ready')) {
      logEvent(reply.statusCode >= 500 ? 'error' : 'info', 'request', {
        method: request.method,
        url: sanitizeUrlForLog(request.url),
        statusCode: reply.statusCode,
        durationMs: Math.round(ms),
      });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) metrics.trackError(routeKey(request.method, request.url), error.errorCode, error.message);
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
          details: error.details,
        },
      });
    }

    const rawMessage = error instanceof Error ? error.message : 'Unexpected server error';
    metrics.trackError(routeKey(request.method, request.url), 'INTERNAL_SERVER_ERROR', rawMessage);
    logEvent('error', 'unhandled error', { url: sanitizeUrlForLog(request.url), error: rawMessage });
    const message = process.env['NODE_ENV'] === 'production' ? 'Unexpected server error' : rawMessage;
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  });

  app.get('/api/health', async (_request, reply) => {
    const [postgres, redis, minio] = await Promise.all([
      probePostgres(),
      probeRedis(),
      probeMinio(),
    ]);

    const allHealthy =
      postgres.status === 'healthy' && redis.status === 'healthy' && minio.status === 'healthy';
    const anyHealthy =
      postgres.status === 'healthy' || redis.status === 'healthy' || minio.status === 'healthy';

    const payload: HealthCheckResponse = HealthCheckResponseSchema.parse({
      service: '@ai-content-os/api',
      status: allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      dependencies: {
        postgres,
        redis,
        minio,
      },
    });

    const httpCode = payload.status === 'unhealthy' ? 503 : 200;
    return reply.status(httpCode).send({
      success: payload.status !== 'unhealthy',
      data: payload,
    });
  });

  app.get('/api/v1/status', async (_request, reply) => {
    const [workspacesCount, projectsCount, compositionsCount, socialAccountsCount] =
      await Promise.all([
        prisma.workspace.count(),
        prisma.project.count(),
        prisma.composition.count(),
        prisma.socialAccount.count(),
      ]);

    return reply.status(200).send({
      success: true,
      data: {
        phase: '1.0',
        environment: process.env['NODE_ENV'] ?? 'development',
        counts: {
          workspaces: workspacesCount,
          projects: projectsCount,
          compositions: compositionsCount,
          socialAccounts: socialAccountsCount,
        },
      },
    });
  });

  await registerAuthRoutes(app);
  await registerWorkspaceRoutes(app);
  await registerProjectAndDashboardRoutes(app);
  await registerAssetRoutes(app, deps.storage);
  await registerStudioRoutes(app);
  await registerProductionRoutes(app, deps.storage);
  await registerCreativeWorkflowRoutes(app, deps.storage);
  await registerPublishingRoutes(app, deps.storage);
  await registerIntelligenceRoutes(app);
  await registerEditorialRoutes(app);
  await registerShortsRoutes(app, deps.storage);
  await registerGenerativeRoutes(app, deps.storage);

  return app;
}
