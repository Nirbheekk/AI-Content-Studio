# Phase 11 — UI/UX Research & Design System Proposal (`PHASE_11_UI_UX_RESEARCH.md`)

**Date:** 2026-11-21  
**Baseline Commit:** `a76707d` (branch `main`)  
**Target:** AI Content Studio (`apps/web`, Next.js 15.5.29 + Tailwind CSS 3.4)

---

## 1. Existing Frontend Audit
- **Files Inspected:** `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/app-shell.tsx`, and all 14 routes (`/`, `/login`, `/register`, `/dashboard`, `/projects`, `/library`, `/studio`, `/editor`, `/repurpose`, `/brand-kit`, `/publish`, `/calendar`, `/analytics`, `/settings`).
- **Identified Problems:**
  1. **Dark-Only Hardcoding:** `layout.tsx` forces `<html className="dark">` and `globals.css` hardcodes `#09090b` / `#fafafa`. Across `apps/web/src/`, **648 lines** use hardcoded `bg-zinc-*`, `text-zinc-*`, `border-zinc-*`, `bg-indigo-*`, `bg-white`, `text-white`, and `bg-black`. There is no Light Mode, no System preference tracking, and no theme toggle.
  2. **Minimal Token Config:** `tailwind.config.ts` defines only `background`, `surface`, and `accent` as static hex strings rather than CSS variables.
  3. **No Shared Design System:** Zero reusable UI primitives (`Button`, `Card`, `Badge`, `Input`, `Select`, `Tabs`, `Dialog`, `EmptyState`, `PageHeader`, `MetricCard`, `CommandPalette`). Every route duplicates raw HTML controls with inconsistent padding (`p-3`/`p-4`/`p-6`) and radii (`rounded`/`rounded-lg`/`rounded-xl`/`rounded-2xl`).
  4. **Flat Navigation & Missing Global Utilities:** `app-shell.tsx` renders an ungrouped 11-link sidebar, with no desktop topbar, no `Cmd+K` command palette, no theme switcher, and no collapsible desktop/mobile workspace ergonomics.
  5. **Typography & Contrast:** Uses generic system font stack instead of `Inter` / `JetBrains Mono` with tabular numerals (`tabular-nums`) for metrics and timecodes. Several `text-zinc-500` on `bg-zinc-900` labels fall below WCAG 2.2 AA 4.5:1 contrast.
  6. **AI Studio & Dashboard Density:** `/dashboard` and `/studio` expose dense developer-centric controls upfront without progressive disclosure or clear creative hierarchy.

---

## 2. Proposed Design System ("Creative Intelligence")
- **Identity:** Precision SaaS craftsmanship (Linear/Stripe clarity) paired with expressive violet creative accents (`#6956E8` light / `#9B8DFF` dark) and restrained cyan secondary highlights (`#087D96` light / `#58C6DA` dark).
- **Theme Architecture:**
  - CSS variables in `globals.css` (`:root` for Light, `.dark` for Dark) mapped to Tailwind semantic utilities in `tailwind.config.ts` (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, `bg-ai`, `text-success`, `text-warning`, `text-info`, `bg-sidebar`, `chart-1`..`5`, `video`, `audio`, `image`, `timeline`, `canvas`).
  - `ThemeProvider` supporting `light | dark | system` with `localStorage` persistence (`aicos-theme`) and an inline `<script>` in `<head>` to prevent FOUC and hydration mismatch.
- **Typography:** `Inter` (`next/font/google`) + `JetBrains_Mono` for timecodes/IDs, `tabular-nums` on all metrics/timers.
- **Component Architecture:**
  - `src/lib/cn.ts` (clean class merger)
  - `src/components/theme/theme-provider.tsx` & `theme-toggle.tsx`
  - `src/components/design-system/*` (`Button`, `Input`, `Textarea`, `Select`, `Badge`, `Card`, `Tabs`, `Dialog`, `EmptyState`, `Skeleton`, `PageHeader`, `MetricCard`, `StatusIndicator`, `CommandPalette`)
  - `src/components/layout/*` (`AppShell`, grouped `Sidebar` (`WORKSPACE`, `CREATE`, `PUBLISH`, `INSIGHTS`, `MANAGE`), `Topbar`, `MobileNavigation`)
  - `src/components/creative/*` (`VideoPlayer`, `WorkflowProgress`, `AIComposer`)
