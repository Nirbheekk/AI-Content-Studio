# Coding Conventions

1. **Modularity & Single Responsibility**: Keep files focused and under 350 lines where practical. Separate HTTP routing, request validation, business service logic, data access, and queue producers.
2. **Error Handling**: Use typed domain error classes (`AppError`, `ValidationError`, `AuthenticationError`, `ForbiddenError`, `NotFoundError`, `QuotaExceededError`, `ExternalProviderError`) with HTTP status codes and machine-readable `errorCode` fields. Never swallow errors silently.
3. **Idempotency**: All BullMQ job processors and publishing endpoints must accept and enforce an `idempotencyKey` to prevent duplicate charges, duplicate renders, or duplicate social posts on retry.
4. **No Placeholder UI or Fake Wiring**: Every UI button, form, and action must connect to a real backend endpoint and database state. Where external third-party credentials (e.g., ElevenLabs, OpenAI, Postiz live accounts) are absent in local dev, route through a clearly labeled `SimulatedProviderAdapter` that logs, persists, and returns deterministic valid media/payloads labeled `[SIMULATED]`.
5. **Naming Conventions**:
   - React components and TypeScript types/interfaces: `PascalCase`
   - Functions, variables, instances: `camelCase`
   - Constants and env vars: `UPPER_SNAKE_CASE`
   - Files and directories (except React component files if convention dictates): `kebab-case`
