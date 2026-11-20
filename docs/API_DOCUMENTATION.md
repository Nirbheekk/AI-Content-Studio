# API Architecture, Endpoints & Shared TypeScript Types (`docs/API_DOCUMENTATION.md`)

## 1. API Design Standards

- **Base URL**: `/api/v1`
- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`) or HTTP-only signed session cookie (`aicos_session`).
- **Workspace Scoping**: All tenant routes require header `X-Workspace-Id: <uuid>` (or `:workspaceId` route param) verified against `WorkspaceMember`.
- **Standard Response Envelope**:

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    isSimulated?: boolean;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

---

## 2. REST API Endpoint Specification

### 2.1 Health & Observability
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/health` | Public | Liveness & dependency readiness check (`postgres`, `redis`, `minio`, queue depths) |
| `GET` | `/api/v1/admin/metrics` | `OWNER` / SystemAdmin | Queue depths, worker latency, token consumption, cost breakdown, error rates |

### 2.2 Authentication & Workspaces
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `POST` | `/api/v1/auth/register` | Public | Register user account & provision default Workspace + BrandKit |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user and issue JWT + refresh token |
| `GET` | `/api/v1/auth/me` | Authenticated | Return current user profile, memberships, and active workspace quotas |
| `GET` | `/api/v1/workspaces` | Authenticated | List workspaces the user belongs to |
| `POST` | `/api/v1/workspaces` | Authenticated | Create new workspace with isolated BrandKit and default quotas |
| `GET` | `/api/v1/workspaces/:id/brand-kit` | `VIEWER`+ | Retrieve workspace BrandKit configuration |
| `PUT` | `/api/v1/workspaces/:id/brand-kit` | `EDITOR`+ | Update brand colors, fonts, tone of voice, caption preset, logo |

### 2.3 Projects & Content Library (Assets)
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/v1/projects` | `VIEWER`+ | List projects with asset counts, active workflows, and recent videos |
| `POST` | `/api/v1/projects` | `EDITOR`+ | Create a new project |
| `GET` | `/api/v1/projects/:id` | `VIEWER`+ | Get project details, assets, conversations, compositions, workflows |
| `POST` | `/api/v1/assets/upload-url` | `EDITOR`+ | Initiate single/multipart/folder upload; returns pre-signed S3/MinIO PUT URL |
| `POST` | `/api/v1/assets/:id/complete` | `EDITOR`+ | Finalize upload, verify magic bytes & SHA-256 duplicate check, enqueue `media-worker` |
| `GET` | `/api/v1/assets` | `VIEWER`+ | Search/filter assets by project, folderPath, type, tag, transcript query |
| `GET` | `/api/v1/assets/:id` | `VIEWER`+ | Return asset metadata, pre-signed playback URL, transcript, and detected scenes |
| `DELETE` | `/api/v1/assets/:id` | `ADMIN`+ | Soft/hard delete asset and derivatives from S3/MinIO |

### 2.4 AI Studio Conversations & Autonomous Workflows
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/v1/projects/:projectId/conversations` | `VIEWER`+ | List conversations in a project |
| `POST` | `/api/v1/projects/:projectId/conversations` | `EDITOR`+ | Start or continue an AI Studio conversation |
| `POST` | `/api/v1/conversations/:id/messages` | `EDITOR`+ | Submit natural-language prompt (triggers new `Workflow` or partial composition edit) |
| `POST` | `/api/v1/workflows` | `EDITOR`+ | Explicitly launch an autonomous production or repurposing workflow |
| `GET` | `/api/v1/workflows/:id` | `VIEWER`+ | Get workflow state, stage history (`WorkflowStep[]`), `AgentRun[]`, token cost |
| `GET` | `/api/v1/workflows/:id/stream` | `VIEWER`+ | **SSE Stream**: Real-time stage transitions, agent logs, render %, QA inspection results |
| `POST` | `/api/v1/workflows/:id/approve` | `EDITOR`+ | **Human Approval Checkpoint**: Transitions `AWAITING_APPROVAL` -> `APPROVED` |
| `POST` | `/api/v1/workflows/:id/revise` | `EDITOR`+ | Submit conversational revision request (`AWAITING_APPROVAL` -> `REVISING`) |
| `POST` | `/api/v1/workflows/:id/retry` | `EDITOR`+ | Retry a `FAILED` workflow from its last persisted checkpoint stage |
| `POST` | `/api/v1/workflows/:id/cancel` | `EDITOR`+ | Cancel active BullMQ jobs and mark workflow `CANCELLED` |

