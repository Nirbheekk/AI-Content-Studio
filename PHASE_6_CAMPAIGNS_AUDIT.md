# Phase 6 — Autonomous Creative Campaigns & Orchestration Audit

## Existing Foundation Reused
- `BrandKit`, `Asset`, `Composition`, `CompositionVersion`, `AuditLog` in Prisma.
- `estimateWorkflowPreflightCost` (`apps/api/src/services/cost-estimator.service.ts`) for preflight campaign cost & budget enforcement.
- `CompositionSpecSchema` (`packages/shared/src/composition.ts`) for deterministic editable deliverables.

## Gaps Closed in Stage 6
- Added `Campaign`, `CampaignTask` (8-node durable DAG), and `CampaignDeliverable` Prisma models.
- Enforced strict 16-state `CAMPAIGN_ALLOWED_TRANSITIONS` lifecycle machine (`DRAFT` → `PLANNING` → `AWAITING_PLAN_APPROVAL` → `PRODUCING` → `CREATIVE_REVIEW` → `AWAITING_APPROVAL` → `READY_TO_SCHEDULE` → `SCHEDULED` → `PUBLISHING` → `PUBLISHED`, plus `PAUSED`, `NEEDS_ATTENTION`, `PARTIALLY_COMPLETED`, `FAILED`, `CANCELLED`, `ARCHIVED`).
- Blocked production before explicit human plan approval and blocked automatic publishing without explicit human deliverable approval.
