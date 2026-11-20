---
name: security-auditing
description: >-
  Use this skill when auditing or implementing authentication, RBAC, AES-256-GCM
  credential encryption, file upload validation, rate limiting, CSRF protection,
  audit logging, or container sandboxing.
---

# Security Auditing Skill

## Responsibilities
- Enforce authentication, workspace RBAC (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`), project-level access controls, and audit logging across all endpoints.
- Encrypt third-party social OAuth credentials and workspace API keys at rest using AES-256-GCM (`ENCRYPTION_MASTER_KEY`).
- Ensure untrusted uploads and AI-generated compositions cannot execute arbitrary code or escape container boundaries.

## Technical Standards
1. Never return encrypted secret ciphertexts, password hashes, or internal tokens in API responses.
2. Verify file uploads via magic-byte header inspection (`file-type`), enforce strict MIME allowlists (`video/*`, `audio/*`, `image/*`, `application/pdf`), and reject path traversal filenames.
3. Enforce Redis-backed sliding-window rate limits on authentication, upload, and AI generation endpoints.

## Implementation Workflow
1. Audit new routes against the RBAC matrix and input validation rules.
2. Verify encryption/decryption round-trips and audit log entries in security unit/integration tests.

## Validation Requirements
- Unauthorized (`401`), cross-workspace (`403`), rate-limited (`429`), and malformed payload (`400`) test cases pass.
