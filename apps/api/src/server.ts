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
  });

  await app.register(cors, {
    origin: true,
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

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
          details: error.details,
        },
      });
    }

    const message = error instanceof Error ? error.message : 'Unexpected server error';
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

  return app;
}
