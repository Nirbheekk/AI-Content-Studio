# Phase SOTA — Page-by-Page Product & UX Audit

**Date**: 2026-11-22  
**Method**: Live Playwright inspection across all 14 Next.js routes at `http://localhost:8080` (`1440×900` desktop & `390×844` mobile) + source audit of `apps/web/src/app/**/page.tsx`.

---

## 1. Live 14-Route Baseline Health

| Route | HTTP | H1 Heading | Controls (`btn`/`inp`) | Desktop Overflow | Mobile Overflow | Console Errors |
|---|---|---|---|---|---|---|
| `/` | 200 | Auth / Landing | — | `false` | `false` | `0` |
| `/login` | 200 | Sign In | — | `false` | `false` | `0` |
| `/register` | 200 | Register | — | `false` | `false` | `0` |
| `/dashboard` | 200 | Command Center | `19` / `3` | `false` | `false` | `0` |
| `/studio` | 200 | AI Studio | `37` / `7` | `false` | `false` | `0` |
| `/editor` | 200 | Video Editor | `31` / `11` | `false` | `false` | `0` |
| `/repurpose` | 200 | Repurpose Engine | `18` / `11` | `false` | `false` | `0` |
| `/projects` | 200 | Projects | `114` / `1` | `false` | `false` | `0` |
| `/library` | 200 | Media Library | `73` / `3` | `false` | `false` | `0` |
| `/brand-kit` | 200 | Brand Kit | `11` / `16` | `false` | `false` | `0` |
| `/publish` | 200 | Social Publishing Center | `20` / `10` | `false` | `false` | `0` |
| `/calendar` | 200 | Content Calendar | `16` / `4` | `false` | `false` | `0` |
| `/analytics` | 200 | Analytics & Intelligence | `17` / `3` | `false` | `false` | `0` |
| `/settings` | 200 | Team & Settings | `14` / `3` | `false` | `false` | `0` |

---

## 2. Route-by-Route SOTA Defect & Opportunity Register (`P0–P3`)

| Route | Sev | Finding / Gap | Recommended SOTA Fix |
|---|---|---|---|
| `/dashboard` | **P1** | No dedicated "Needs Attention" queue (failed renders, pending approvals, expiring rights). | Add real-time Pending Approvals & Failed Jobs widget wired to `/api/v1/workflows` & `/api/v1/renders`. |
| `/dashboard` | **P2** | Cost/usage summary not visible at a glance on Command Center. | Add compact monthly token/render/storage budget progress bar from `/api/v1/usage/summary`. |
| `/studio` | **P1** | Single-concept one-shot brief -> render; no pre-render concept ranking or editable script approval step. | Add 3-concept Creative Director picker + editable Script & Cost Estimate gate before triggering render. |
| `/studio` | **P1** | Project Context rail lacks nested folder drag-and-drop & semantic search across uploaded raw clips. | Add folder dropzone (`webkitdirectory`) + semantic search bar querying `AssetScene`/`Transcript`. |
| `/editor` | **P1** | `editor/page.tsx` is 1,275 lines; lacks transcript-driven text-cut editing and clip split/trim handles. | Extract modular subcomponents (`timeline-panel.tsx`, `scene-inspector.tsx`, `transcript-editor.tsx`) and add word-level silence/retake removal. |
| `/repurpose` | **P1** | Long-form uploaded asset repurposing generates template specs rather than multi-clip highlight extraction like YouTube Clipper. | Unify uploaded long-form video highlight detection with the YouTube Viral Clipper scoring & split-screen engine. |
| `/projects` | **P2** | 114 buttons rendered when 20+ projects exist (no pagination or bulk archive/filter). | Add pagination/virtualization + bulk status actions and project-level rights/budget badge. |
| `/library` | **P1** | Multi-file upload works, but nested folder upload (`webkitdirectory`), resumable chunked upload, semantic search, and rights/licence tags are missing. | Add folder drag-and-drop preserving relative paths, semantic search bar, and Rights & Licence drawer tab. |
| `/brand-kit` | **P1** | Covers colors, fonts, tone; lacks structured Caption Style Presets, Motion Style Profile, Forbidden Visual Rules, and Brand Compliance check button. | Extend `BrandKit` JSON schema + UI tabs for Captions, Motion, Audio/Music preferences, and Forbidden Styles. |
| `/publish` | **P1** | `publish/page.tsx` is 1,256 lines; lacks Rights Compliance pre-flight gate blocking publish when media rights/consent are missing. | Extract modular composer + add Rights & Approval Pre-Flight checklist before Schedule/Publish. |
| `/calendar` | **P2** | No drag-and-drop rescheduling or campaign grouping view. | Add campaign filter + drag-to-reschedule wired to `PATCH /api/v1/publishing/posts/:id/reschedule`. |
| `/analytics` | **P2** | Clearly distinguishes empty/real data, but lacks per-hook editorial performance breakdown & data freshness timestamp badge. | Add explicit `Data Freshness` & `Provenance` badges (`Measured` vs `Sandbox`) and hook-level breakdown. |
| `/settings` | **P2** | Lacks per-workspace monthly cost cap enforcement UI and external client review link revocation table. | Add Budget Guardrails panel + Active External Review Links manager. |
| `/`, `/login`, `/register` | **P3** | Clean, fast, responsive (`0` overflow, `0` console errors). | Add guided post-signup onboarding checklist (Upload Folder -> Set Brand Kit -> Create First Short). |
