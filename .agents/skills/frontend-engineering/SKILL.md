---
name: frontend-engineering
description: >-
  Use this skill when building or modifying Next.js pages, React components,
  Tailwind CSS styles, shadcn/ui primitives, Framer Motion animations, SSE live
  feeds, or the AI Studio and Interactive Video Editor interfaces.
---

# Frontend Engineering Skill

## Responsibilities
- Implement the minimalist dark-first SaaS UI inspired by Lovable, Linear, Descript, and Postiz.
- Build the core modules: Dashboard, Content Library, AI Studio (3-pane workspace with chat, live production plan, and Remotion Player preview), Interactive Video Editor, Repurposing Studio, Social Publishing Center, Content Calendar, and Brand Kit.
- Connect all UI views to real API endpoints and Server-Sent Events (SSE) for real-time workflow state synchronization.

## Technical Standards
1. Use Next.js App Router, React 19/18, TypeScript strict mode, Tailwind CSS, shadcn/ui, Framer Motion, and Lucide Icons.
2. Embed `@remotion/player` for instant client-side previewing of validated `CompositionSpec` JSON states without waiting for full MP4 renders.
3. Implement loading skeletons, empty states, error boundaries, and retry actions on every view.
4. Never leave dead buttons or mock-only views disconnected from backend persistence.

## Implementation Workflow
1. Verify API DTO contracts in `packages/shared` and `docs/API_DOCUMENTATION.md`.
2. Build accessible, responsive UI components with dark-mode neutral tokens (`zinc-950`, `zinc-900`, subtle borders `zinc-800`, accent gradients).
3. Wire state mutations and SSE subscriptions (`EventSource`) to restore full progress on page refresh.

## Validation Requirements
- Component and page TypeScript compilation passes without errors.
- Playwright E2E tests verify interactive flows, loading states, and persistence across reloads.
