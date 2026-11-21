# Phase 12 — Comprehensive UX & Visual Excellence Audit (`PHASE_12_UX_AUDIT.md`)

- **Date**: 2026-11-21
- **Baseline Commit**: `1f97d6b` (`main`)
- **Audit Scope**: Live inspection of `http://localhost:8080` across Light & Dark themes (`1280x800`) + full code inspection of `apps/web/src/`.

---

## 1. Baseline Screenshot Inventory (`1280x800`)

- **Dashboard (Dark)**: `step_97_shot_1_phase12-before-dashboard-dark.png`
- **Dashboard (Light)**: `step_124_shot_1_phase12-before-dashboard-light.png`
- **AI Studio (Dark)**: `step_124_shot_2_phase12-before-studio-dark.png`
- **AI Studio (Light)**: `step_97_shot_3_phase12-before-studio-light.png`
- **Video Editor (Dark)**: `step_97_shot_5_phase12-before-editor-dark.png`
- **Video Editor (Light)**: `step_124_shot_3_phase12-before-editor-light.png`
- **Projects (Dark)**: `step_105_shot_1_phase12-before-projects-dark.png`
- **Media Library (Dark)**: `step_105_shot_2_phase12-before-library-dark.png`
- **Repurpose Engine (Dark)**: `step_105_shot_3_phase12-before-repurpose-dark.png`
- **Publishing Center (Dark)**: `step_105_shot_4_phase12-before-publish-dark.png`
- **Content Calendar (Dark)**: `step_105_shot_5_phase12-before-calendar-dark.png`
- **Analytics & Intelligence (Dark)**: `step_105_shot_6_phase12-before-analytics-dark.png`
- **Brand Kit (Dark)**: `step_105_shot_7_phase12-before-brand-kit-dark.png`
- **Settings & RBAC (Dark)**: `step_105_shot_8_phase12-before-settings-dark.png`

---

## 2. Global System & Component Audit

- **Strengths**:
  - Stationary `100dvh` sidebar (`app-shell.tsx`) with independent `<main>` scrolling and mobile/tablet slide-over drawer.
  - Zero-FOUC theme initialization script and semantic CSS variables in `globals.css` (`:root` + `.dark`).
  - Global `Ctrl+K` Command Palette and `Inter` + `JetBrains Mono` typography.
- **Global Issues Found**:
  1. **Theme Switch Transition Desync (High)**: `body` applies `transition-colors duration-200`, while `Card`, `Sidebar`, and nav items either lack color transition or use `duration-fast` (`120ms`), causing surfaces and text to flip at different speeds when toggling Light/Dark. Removing `transition-colors duration-200` from `body` makes theme switches crisp and instantaneous across all surfaces simultaneously (Linear/Vercel pattern).
  2. **Residual Hardcoded Status Colors (High)**: `projects/page.tsx`, `library/page.tsx`, `publish/page.tsx`, `calendar/page.tsx`, `analytics/page.tsx`, and `repurpose/page.tsx` still contain `text-red-300`, `text-red-200`, `bg-red-600 text-foreground`, `text-cyan-300`, `text-cyan-200`, and `bg-cyan-600 text-foreground`. In Light mode, `bg-red-600 text-foreground` renders dark slate text on a red button, and `text-red-300`/`text-cyan-300` fail WCAG 2.2 AA contrast on light backgrounds.
  3. **Primitive Adoption Gap (High)**: Only `/dashboard` and `/studio` consume `PageHeader`, `Card`, `Button`, `Input`, `Select`, `Textarea`, `Badge`, and `EmptyState` from `primitives.tsx`; the other 9 routes still use raw HTML controls.

---

## 3. Route-by-Route Audit

### Route 1: Dashboard (`/dashboard`) — **Priority: CRITICAL**
1. **Current Design Strengths**: Clean 4-column metric row, quick-create banner, and workspace project creation modal.
2. **Visual Problems**: Header subtitle exposes raw technical metadata (`Role: OWNER • Slug: phase-11-studio-1763721862626`); `Brand Kit Identity` card truncates tone of voice text (`Authoritative, engaging, con...`).
3. **Usability Problems**: Lacks direct 1-click creative workflow launchers for all 5 core jobs (`Create a video`, `Generate social content`, `Repurpose existing content`, `Upload media`, `Open AI Studio`); audit log displays raw uppercase enum constants (`PROJECT_CREATED`) without timestamps.
4. **Information Hierarchy Problems**: Does not surface real publishing pipeline status (scheduled posts, published posts, pending approval workflows) on the overview command center.
5. **Inconsistent Components**: Audit rows and project rows lack icons, status indicators, and updated timestamps.
6. **Missing States**: Missing Upcoming Publishing & Pending Approvals section using real `/api/v1/publishing/dashboard` data.
7. **Recommended Improvements**:
   - Redesign into a Creative Command Center with context-aware greeting + workspace header, 6 real data-backed KPIs (Total Projects, Content Assets, Active AI Workflows, Pending Approvals, Scheduled Posts, Published Content), 5-card Quick Creation bar, Continue Working cards (Recent Projects & Active Sessions with timestamps and status), Upcoming Publishing & Approvals feed, and formatted Recent Workspace Activity timeline.

