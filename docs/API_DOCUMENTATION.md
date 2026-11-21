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
| `POST` | `/api/v1/auth/register` | Public (Rate-Limited) | Register user account (`scrypt` hash), provision default Workspace + BrandKit + `UserSession` |
| `POST` | `/api/v1/auth/login` | Public (Rate-Limited) | Authenticate user and issue signed JWT access token + rotated opaque refresh token |
| `POST` | `/api/v1/auth/refresh` | Public (Rate-Limited) | Rotate refresh token and detect token replay across `familyId` |
| `POST` | `/api/v1/auth/logout` | Authenticated / Public | Revoke current `UserSession` and clear HTTP-only auth cookies |
| `GET` | `/api/v1/auth/me` | Authenticated | Return current user profile, memberships, roles, and active workspace quotas |
| `GET` | `/api/v1/workspaces` | Authenticated | List workspaces where the user is an authorized member |
| `POST` | `/api/v1/workspaces` | Authenticated | Create new workspace with isolated BrandKit and `OWNER` membership |
| `GET` | `/api/v1/workspaces/:workspaceId` | `VIEWER`+ | Retrieve workspace configuration, quotas, counts, and BrandKit |
| `PATCH` | `/api/v1/workspaces/:workspaceId` | `ADMIN`+ | Update workspace name, policy flags, and BrandKit colors/tone |
| `GET` | `/api/v1/workspaces/:workspaceId/members` | `VIEWER`+ | List workspace members and pending invitations |
| `POST` | `/api/v1/workspaces/:workspaceId/invitations` | `ADMIN`+ | Generate expiring (7-day) workspace invitation with SHA-256 hashed token |
| `POST` | `/api/v1/workspaces/invitations/accept` | Authenticated | Accept invitation token and create `WorkspaceMember` |
| `PATCH` | `/api/v1/workspaces/:workspaceId/members/:memberId` | `ADMIN`+ / `OWNER` | Update member RBAC role (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) |

