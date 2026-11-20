---
name: testing-qa
description: >-
  Use this skill when writing or executing Vitest unit tests, API and database
  integration tests, workflow and composition tests, or Playwright end-to-end
  browser tests.
---

# Testing and Quality Assurance Skill

## Responsibilities
- Ensure every feature satisfies the 10-point Definition of Done with empirical automated tests.
- Maintain test suites for unit logic, database repositories, REST API endpoints, 9-agent workflow state transitions, Remotion composition compilation, Postiz adapter contracts, and E2E browser journeys.

## Technical Standards
1. Use Vitest for unit and backend integration tests; use Playwright for E2E browser tests.
2. Never consider a feature complete based on UI rendering alone; verify end-to-end persistence from UI action -> API -> DB/Queue -> Worker -> SSE -> UI update.
3. Test failure recovery, idempotency, retry backoff, and human approval checkpoints.

## Implementation Workflow
1. Write unit tests for pure domain logic and schema validators.
2. Write API/DB integration tests verifying database state mutations and RBAC guards.
3. Run the test suite and capture empirical output in `docs/PROJECT_STATUS.md` and `STATE.md`.

## Validation Requirements
- Zero failing tests across unit, integration, and E2E test suites before advancing to the next milestone.