### 2.5 Video Compositions, Interactive Editor & Rendering
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/v1/compositions/:id` | `VIEWER`+ | Get composition metadata, current `CompositionSpec` AST, and version history list |
| `POST` | `/api/v1/compositions/:id/patch` | `EDITOR`+ | Apply structured partial edit (`CompositionPatchOperation[]`), creating `Version(N+1)` |
| `POST` | `/api/v1/compositions/:id/undo` | `EDITOR`+ | Move `currentVersionId` to parent version |
| `POST` | `/api/v1/compositions/:id/redo` | `EDITOR`+ | Move `currentVersionId` forward to child version |
| `POST` | `/api/v1/compositions/:id/render` | `EDITOR`+ | Enqueue isolated `RenderJob` in `rendering-worker` for current version |
| `GET` | `/api/v1/renders/:id` | `VIEWER`+ | Get render job progress, signed MP4 download URL, and `QaInspection` report |

### 2.6 Content Repurposing, Postiz Publishing & Content Calendar
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `POST` | `/api/v1/repurpose` | `EDITOR`+ | Generate multi-platform campaign batch (Reels, TikTok, Shorts, LinkedIn, Quotes) from source asset |
| `GET` | `/api/v1/publishing/accounts` | `VIEWER`+ | List connected Postiz social accounts (redacting encrypted tokens) |
| `POST` | `/api/v1/publishing/accounts/connect` | `ADMIN`+ | Start/complete OAuth connection with Postiz provider and encrypt tokens |
| `POST` | `/api/v1/publishing/posts` | `EDITOR`+ | Create or schedule a social post (requires approved render or explicit approval) |
| `PATCH` | `/api/v1/publishing/posts/:id/reschedule` | `EDITOR`+ | Drag-and-drop calendar rescheduling |
| `POST` | `/api/v1/publishing/posts/:id/retry` | `EDITOR`+ | Retry a failed publish job with idempotency protection |
| `GET` | `/api/v1/calendar` | `VIEWER`+ | Query scheduled, draft, published, and failed posts by date range & platform |

---

## 3. Shared TypeScript & Zod Contracts (`packages/shared`)

```typescript
import { z } from 'zod';

export const WorkflowStageSchema = z.enum([
  'PENDING',
  'ANALYZING',
  'PLANNING',
  'SCRIPTING',
  'COMPOSING',
  'RENDERING',
  'REVIEWING',
  'REVISING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
]);

export const OverlayComponentTypeSchema = z.enum([
  'AnimatedHeadline',
  'KineticTypography',
  'WordSyncedCaptions',
  'TalkingHeadLayout',
  'PodcastSplitLayout',
  'SplitScreenComposition',
  'BrollTransition',
  'ImageAnimation',
  'ChartGraphic',
  'LowerThird',
  'ProgressBar',
  'BackgroundEffect',
  'SoundVisualization',
  'LogoAnimation',
  'OutroSequence',
  'CallToActionScene',
]);

export const SceneSpecSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int().nonnegative(),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  layout: z.enum(['talking-head', 'podcast-split', 'b-roll-overlay', 'full-bleed', 'data-explainer']),
  primaryAssetId: z.string().optional(),
  brollAssetId: z.string().optional(),
  trimStartSec: z.number().nonnegative().default(0),
  headlineText: z.string().optional(),
  narrationText: z.string().optional(),
  transitionIn: z.enum(['none', 'spring-slide', 'fade', 'zoom-punch', 'whip-pan']).default('fade'),
  overlays: z.array(
    z.object({
      id: z.string(),
      component: OverlayComponentTypeSchema,
      startOffsetFrames: z.number().int().nonnegative(),
      durationInFrames: z.number().int().positive(),
      props: z.record(z.unknown()),
    }),
  ),
});

export const CompositionSpecSchema = z.object({
  schemaVersion: z.literal('1.0'),
  templateId: z.enum([
    'instagram-reel',
    'tiktok-short',
    'youtube-short',
    'youtube-long',
    'product-demo',
    'educational-video',
    'podcast-clip',
    'promotional-video',
    'data-explainer',
  ]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.union([z.literal(30), z.literal(60)]),
  durationInFrames: z.number().int().positive(),
  brand: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    accentColor: z.string(),
    headingFont: z.string(),
    bodyFont: z.string(),
    logoAssetId: z.string().optional(),
  }),
  captions: z.object({
    enabled: z.boolean(),
    style: z.enum(['word-highlight', 'karaoke-pop', 'minimal-lower', 'kinetic-center']),
    fontSizePx: z.number().int().min(20).max(120),
    highlightColor: z.string(),
    safeBottomMarginPx: z.number().int().min(80).max(400),
  }),
  audio: z.object({
    musicAssetId: z.string().optional(),
    musicVolume: z.number().min(0).max(1).default(0.15),
    voiceoverAssetId: z.string().optional(),
    duckingEnabled: z.boolean().default(true),
  }),
  scenes: z.array(SceneSpecSchema).min(1),
});

export type CompositionSpec = z.infer<typeof CompositionSpecSchema>;
```