### 2.3 Dashboard, Projects & Content Library (Assets)
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/v1/dashboard` | `VIEWER`+ | Live workspace dashboard telemetry (project/asset counts, storage used, recent projects, conversations, workflows, audit logs) |
| `GET` | `/api/v1/projects` | `VIEWER`+ | List workspace projects with `status` (`ACTIVE`/`ARCHIVED`) and `search` filters |
| `POST` | `/api/v1/projects` | `EDITOR`+ | Create a new project in the active workspace |
| `GET` | `/api/v1/projects/:projectId` | `VIEWER`+ | Get project details, assets, conversations, compositions, workflows |
| `PATCH` | `/api/v1/projects/:projectId` | `EDITOR`+ | Rename or update project description/status |
| `POST` | `/api/v1/projects/:projectId/archive` | `EDITOR`+ | Archive project (`status = ARCHIVED`, `archivedAt = now()`) |
| `POST` | `/api/v1/projects/:projectId/restore` | `EDITOR`+ | Restore archived project (`status = ACTIVE`) |
| `DELETE` | `/api/v1/projects/:projectId` | `ADMIN`+ | Safeguarded project deletion (requires archived status or `confirmDelete=true`) |
| `POST` | `/api/v1/assets/upload-url` | `EDITOR`+ | Sanitize filename/folderPath, create `Asset` (`UPLOADING`), return MinIO presigned PUT URL |
| `PUT` | `/api/v1/assets/:assetId/upload` | `EDITOR`+ | Upload binary payload to MinIO bucket `aicos-raw-assets` and compute SHA-256 checksum |
| `POST` | `/api/v1/assets/:assetId/complete` | `EDITOR`+ | Finalize upload, inspect first 64 bytes in MinIO for magic-byte MIME verification, detect duplicates, enqueue `media-worker` |
| `GET` | `/api/v1/assets` | `VIEWER`+ | Paginated search/filter assets by project, folderPath, assetType, status, search query |
| `GET` | `/api/v1/assets/:assetId` | `VIEWER`+ | Return asset metadata, pre-signed MinIO download URL, derivatives, transcript, scenes |
| `POST` | `/api/v1/assets/:assetId/analyze` | `EDITOR`+ | Generate thumbnail & waveform derivatives in MinIO, run STT word-timestamped transcription, and segment scenes with hook scores |
| `DELETE` | `/api/v1/assets/:assetId` | `EDITOR`+ | Delete object from MinIO storage and remove `Asset` record from PostgreSQL |

### 2.4 AI Studio Conversations & Autonomous Workflows
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/v1/ai/providers` | `VIEWER`+ | Return configured AI provider status (`hasLiveLlmCredentials`, `hasLiveSttCredentials`, `hasLiveTtsCredentials`), 9 platform templates, and 16 Remotion components |
| `GET` | `/api/v1/conversations` | `VIEWER`+ | List conversations in the workspace (filterable by `projectId`) |
| `POST` | `/api/v1/conversations` | `EDITOR`+ | Start a persistent AI Studio conversation for a project |
| `GET` | `/api/v1/conversations/:conversationId` | `VIEWER`+ | Get conversation messages and linked workflows |
| `POST` | `/api/v1/conversations/:conversationId/messages` | `EDITOR`+ | Persist user prompt, initialize persistent `Workflow` + `WorkflowStep` records, enqueue `orchestrator-queue`, emit SSE update |
| `POST` | `/api/v1/workflows/produce` | `EDITOR`+ | Execute the complete autonomous 7-agent production pipeline (`ANALYZING -> PLANNING -> SCRIPTING -> COMPOSING -> RENDERING -> REVIEWING -> [REVISING LOOP] -> AWAITING_APPROVAL`) |
| `GET` | `/api/v1/workflows` | `VIEWER`+ | List workspace workflows and stage history |
| `GET` | `/api/v1/workflows/:workflowId` | `VIEWER`+ | Get workflow state, stage history (`WorkflowStep[]`), `AgentRun[]`, token cost |
| `PATCH` | `/api/v1/workflows/:workflowId/stage` | `EDITOR`+ | Transition workflow stage (enforcing `WORKFLOW_STAGE_TRANSITIONS`) and broadcast SSE update |
| `POST` | `/api/v1/workflows/:workflowId/approve` | `EDITOR`+ | **Human Approval Gate**: Transition `AWAITING_APPROVAL -> APPROVED` and record `approvedByUserId` + `approvedAt` |
| `POST` | `/api/v1/workflows/:workflowId/revise` | `EDITOR`+ | Apply conversational or structured composition revisions, create immutable `CompositionVersion(N+1)`, re-render MP4, re-run Visual QA, and return to `AWAITING_APPROVAL` |
| `POST` | `/api/v1/workflows/:workflowId/cancel` | `EDITOR`+ | Cancel active workflow (`stage = CANCELLED`) |
| `POST` | `/api/v1/workflows/:workflowId/retry` | `EDITOR`+ | Retry workflow from project context and increment `retryCount` |
| `GET` | `/api/v1/workflows/:workflowId/stream` | `VIEWER`+ | **SSE Stream**: Real-time stage transitions, agent activity, and progress telemetry |
| `POST` | `/api/v1/workflows/:id/approve` | `EDITOR`+ | **Human Approval Checkpoint**: Transitions `AWAITING_APPROVAL` -> `APPROVED` |
| `POST` | `/api/v1/workflows/:id/revise` | `EDITOR`+ | Submit conversational revision request (`AWAITING_APPROVAL` -> `REVISING`) |
| `POST` | `/api/v1/workflows/:id/retry` | `EDITOR`+ | Retry a `FAILED` workflow from its last persisted checkpoint stage |
| `POST` | `/api/v1/workflows/:id/cancel` | `EDITOR`+ | Cancel active BullMQ jobs and mark workflow `CANCELLED` |

