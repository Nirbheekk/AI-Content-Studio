# TypeScript Standards

1. **Strict Mode Mandatory**: All `tsconfig.json` files across the monorepo must enable `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, and `"exactOptionalPropertyTypes": true`.
2. **No `any`**: Do not use `any` or `@ts-ignore`. Use `unknown` with Zod schema parsing or type guards at all trust boundaries.
3. **Runtime Boundary Validation**: Validate all incoming HTTP payloads, query parameters, webhook bodies, environment variables, and LLM structured JSON outputs with Zod schemas from `@ai-content-os/shared`.
4. **Shared Contracts**: Share DTOs, workflow enums, composition AST schemas, and SSE event payloads via `packages/shared` so frontend, API, and workers never drift out of sync.
