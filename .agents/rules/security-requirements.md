# Security Requirements

1. **Secret Management**: Never hardcode API keys, JWT secrets, database credentials, or OAuth tokens. Never expose server-side secrets via `NEXT_PUBLIC_*` environment variables.
2. **Encrypted Credentials at Rest**: Encrypt all connected third-party OAuth access/refresh tokens (`SocialAccount`) and workspace-level provider keys using AES-256-GCM with an environment-injected master key (`ENCRYPTION_MASTER_KEY`).
3. **Authentication & RBAC**: Authenticate all API and SSE endpoints via signed JWT/session tokens. Enforce workspace membership and role checks (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) on every query and mutation.
4. **Untrusted Input & Asset Security**: Validate file uploads using magic-byte MIME inspection (not just file extension), enforce size quotas, sanitize filenames, store raw uploads in private S3/MinIO buckets, and serve media solely via short-lived pre-signed URLs.
5. **Untrusted AI Output**: Never execute raw LLM-generated JavaScript/TypeScript via `eval`, `Function`, or dynamic `import()` in the API or browser. All Remotion compositions are compiled from a strict Zod-validated declarative JSON AST inside the isolated `rendering-worker`.