### 2.5 Video Compositions, Interactive Editor & Rendering
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/v1/brand-kit` | `VIEWER`+ | Get active workspace `BrandKit` visual language configuration |
| `PUT` | `/api/v1/brand-kit` | `EDITOR`+ | Update `BrandKit` colors, fonts, tone of voice, editing style, caption preset |
| `GET` | `/api/v1/compositions` | `VIEWER`+ | List workspace compositions with versions and latest render jobs |
| `GET` | `/api/v1/compositions/:compositionId` | `VIEWER`+ | Get composition metadata, compiled Remotion sequence plan, and version history list |
| `POST` | `/api/v1/compositions/:compositionId/patch` | `EDITOR`+ | Apply structured multi-track timeline edit (`UPDATE_SCENE`, `ADD_SCENE`, `REMOVE_SCENE`, `REORDER_SCENES`, `ADD_OVERLAY`, `REMOVE_OVERLAY`, `UPDATE_CAPTION_STYLE`, `UPDATE_BRAND`, `UPDATE_AUDIO`, `SET_DIMENSIONS`), creating `Version(N+1)` |
| `POST` | `/api/v1/compositions/:compositionId/scenes/:sceneId/ai-edit` | `EDITOR`+ | Granular AI-powered single-scene edit without regenerating unrelated scenes |
| `POST` | `/api/v1/compositions/:compositionId/aspect-ratio` | `EDITOR`+ | Adapt composition aspect ratio (`9:16`, `16:9`, `1:1`, `4:5`) and safe-zone margins |
| `POST` | `/api/v1/compositions/:compositionId/apply-brand-kit` | `EDITOR`+ | Apply workspace `BrandKit` identity to composition and save new version |
| `GET` | `/api/v1/compositions/:compositionId/subtitles` | `VIEWER`+ | Export `.srt` and `.vtt` subtitles and validate audio-caption timestamp synchronization |
| `GET` | `/api/v1/compositions/:compositionId/media-inspection` | `VIEWER`+ | Inspect binary MP4 (`ftyp`/`moov`/`mdat`), keyframe PNG stream, resolution, duration, and audio sync |
| `GET` | `/api/v1/compositions/:compositionId/compare` | `VIEWER`+ | Compare two composition versions (`?fromVersion=1&toVersion=N`) and return structured AST diff |
| `GET` | `/api/v1/compositions/:compositionId/comments` | `VIEWER`+ | List frame/scene-pinned collaboration comments and composition approval history |
| `POST` | `/api/v1/compositions/:compositionId/comments` | `VIEWER`+ | Add a collaboration comment pinned to a version, scene, and frame index |
| `PATCH` | `/api/v1/compositions/:compositionId/comments/:commentId/resolve` | `EDITOR`+ | Resolve or reopen a collaboration comment |
| `POST` | `/api/v1/compositions/:compositionId/approve` | `EDITOR`+ | Approve composition for publishing and record audit history |
| `POST` | `/api/v1/compositions/:compositionId/undo` | `EDITOR`+ | Move `currentVersionId` to parent version |
| `POST` | `/api/v1/compositions/:compositionId/redo` | `EDITOR`+ | Move `currentVersionId` forward to child version |
| `POST` | `/api/v1/compositions/:compositionId/render` | `EDITOR`+ | Render current composition version to MP4 + QA frames in MinIO |
| `GET` | `/api/v1/renders/:renderJobId` | `VIEWER`+ | Get render job progress, signed MP4 download URL, and `QaInspection` report |

### 2.6 Content Repurposing, Postiz Publishing & Content Calendar
| Method | Endpoint | Auth / Role | Description |
|--------|----------|-------------|-------------|
| `POST` | `/api/v1/repurpose` | `EDITOR`+ | Generate multi-platform campaign batch (Reels, TikTok, Shorts, LinkedIn, Quotes) from source asset |
| `GET` | `/api/v1/publishing/capabilities` | `VIEWER`+ | Return `PLATFORM_PUBLISHING_CAPABILITIES`, Postiz provider status, and supported IANA timezones |
| `POST` | `/api/v1/publishing/accounts/oauth-url` | `ADMIN`+ | Generate OAuth authorization URL, state token, and required scopes for a target platform |
| `POST` | `/api/v1/publishing/accounts/connect` | `ADMIN`+ | Complete OAuth code exchange, encrypt access & refresh tokens with AES-256-GCM, and store `SocialAccount` |
| `GET` | `/api/v1/publishing/accounts` | `VIEWER`+ | List connected workspace social accounts (redacting encrypted tokens, returning `tokenPreview: ****...`) |
| `POST` | `/api/v1/publishing/accounts/:accountId/refresh` | `ADMIN`+ | Rotate OAuth access and refresh tokens via Postiz adapter and re-encrypt with AES-256-GCM |
| `POST` | `/api/v1/publishing/accounts/:accountId/health-check` | `VIEWER`+ | Verify account token expiration, revocation status, and required platform OAuth scopes |
| `DELETE` | `/api/v1/publishing/accounts/:accountId` | `ADMIN`+ | Disconnect or revoke a connected social account and cancel pending scheduled posts |
| `GET` | `/api/v1/publishing/dashboard` | `VIEWER`+ | Return aggregated Publishing Center state (accounts, approved compositions, scheduled queue, in-flight queue, confirmed published posts, failed/dead-letter jobs) |
| `POST` | `/api/v1/publishing/posts` | `EDITOR`+ | Validate platform capabilities, enforce Human Approval Gate and SHA-256 idempotency, and schedule or immediately publish post |
| `GET` | `/api/v1/publishing/posts` | `VIEWER`+ | List workspace publish posts with optional `platform`, `socialAccountId`, and `status` filters |
| `PATCH` | `/api/v1/publishing/posts/:postId` | `EDITOR`+ | Edit unpublished post title, caption, and hashtags with platform capability re-validation |
| `PATCH` | `/api/v1/publishing/posts/:postId/reschedule` | `EDITOR`+ | Drag-and-drop / interactive calendar rescheduling with IANA timezone validation |
| `POST` | `/api/v1/publishing/posts/:postId/publish` | `EDITOR`+ | Immediately execute publication of an approved/scheduled post (idempotent) |
| `POST` | `/api/v1/publishing/posts/:postId/retry` | `EDITOR`+ | Retry and recover a `FAILED` or `DEAD_LETTER` publishing job |
| `POST` | `/api/v1/publishing/posts/:postId/cancel` | `EDITOR`+ | Cancel an unpublished `DRAFT`, `SCHEDULED`, or `FAILED` post |
| `GET` | `/api/v1/calendar` | `VIEWER`+ | Query timezone-aware calendar entries grouped by local date for `day`, `week`, and `month` views with platform, account, and status filters |

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
