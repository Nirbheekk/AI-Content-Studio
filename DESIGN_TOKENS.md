# Design Tokens Reference (`DESIGN_TOKENS.md`)

**Source of Truth**: [`apps/web/src/app/globals.css`](./apps/web/src/app/globals.css) and [`apps/web/tailwind.config.ts`](./apps/web/tailwind.config.ts)

All styling across `apps/web` consumes semantic CSS variables mapped into Tailwind utility classes (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-ai-surface`, etc.). Light mode values live in `:root`, and Dark mode overrides live in `.dark`.

---

## 1. Surface & Foreground Tokens

| Token | Light (`:root`) | Dark (`.dark`) | Tailwind Class | Usage |
|---|---|---|---|---|
| `--background` | `#F7F8FC` | `#11131B` | `bg-background` | App canvas background |
| `--foreground` | `#191B2A` | `#F4F5FB` | `text-foreground` | Primary body & heading text |
| `--card` | `#FFFFFF` | `#191C27` | `bg-card` | Elevated card, panel, modal surface |
| `--card-foreground` | `#191B2A` | `#F4F5FB` | `text-card-foreground` | Text inside cards |
| `--popover` | `#FFFFFF` | `#222636` | `bg-popover` | Command palette, dropdowns, popovers |
| `--popover-foreground` | `#191B2A` | `#F4F5FB` | `text-popover-foreground` | Text inside popovers |
| `--secondary` | `#F0F1F8` | `#222636` | `bg-secondary` | Subtle button, input, pill surface |
| `--secondary-foreground` | `#292C3D` | `#E8EAF5` | `text-secondary-foreground` | Text on secondary surfaces |
| `--muted` | `#F0F1F8` | `#222636` | `bg-muted` | Disabled/subdued regions, skeletons |
| `--muted-foreground` | `#585D70` | `#A5ACC0` | `text-muted-foreground` | Metadata, helper text, timestamps |
| `--accent` | `#EDEAFF` | `#2E294D` | `bg-accent` | Active selection & hover highlight |
| `--accent-foreground` | `#4C3BC2` | `#D3CDFF` | `text-accent-foreground` | Text inside active highlight |

## 2. Brand, AI & Semantic Status Tokens

| Token | Light (`:root`) | Dark (`.dark`) | Tailwind Class | Usage |
|---|---|---|---|---|
| `--primary` | `#6956E8` | `#8B7CFF` | `bg-primary` / `text-primary` | Primary CTA, active rings, brand accent |
| `--primary-foreground` | `#FFFFFF` | `#11101D` | `text-primary-foreground` | Text on primary CTA |
| `--ai` | `#6956E8` | `#9B8DFF` | `bg-ai` / `text-ai` | AI Studio / agent actions |
| `--ai-foreground` | `#FFFFFF` | `#141224` | `text-ai-foreground` | Text on AI CTA |
| `--ai-surface` | `#F3F1FF` | `#23203A` | `bg-ai-surface` | AI badge/card highlight background |
| `--success` | `#15805B` | `#46C994` | `bg-success` / `text-success` | Approved, published, healthy states |
| `--success-surface` | `#E9F7F1` | `#152B23` | `bg-success-surface` | Success toast/badge surface |
| `--warning` | `#9A5B08` | `#F0B75D` | `bg-warning` / `text-warning` | Quota approaching, queued, retry |
| `--warning-surface` | `#FEF5E6` | `#2C2314` | `bg-warning-surface` | Warning banner/badge surface |
| `--info` | `#087A92` | `#4AC3DA` | `bg-info` / `text-info` | In-progress workflow, informational |
| `--info-surface` | `#E8F8FC` | `#132830` | `bg-info-surface` | Info banner/badge surface |
| `--destructive` | `#C83E4D` | `#F07883` | `bg-destructive` / `text-destructive` | Delete, failed, error states |
| `--destructive-foreground` | `#FFFFFF` | `#1E0E12` | `text-destructive-foreground` | Text on destructive CTA |

## 3. Studio, Timeline & Navigation Chrome Tokens

| Token | Light (`:root`) | Dark (`.dark`) | Tailwind Class | Usage |
|---|---|---|---|---|
| `--border` | `#E2E5F0` | `#2F3446` | `border-border` | Hairline 1px borders |
| `--input` | `#D5D9E6` | `#3A4054` | `border-input` | Form input/select borders |
| `--ring` | `#6956E8` | `#9B8DFF` | `ring-ring` | Keyboard focus ring |
| `--sidebar` | `#FFFFFF` | `#151823` | `bg-sidebar` | Left navigation rail background |
| `--sidebar-foreground` | `#292C3D` | `#F4F5FB` | `text-sidebar-foreground` | Sidebar text |
| `--sidebar-primary` | `#6956E8` | `#9B8DFF` | `text-sidebar-primary` | Active nav text/icon |
| `--sidebar-accent` | `#F0EEFF` | `#26243A` | `bg-sidebar-accent` | Active nav item fill |
| `--sidebar-border` | `#E5E7F0` | `#2B3040` | `border-sidebar-border` | Sidebar divider |
| `--canvas` | `#141722` | `#0D0F16` | `bg-canvas` | Video preview stage (always dark for true-color media accuracy) |
| `--timeline` | `#EAECEF` | `#151823` | `bg-timeline` | Multi-track timeline surface |
| `--video` | `#6956E8` | `#9B8DFF` | `bg-video` | Video track accent |
| `--audio` | `#087A92` | `#4AC3DA` | `bg-audio` | Audio track accent |
| `--image` | `#15805B` | `#46C994` | `bg-image` | Image/overlay track accent |

## 4. Typography, Radius & Motion Tokens

- **Fonts** (`next/font/google` in `apps/web/src/app/layout.tsx`):
  - `--font-sans`: `Inter` (`font-sans`)
  - `--font-mono`: `JetBrains Mono` (`font-mono`)
  - Utility: `.tabular-nums` (`font-variant-numeric: tabular-nums`) for frame counters, durations, metrics, and quotas.
- **Border Radius** (`--radius: 0.75rem`):
  - `rounded-sm` (`calc(var(--radius) - 6px)`), `rounded-md` (`calc(var(--radius) - 4px)`), `rounded-lg` (`calc(var(--radius) - 2px)`), `rounded-xl` (`var(--radius)`), `rounded-2xl` (`calc(var(--radius) + 4px)`).
- **Motion**:
  - `duration-fast` (`120ms`), `duration-normal` (`200ms`), `duration-slow` (`300ms`).
  - `@media (prefers-reduced-motion: reduce)` collapses all durations/animations to `0.01ms`.
