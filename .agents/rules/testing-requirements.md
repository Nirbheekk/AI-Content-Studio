# Testing Requirements

1. **Test Pyramid Enforced**: No phase or milestone is complete without passing unit tests (Vitest), API & database integration tests (Vitest + Supertest against real PostgreSQL/Redis), and end-to-end browser verification (Playwright).
2. **Required Coverage Areas**:
   - Authentication & workspace RBAC enforcement
   - Multipart/folder asset upload & metadata extraction
   - Composition JSON AST validation, compiler, undo/redo versioning
   - 9-Agent workflow state transitions, idempotency, retry & human approval gate
   - Remotion headless frame/clip rendering verification
   - Postiz publishing adapter & token encryption
3. **Deterministic Mocks for External SaaS**: When live external API keys (OpenAI, Anthropic, ElevenLabs, Postiz Cloud) are unavailable in CI/local test runs, tests must exercise the full adapter contract using deterministic mock providers that validate request schemas and simulate realistic responses and failure modes.
