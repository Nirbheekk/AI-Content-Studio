# Phase 11 Design System (`PHASE_11_DESIGN_SYSTEM.md`)

## 1. Design Philosophy

AI Content Studio is built around **"Describe it. Create it. Refine it. Publish it."** — combining precision creative tooling (Linear, Figma, Frame.io) with approachable SaaS clarity (Stripe, Vercel/v0, shadcn/ui).

Key design principles:
1. **Token-Driven Dual Polarity**: Every surface, border, text role, and status state adapts seamlessly between **Light Mode** (clean `#F7F8FC` workspace + `#FFFFFF` cards) and **Dark Mode** (obsidian `#11131B` workspace + `#191C27` cards), while keeping video/storyboard preview canvases (`--canvas`) dark in both modes for accurate color grading and subtitle legibility.
2. **Zero-FOUC Theme Engine**: An inline `THEME_INIT_SCRIPT` in `apps/web/src/app/layout.tsx` reads `localStorage.getItem('aicos-theme')` (or `prefers-color-scheme: dark`) before React hydrates, preventing flash of wrong theme.
3. **Information Architecture**: Navigation is grouped into five workflow-aligned sections (`WORKSPACE`, `CREATE`, `PUBLISH`, `INSIGHTS`, `MANAGE`) with a persistent `lg:` (`>=1024px`) sidebar, a compact mobile/tablet topbar + slide-over drawer (`<1024px`), and a global `Ctrl+K` / `Cmd+K` Command Palette.
4. **Accessibility & Craft**: WCAG 2.2 AA contrast pairings, `focus-visible` keyboard rings, `tabular-nums` on all numeric/timecode/metric displays, and `prefers-reduced-motion` support.

## 2. Core Components Built

- **Theme Layer** (`apps/web/src/components/theme/`):
  - `ThemeProvider` (`theme-provider.tsx`): `light` | `dark` | `system` state, `aicos-theme` persistence, live `matchMedia('(prefers-color-scheme: dark)')` listener.
  - `ThemeToggle` (`theme-toggle.tsx`): Segmented 3-way switch (`Light`, `Dark`, `System`) for desktop header and `compact` cycle button for mobile/tablet topbar.
- **Design System Primitives** (`apps/web/src/components/design-system/`):
  - `primitives.tsx`: `Button` (`primary`, `ai`, `secondary`, `outline`, `ghost`, `destructive`, `success` + `sm`/`md`/`lg` sizes), `Input`, `Textarea`, `Select`, `Badge` (`default`, `ai`, `success`, `warning`, `info`, `destructive`), `Card`, `PageHeader`, `MetricCard`, `EmptyState`, `ErrorState`, `Skeleton`, `StatusIndicator`.
  - `command-palette.tsx`: Keyboard-accessible (`Ctrl+K` / `Cmd+K`, `Escape`, arrow/filter) quick-jump palette across all 11 studio routes.
- **Creative Components** (`apps/web/src/components/creative/`):
  - `video-player.tsx`: Custom HTML5 `<video>` player with dark `--canvas` stage, play/pause overlay, scrubbable progress bar, mute toggle, timecode readout (`tabular-nums`), and download trigger.
- **Navigation & Auth Shell** (`apps/web/src/components/app-shell.tsx`):
  - `AuthScreen`: Split-value workspace entry with Sign In / Register & Onboard tabs, Demo Login shortcut, and embedded `ThemeToggle`.
  - `AppShell`: Grouped sidebar (`WORKSPACE`, `CREATE`, `PUBLISH`, `INSIGHTS`, `MANAGE`), workspace switcher + modal, Desktop Topbar (`Quick jump Ctrl+K`, `ThemeToggle`, `Create with AI`), Mobile/Tablet Topbar + Slide-over Drawer (`<1024px`), and global toast feedback banner.

## 3. Migrated Routes (14/14)

All 14 routes in `apps/web/src/app/` now consume semantic design tokens with zero hardcoded `bg-zinc-*`, `bg-indigo-*`, or `text-zinc-*` classes:
- `/`, `/login`, `/register`
- `/dashboard` (overview metrics, quick actions, recent projects & workflows)
- `/projects` (project CRUD & lifecycle management)
- `/library` (asset upload, magic-byte type filters, preview modal)
- `/studio` (3-pane AI production workspace, storyboard scenes, `VideoPlayer`, approval gate)
- `/editor` (multi-track timeline, granular AI scene editing, undo/redo, version diff, comments)
- `/repurpose` (long-form to multi-aspect short-form batch repurposing)
- `/brand-kit` (palette, typography, watermark/logo presets)
- `/publish` (Postiz OAuth accounts, platform validation, multi-platform composer, job queue)
- `/calendar` (monthly/list schedule grid, drag/reschedule & quick publish)
- `/analytics` (performance overview, engagement breakdown, AI insights, usage/quota)
- `/settings` (workspace members, RBAC roles, provider/key status, quotas)