### Route 2: AI Studio (`/studio`) — **Priority: CRITICAL**
1. **Current Design Strengths**: 3-pane production architecture (Sessions, Prompt/Storyboard, Preview/QA/Approval), live SSE stream, and interactive frame player.
2. **Visual Problems**: Single-line `<Input>` prompt box feels cramped for creative briefs; `QA stress test` checkbox crowds the primary `Produce & Render` CTA; assistant messages render as flat unformatted paragraphs.
3. **Usability Problems**: No inline source media context/upload inside AI Studio — users have to leave `/studio` and visit `/library` to see or upload project assets before prompting; no prompt starter templates for new users.
4. **Information Hierarchy Problems**: No visual pipeline stepper showing the 7 real orchestration stages (`ANALYZING` → `PLANNING` → `SCRIPTING` → `COMPOSING` → `RENDERING` → `REVIEWING` → `AWAITING_APPROVAL` / `APPROVED`).
5. **Inconsistent Components**: Raw range input and unstyled message bubbles.
6. **Missing States**: Explicit stage indicators distinguishing Waiting, Processing, Completed, Failed, and Requires User Action (`AWAITING_APPROVAL`), plus inline project asset pills + quick upload button.
7. **Recommended Improvements**:
   - Add an inline **Project Source Assets** bar with real asset pills + direct quick upload right inside AI Studio.
   - Upgrade prompt composer to a multi-line `Textarea` composer (`Ctrl+Enter` / `Cmd+Enter` shortcut, prompt starter pills, active project badge, collapsible QA test toggle).
   - Add a 7-stage **Workflow Pipeline Progress Bar** driven strictly by real `activeWorkflow.stage` / `sseEvents`.
   - Format assistant/agent responses into structured cards with agent badges, timestamps, and clear scene/script breakdown cards.

### Route 3: Video Editor (`/editor`) — **Priority: HIGH**
1. **Current Design Strengths**: Aspect ratio switcher (`9:16`, `16:9`, `1:1`, `4:5`), granular AI scene prompt, manual scene inspector, version diff viewer, frame comments, and `.SRT` subtitle drawer.
2. **Visual Problems**: Preview headline uses `text-foreground` on `compiled.brand.primaryColor`, turning dark and low-contrast in Light mode; toolbar mixes raw buttons of varying heights.
3. **Usability Problems**: When no composition exists, toolbar buttons are disabled without explanation, while the `Comment` button remains enabled (`Comment on frame 0...`).
4. **Information Hierarchy Problems**: Timeline shows only a single row of scene buttons instead of clear multi-track lanes (`Video / Layout Track`, `Motion Overlays Track`, `Captions & Narration Track`) with a playhead ruler.
5. **Inconsistent Components**: Uses raw `<button>`, `<input>`, `<select>`, `<textarea>` instead of design-system primitives.
6. **Missing States**: Helpful `EmptyState` when no composition is loaded, explaining how to generate one in AI Studio or Repurpose Engine with direct action links.
7. **Recommended Improvements**:
   - Convert toolbar, inspector, diff viewer, and comments to design-system primitives (`PageHeader`, `Card`, `Button`, `Input`, `Select`, `Textarea`, `Badge`, `EmptyState`).
   - Fix preview canvas text contrast (`text-white` on dark stage) and embed `VideoPlayer` for rendered MP4 output.
   - Upgrade timeline into a 3-track studio timeline (`V1 Scenes`, `FX Overlays`, `CC Captions`) with frame ruler, playhead progress bar, and active scene highlighting.

