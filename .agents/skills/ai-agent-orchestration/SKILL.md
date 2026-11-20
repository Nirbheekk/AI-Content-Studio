---
name: ai-agent-orchestration
description: >-
  Use this skill when implementing or modifying the AI Provider abstraction
  layer, the persistent workflow state machine, or any of the 9 specialized AI
  agents in the orchestration pipeline.
---

# AI Agent Orchestration Skill

## Responsibilities
- Maintain the provider-agnostic AI layer (`packages/ai-providers`) for LLM, Vision, STT, TTS, Image Generation, and Embeddings with token/cost tracking, timeouts, retries, and fallback chains.
- Coordinate the 9 specialized agents:
  1. Content Intelligence Agent
  2. Creative Director Agent
  3. Scriptwriter Agent
  4. Video Editor Agent
  5. Motion Designer Agent
  6. Rendering Agent
  7. Quality Assurance Agent
  8. Publishing Agent
  9. Analytics Agent
- Enforce the persistent workflow state machine:
  `PENDING` -> `ANALYZING` -> `PLANNING` -> `SCRIPTING` -> `COMPOSING` -> `RENDERING` -> `REVIEWING` -> `REVISING` -> `AWAITING_APPROVAL` -> `APPROVED` -> `SCHEDULED` -> `PUBLISHED` (plus `FAILED` and `CANCELLED`).

## Technical Standards
1. Persist every agent invocation (`AgentRun`) in PostgreSQL with input, structured Zod-validated output, latency, provider, model, token usage, and estimated cost in USD.
2. Automatically trigger the `REVISING` loop (capped at `maxQaIterations = 3`) when the Quality Assurance Agent detects frame defects (text overflow, bad contrast, empty frames, misaligned captions).
3. Halt at `AWAITING_APPROVAL` until a human user approves or requests conversational revisions.

## Implementation Workflow
1. Define the agent's input and output Zod schemas in `packages/shared`.
2. Implement the agent class extending `BaseAgent<TInput, TOutput>` with structured JSON output enforcement.
3. Register the stage handler in the Workflow State Machine and wire BullMQ event emission.

## Validation Requirements
- Agent output schema validation tests and state machine transition tests pass, including retry, revision loop, and approval checkpoint tests.
