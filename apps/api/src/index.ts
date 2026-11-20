import { buildApiServer } from './server.js';

async function start(): Promise<void> {
  const port = Number(process.env['API_PORT'] ?? 4000);
  const host = '0.0.0.0';
  const app = await buildApiServer();

  await app.listen({ port, host });
  console.log(`[@ai-content-os/api] Server listening on http://${host}:${port}`);
}

start().catch((error: unknown) => {
  console.error('[@ai-content-os/api] Fatal startup error:', error);
  process.exit(1);
});