### Route 4: Projects (`/projects`) — **Priority: HIGH**
1. **Current Design Strengths**: Filter tabs (`ALL`, `ACTIVE`, `ARCHIVED`), search input, edit modal, and delete confirmation dialog.
2. **Visual Problems**: 5 action buttons per card wrap awkwardly onto two rows; `Delete` button uses `text-red-300` / `bg-red-600 text-foreground` which breaks Light mode contrast.
3. **Usability Problems**: Cards lack visual preview header/thumbnail accent, composition count, and last-updated date; raw test slugs/timestamps in project names can dominate card titles if unformatted.
4. **Information Hierarchy Problems**: Secondary actions (`Rename`, `Archive`, `Delete`) compete visually with the primary `Open AI Studio` CTA.
5. **Inconsistent Components**: Raw HTML inputs, buttons, and empty state box.
6. **Missing States**: Skeleton loading cards and `EmptyState` with CTA.
7. **Recommended Improvements**:
   - Redesign project cards with a visual studio preview banner, status badge, clean display title helper (with full name tooltip), 4-metric counter bar (`Assets`, `Sessions`, `Workflows`, `Compositions`), primary `Open in AI Studio` button, and grouped secondary actions with semantic `destructive` delete confirmation dialog.

### Route 5: Media Library (`/library`) — **Priority: HIGH**
1. **Current Design Strengths**: Magic-byte verified upload flow, project & media-type filters, AI Analyze & Transcribe trigger, and asset inspection modal with SHA-256 checksum, transcript, and detected scenes.
2. **Visual Problems**: `Delete` button uses `text-red-300` and `sc.isBroll` uses `text-cyan-300` (poor contrast in Light mode); upload box is a plain 4-column input row without a visual dropzone.
3. **Usability Problems**: Folder path and tags inputs pre-fill literal strings (`/raw-clips`, `podcast, hook`) instead of clean defaults/placeholders; lacks Grid vs List view toggle; asset card and inspection modal don't render inline `<video>` / `<audio>` / `<img>` preview when `downloadUrl` is available.
4. **Information Hierarchy Problems**: Asset type (`VIDEO`, `AUDIO`, `IMAGE`, `DOCUMENT`) lacks distinct visual thumbnails/icons on cards.
5. **Inconsistent Components**: Raw `<select>`, `<input>`, `<button>` controls.
6. **Missing States**: Grid/List toggle, Skeleton loading state, and `EmptyState` with upload trigger.
7. **Recommended Improvements**:
   - Add a visual Upload Dropzone card + Grid/List view switcher, media-type thumbnail preview headers (rendering real `<img>`/`<video>` when `downloadUrl` exists, or distinct media-type studio preview cards), semantic badges, and inline media playback inside the Inspect dialog.

### Route 6: Repurpose Engine (`/repurpose`) — **Priority: MEDIUM**
1. **Current Design Strengths**: Generates multi-platform video compositions, quote graphics, and written social copy in one batch.
2. **Visual Problems**: `text-cyan-400` on hashtags has weak Light mode contrast; below the form is empty space before generation runs.
3. **Usability Problems**: Doesn't preview what target deliverables will be generated before clicking submit; generated written posts lack a one-click `Copy Post` or `Send to Publishing` action.
4. **Information Hierarchy Problems**: Source selection, target deliverables summary, and generated outputs need clearer visual separation.
5. **Inconsistent Components**: Raw HTML form controls and `<video>` tag instead of `Card`, `Button`, `Input`, `Select`, `Textarea`, `Badge`, `VideoPlayer`.
6. **Missing States**: Pre-generation target format preview cards (clearly labeled as "Target Deliverables to Generate" vs "Generated Batch Outputs").
7. **Recommended Improvements**:
   - Migrate to design-system primitives, add a clear Target Deliverables preview matrix before run, use `VideoPlayer` for generated MP4s, and add `Copy Copy & Hashtags` + `Open in Publishing` actions on generated written posts.

### Route 7: Publishing Center (`/publish`) — **Priority: HIGH**
1. **Current Design Strengths**: OAuth connection modal with AES-256-GCM storage, platform capability rules, Human Approval Gate checkbox, and 4-tab job queue (`Scheduled`, `Published`, `Failed`, `In-Flight`).
2. **Visual Problems**: `bg-red-600 text-foreground`, `text-red-300`, `bg-cyan-600 text-foreground`, `text-cyan-300` fail contrast in Light mode.
3. **Usability Problems**: When `0` accounts are connected, the composer submit button is disabled without an inline callout guiding the user to connect an account on the left first.
4. **Information Hierarchy Problems**: Status badges rely heavily on color without icons (`CheckCircle2`, `Clock`, `AlertTriangle`, `ShieldCheck`).
5. **Inconsistent Components**: Raw form inputs, buttons, and tabs.
6. **Missing States**: Helpful `EmptyState` inside each queue tab (`Scheduled`, `Published`, `Failed`, `Queue`) and clear `[SIMULATED SANDBOX]` badge with icon.
7. **Recommended Improvements**:
   - Replace all raw controls and hardcoded red/cyan classes with semantic primitives and icon-backed status badges, add an inline account-required notice when no social account is connected, and clearly distinguish sandbox vs live publications.

