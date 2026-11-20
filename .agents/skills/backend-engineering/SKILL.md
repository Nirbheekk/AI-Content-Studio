---
name: backend-engineering
description: >-
  Use this skill when implementing Node.js API routes, authentication, RBAC
  middleware, SSE streaming endpoints, asset upload pipelines, or BullMQ job
  producers in apps/api and apps/workers.
---

# Backend Engineering Skill

## Responsibilities
- Build and maintain the Node.js TypeScript REST API (`apps/api`) and BullMQ worker services (`apps/workers`).
- Implement JWT/Session authentication, Workspace RBAC (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`), rate limiting, and audit logging.
- Manage multipart/folder uploads to S3/MinIO with pre-signed URLs and magic-byte validation.
- Broadcast real-time workflow and rendering telemetry via Redis Pub/Sub and Server-Sent Events (`/api/v1/workflows/:id/stream`).

## Technical Standards
1. Validate every request body, query, and parameter with Zod middleware before controller execution.
2. Return consistent JSON envelopes (`{ success: boolean, data?: T, error?: { code, message, details } }`).
3. Ensure all job dispatches to BullMQ carry `workflowId`, `workspaceId`, and `idempotencyKey`.
4. Implement `/api/health` and `/api/ready` endpoints probing PostgreSQL, Redis, and MinIO connectivity.

## Implementation Workflow
1. Check `docs/API_DOCUMENTATION.md` and `packages/shared` for endpoint contracts.
2. Implement service logic with transactional Prisma operations and structured Pino logging.
3. Write integration tests verifying happy paths, validation errors, and workspace isolation.

## Validation Requirements
- Supertest/Vitest integration tests pass against live PostgreSQL and Redis.
- Health check endpoints return `200 OK` with dependency latency metrics.
