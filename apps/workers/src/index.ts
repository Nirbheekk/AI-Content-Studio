import { startWorkerRuntime } from './runtime.js';

startWorkerRuntime().catch((error: unknown) => {
  console.error('[@ai-content-os/workers] Fatal startup error:', error);
  process.exit(1);
});
