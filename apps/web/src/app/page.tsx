import { WORKFLOW_STAGE_TRANSITIONS, WorkflowStageSchema } from '@ai-content-os/shared';

export default function HomePage() {
  const stages = WorkflowStageSchema.options;
  const totalTransitions = Object.values(WORKFLOW_STAGE_TRANSITIONS).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="border-b border-zinc-800 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Phase 0.2 Foundation Active
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
          AI Content Operating System
        </h1>
        <p className="mt-2 text-zinc-400">
          Describe it. Create it. Refine it. Publish it. — 9-Agent Remotion &amp; Postiz Pipeline
        </p>
      </header>

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-sm font-medium text-zinc-400">Workflow Engine Stages</h2>
          <p className="mt-2 text-3xl font-bold text-white">{stages.length}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {totalTransitions} deterministic state transitions enforced
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-sm font-medium text-zinc-400">Isolated Docker Fleet</h2>
          <p className="mt-2 text-3xl font-bold text-white">11 Services</p>
          <p className="mt-1 text-xs text-zinc-500">
            PostgreSQL 16, Redis 7, MinIO S3, API, Web, Nginx &amp; 5 BullMQ Workers
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-sm font-medium text-zinc-400">Composition Engine</h2>
          <p className="mt-2 text-3xl font-bold text-white">CompositionSpec v1.0</p>
          <p className="mt-1 text-xs text-zinc-500">
            Declarative Zod-validated JSON AST with immutable version history
          </p>
        </div>
      </section>
    </main>
  );
}
