---
name: project-architecture
description: >-
  Use this skill when designing, reviewing, or modifying monorepo boundaries,
  shared packages, service contracts, or system-level architecture for the AI
  Content Operating System.
---

# Project Architecture Skill

## Responsibilities
- Maintain strict monorepo separation across `apps/` (`web`, `api`, `workers`) and `packages/` (`shared`, `database`, `ai-providers`, `remotion-engine`, `integrations`).
- Ensure shared Zod schemas and TypeScript contracts in `@ai-content-os/shared` govern all cross-service communication.
- Prevent architectural drift and circular package dependencies.

## Technical Standards
1. All domain contracts (Workflow states, Agent payloads, Composition AST, REST DTOs, SSE events) live in `packages/shared`.
2. `apps/web` never imports `packages/database` or worker queues directly; it communicates only with `apps/api`.
3. `apps/api` and `apps/workers` share database access through `packages/database` and domain logic through `packages/*`.

## Implementation Workflow
1. Read `docs/ARCHITECTURE.md` and `SPEC.md` before proposing structural changes.
2. Define or update shared schemas in `packages/shared/src/schemas/` first.
3. Update downstream packages and applications to conform to the shared contract.
4. Synchronize `docs/ARCHITECTURE.md` and `docs/PROJECT_STATUS.md`.

## Validation Requirements
- `npm.cmd run typecheck` passes across all workspaces with zero errors.
- No circular dependencies exist between workspaces.
