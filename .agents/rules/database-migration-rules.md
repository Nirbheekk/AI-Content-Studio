# Database Migration Rules

1. **Prisma Schema as Single Source**: All PostgreSQL schema definitions live in `packages/database/prisma/schema.prisma`. Never execute ad-hoc DDL outside Prisma migrations.
2. **Forward-Compatible Migrations**: Prefer additive migrations (nullable columns, new tables, non-blocking indexes). Document destructive changes and verify rollback paths before applying.
3. **Workspace & Tenant Isolation**: Every domain table (`Project`, `Asset`, `Conversation`, `Workflow`, `Composition`, `RenderJob`, `SocialAccount`, `PublishPost`, `BrandKit`, `UsageRecord`, `AuditLog`) must include `workspaceId` indexed with foreign-key constraints.
4. **Audit & Version History**: Never overwrite `CompositionVersion` records in place; insert a new immutable version row and update the pointer on `Composition.currentVersionId` inside a database transaction.
