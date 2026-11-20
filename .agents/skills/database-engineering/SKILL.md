---
name: database-engineering
description: >-
  Use this skill when designing or modifying Prisma models, PostgreSQL indexes,
  migrations, database seed scripts, or transactional queries in
  packages/database.
---

# Database Engineering Skill

## Responsibilities
- Maintain `packages/database/prisma/schema.prisma`, migrations, seed scripts, and typed repository helpers.
- Ensure referential integrity, multi-tenant `workspaceId` indexing, optimistic concurrency, and immutable version tracking for compositions and audit logs.

## Technical Standards
1. All tables storing tenant data must have an indexed `workspaceId` foreign key with cascading or restricted deletion policies clearly specified.
2. Store structured JSON specifications (`CompositionSpec`, agent outputs, brand rules, transcript segments) in `JsonB` columns validated by Zod before persistence.
3. Wrap multi-table state transitions (e.g., updating `Workflow.stage`, inserting `WorkflowStep`, and recording `UsageRecord`) inside `prisma.$transaction`.

## Implementation Workflow
1. Update `packages/database/prisma/schema.prisma` and `docs/DATABASE_SCHEMA.md`.
2. Generate Prisma client (`npx.cmd prisma generate`) and create migration (`npx.cmd prisma migrate dev`).
3. Update `packages/database/src/seed.ts` and verify against integration tests.

## Validation Requirements
- `npx.cmd prisma validate` and `npx.cmd prisma generate` succeed.
- Database integration tests verify constraints, transactions, and workspace isolation.
