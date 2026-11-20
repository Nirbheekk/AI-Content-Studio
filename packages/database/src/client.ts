import { PrismaClient } from '@prisma/client';
import type { DependencyHealth } from '@ai-content-os/shared';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function checkDatabaseHealth(client: PrismaClient = prisma): Promise<DependencyHealth> {
  const start = performance.now();
  try {
    await client.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : 'Database query failed',
    };
  }
}
