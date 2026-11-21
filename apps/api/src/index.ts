import { prisma } from '@ai-content-os/database';
import { buildApiServer } from './server.js';

async function start(): Promise<void> {
  const port = Number(process.env['API_PORT'] ?? 4000);
  const host = '0.0.0.0';
  const app = await buildApiServer();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[@ai-content-os/api] Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error('[@ai-content-os/api] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port, host });
  console.log(`[@ai-content-os/api] Server listening on http://${host}:${port}`);
}

start().catch((error: unknown) => {
  console.error('[@ai-content-os/api] Fatal startup error:', error);
  process.exit(1);
});
