# Phase 7 — Client Collaboration, Review & Approval Audit

## Security & Collaboration Requirements Audited
- **Token Hygiene**: Review tokens are 24-byte `base64url` random secrets; only SHA-256 hashes (`tokenHash`, `passwordHash`) are persisted in PostgreSQL, compared with `timingSafeEqual`.
- **Zero Workspace Leakage**: Public `/api/v1/public/review/:token` responses return strictly scoped deliverable title, version, signed stream URL, comments, and approvals—zero `workspaceId`, member lists, or private keys.
- **Version-Bound Approvals**: Every `ApprovalRecord` pins `compositionVersionId` and `versionNumber`. Creating `v2` immediately sets `isCurrentVersionApproved = false` until `v2` receives its own approval.
- **Notification Idempotency**: `Notification.dedupeKey` enforces unique upsert semantics to prevent duplicate alerts.
