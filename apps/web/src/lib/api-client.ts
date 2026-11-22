import type { ApiResponse, WorkspaceRole, WorkflowStage } from '@ai-content-os/shared';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  isSystemAdmin: boolean;
}

export interface BrandKitDto {
  id: string;
  workspaceId: string;
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  toneOfVoice: string;
  editingStyle: string;
}

export interface WorkspaceSummaryDto {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  role: WorkspaceRole;
  autoPublishApproved?: boolean;
  monthlyTokenQuota?: number;
  monthlyRenderMinutesQuota?: number;
  monthlyStorageBytesQuota?: number;
  brandKit?: BrandKitDto | null;
  counts?: {
    projects: number;
    assets: number;
    members: number;
    compositions?: number;
  };
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  createdById: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    assets: number;
    conversations: number;
    workflows: number;
    compositions: number;
  };
}

export interface AssetDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  folderPath: string;
  originalName: string;
  storageKey: string;
  bucketName: string;
  mimeType: string;
  assetType: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT';
  sizeBytes: number;
  checksumSha256: string;
  status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  tags: string[];
  aiSummary?: string | null;
  streamUrl?: string | null;
  downloadUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  aiMetadataJson?: Record<string, unknown> | null;
  isDuplicate?: boolean;
  createdAt: string;
  project?: { id: string; name: string } | null;
  transcript?: {
    id: string;
    language: string;
    fullText: string;
    provider: string;
  } | null;
  scenes?: Array<{
    id: string;
    sceneIndex: number;
    startSec: number;
    endSec: number;
    description?: string | null;
    hookScore?: number | null;
    isBroll: boolean;
  }>;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'AGENT_EVENT';
  agentName?: string | null;
  content: string;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowStepDto {
  id: string;
  workflowId: string;
  stage: WorkflowStage;
  agent?: string | null;
  status: string;
  startedAt: string;
  completedAt?: string | null;
}

export interface WorkflowDto {
  id: string;
  workspaceId: string;
  projectId: string;
  conversationId?: string | null;
  userPrompt: string;
  stage: WorkflowStage;
  currentAgent?: string | null;
  status: string;
  startedAt: string;
  updatedAt: string;
  project?: { id: string; name: string };
  steps?: WorkflowStepDto[];
}

export interface ConversationDto {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string };
  messages?: MessageDto[];
  workflows?: WorkflowDto[];
  _count?: { messages: number; workflows?: number };
}

export interface DashboardDataDto {
  workspace: WorkspaceSummaryDto;
  stats: {
    totalProjects: number;
    activeProjects: number;
    archivedProjects: number;
    totalAssets: number;
    totalStorageBytes: number;
    activeWorkflowCount: number;
  };
  recentProjects: ProjectDto[];
  recentConversations: ConversationDto[];
  processingJobs: WorkflowDto[];
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    user?: { id: string; fullName: string; email: string } | null;
  }>;
}

export function getApiBaseUrl(): string {
  return (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000').replace(/\/$/, '');
}

/**
 * Resolves a backend media stream/download URL against the configured API base URL
 * so `<video src>` and download links work identically on Nginx (:8080) and direct Next.js (:3000).
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/api/')) {
    return `${getApiBaseUrl()}${url}`;
  }
  return url;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  accessToken?: string | null;
  workspaceId?: string | null;
  body?: unknown;
  rawBody?: Uint8Array | ArrayBuffer;
  contentType?: string;
}

export async function apiRequest<T>(
  pathOrOptions: string | ApiRequestOptions,
  maybeOptions?: Omit<ApiRequestOptions, 'path'>,
): Promise<T> {
  const options: ApiRequestOptions =
    typeof pathOrOptions === 'string'
      ? { path: pathOrOptions, ...(maybeOptions ?? {}) }
      : pathOrOptions;

  const headers: Record<string, string> = {};
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }
  if (options.workspaceId) {
    headers['X-Workspace-Id'] = options.workspaceId;
  }

  let fetchBody: BodyInit | undefined;
  if (options.rawBody !== undefined) {
    headers['Content-Type'] = options.contentType ?? 'application/octet-stream';
    fetchBody = options.rawBody as unknown as BodyInit;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  }

  const response = await fetch(`${getApiBaseUrl()}${options.path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(fetchBody !== undefined ? { body: fetchBody } : {}),
    credentials: 'include',
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? `Request failed with HTTP ${response.status}`);
  }

  return payload.data as T;
}