### Route 8: Content Calendar (`/calendar`) — **Priority: MEDIUM**
1. **Current Design Strengths**: Month / Week / Day views, platform/account/status/timezone filters, drag-and-drop date rescheduling, and post inspector modal.
2. **Visual Problems**: `text-red-200`, `bg-red-950/25`, `text-cyan-200`, `bg-cyan-950/20` on calendar event cards become illegible in Light mode!
3. **Usability Problems**: Calendar day cells show full ISO string (`2026-11-21`) instead of clean day number (`21`) with month context and a `"Today"` pill; empty cells lack a quick `"Schedule post"` link to `/publish`.
4. **Information Hierarchy Problems**: Event cards need distinct status icons alongside semantic colors.
5. **Inconsistent Components**: Raw filter selects and modal controls.
6. **Missing States**: Legend bar showing `Scheduled`, `Published`, `In-Flight`, `Failed`, and `Cancelled` states.
7. **Recommended Improvements**:
   - Fix Light/Dark event card contrast with semantic `success`, `primary`, `destructive`, `info`, and `muted` tokens + status icons, format day headers cleanly (`21` + `Today` badge), and add a status legend + quick link to `/publish`.

### Route 9: Analytics & Intelligence (`/analytics`) — **Priority: HIGH**
1. **Current Design Strengths**: Honest non-fabricated snapshot reporting, CSV export, Evidence-based vs AI-hypothesis separation, and Quota/Usage/Invoice management.
2. **Visual Problems**: Provider warning badge wraps tightly inside `<p>`; `bg-red-500` and raw table styles lack polish.
3. **Usability Problems**: Empty performance state hides the 6 core metric headers (`Views`, `Impressions`, `Reach`, `Likes`, `Comments`, `Shares`) instead of showing `0` / `Unavailable` cards alongside the empty-state explanation.
4. **Information Hierarchy Problems**: Date range and platform filters sit inline with main view tabs (`Performance`, `AI Insights`, `Usage & Billing`).
5. **Inconsistent Components**: Raw `<button>`, `<input>`, `<select>`, and `<table>`.
6. **Missing States**: Clear `EmptyState` action to jump to `/publish` when no published post snapshots exist.
7. **Recommended Improvements**:
   - Separate top tabs from the date/platform filter bar, always display the 6 KPI summary cards (showing real totals or `0` when no snapshots exist) above the chart/empty state, refine `TrendChart` and tables for Light & Dark themes, and style Evidence vs AI Hypothesis cards with clear badges.

### Route 10: Brand Kit (`/brand-kit`) — **Priority: MEDIUM**
1. **Current Design Strengths**: Persists brand colors, fonts, caption preset, tone of voice, editing style, target audience, and guidelines.
2. **Visual Problems**: Color fields are plain text inputs with no color swatches or native color pickers.
3. **Usability Problems**: Users cannot preview how their chosen `primaryColor`, `secondaryColor`, `accentColor`, `headingFont`, and `captionStyle` look together before saving.
4. **Information Hierarchy Problems**: All inputs sit in a single flat 2-column form without grouping into **Visual Identity (Colors & Typography)**, **Brand Voice & Choreography**, and **Live Studio Preview**.
5. **Inconsistent Components**: Raw inputs/selects/buttons.
6. **Missing States**: Live interactive 9:16 brand frame preview.
7. **Recommended Improvements**:
   - Pair each hex input with a live `<input type="color">` swatch picker and add a **Live 9:16 Brand Frame Preview** showing the headline, caption highlight preset, and palette in real time.

### Route 11: Team & Settings (`/settings`) — **Priority: MEDIUM**
1. **Current Design Strengths**: Workspace name settings, RBAC member list, invitation token generator, and invitation acceptor.
2. **Visual Problems**: Duplicate Brand Kit fields occupy the left column without color swatches or a link to the full `/brand-kit` studio.
3. **Usability Problems**: Generated invitation token has no one-click `Copy Token` button; lacks an explicit **Appearance & Theme** preference card (`Light`, `Dark`, `System`) on the Settings page.
4. **Information Hierarchy Problems**: Member list and pending invitations are combined in one header without showing pending invitation rows.
5. **Inconsistent Components**: Raw inputs and buttons.
6. **Missing States**: Copy-token feedback and Theme Preference section.
7. **Recommended Improvements**:
   - Add an **Appearance & Theme** settings card (`Light`, `Dark`, `System`), add a one-click `Copy Token` button on generated RBAC tokens, display pending invitations clearly, link Brand Kit settings to `/brand-kit`, and migrate all controls to design-system primitives.
