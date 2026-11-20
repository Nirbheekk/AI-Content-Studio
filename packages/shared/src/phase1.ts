import { z } from 'zod';
import {
  AssetStatusSchema,
  AssetTypeSchema,
  WorkflowStageSchema,
  WorkspaceRole,
  WorkspaceRoleSchema,
} from './workflow.js';

// -----------------------------------------------------------------------------
// RBAC Role Hierarchy & Permission Helpers
// -----------------------------------------------------------------------------

export const ROLE_WEIGHTS: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function hasRequiredRole(userRole: WorkspaceRole, minimumRole: WorkspaceRole): boolean {
  return ROLE_WEIGHTS[userRole] >= ROLE_WEIGHTS[minimumRole];
}

// -----------------------------------------------------------------------------
// Authentication & Session Schemas
// -----------------------------------------------------------------------------

export const RegisterRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  fullName: z.string().trim().min(2).max(120),
  workspaceName: z.string().trim().min(2).max(120).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(16).optional(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

// -----------------------------------------------------------------------------
// Workspace & Invitation Schemas
// -----------------------------------------------------------------------------

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .min(2)
    .max(80)
    .optional(),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

export const UpdateWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  autoPublishApproved: z.boolean().optional(),
  brandName: z.string().trim().min(2).max(120).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  toneOfVoice: z.string().trim().max(500).optional(),
});
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;

export const CreateInvitationRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  role: WorkspaceRoleSchema.default('EDITOR'),
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export const AcceptInvitationRequestSchema = z.object({
  token: z.string().trim().min(16).max(256),
});
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

export const UpdateMemberRoleRequestSchema = z.object({
  role: WorkspaceRoleSchema,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

// -----------------------------------------------------------------------------
// Project Management Schemas
// -----------------------------------------------------------------------------

export const ProjectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const CreateProjectRequestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: ProjectStatusSchema.optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

// -----------------------------------------------------------------------------
// Asset Upload, Sanitization & Magic-Byte Validation
// -----------------------------------------------------------------------------

export const ALLOWED_ASSET_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const;

export type AllowedAssetMimeType = (typeof ALLOWED_ASSET_MIME_TYPES)[number];

export const MAX_ASSET_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export const RequestUploadUrlSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_ASSET_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_SIZE_BYTES),
  projectId: z.string().uuid().optional(),
  folderPath: z.string().trim().max(255).default('/'),
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type RequestUploadUrlInput = z.infer<typeof RequestUploadUrlSchema>;

export const CompleteAssetUploadSchema = z.object({
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  durationSec: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
export type CompleteAssetUploadInput = z.infer<typeof CompleteAssetUploadSchema>;

export const ListAssetsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  assetType: AssetTypeSchema.optional(),
  status: AssetStatusSchema.optional(),
  folderPath: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListAssetsQuery = z.infer<typeof ListAssetsQuerySchema>;

/**
 * Sanitizes an untrusted client filename, stripping directory components,
 * null bytes, and dangerous characters to prevent path traversal.
 */
export function sanitizeAssetFilename(rawName: string): string {
  const base = rawName
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim();

  const cleaned = (base || 'asset')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .replace(/_+/g, '_')
    .slice(0, 140);

  return cleaned || 'asset';
}

/**
 * Normalizes a virtual folder path and rejects any `..` traversal segments.
 */
export function sanitizeFolderPath(rawFolder: string): string {
  const normalized = rawFolder.replace(/\0/g, '').replace(/\\/g, '/').trim();
  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  for (const segment of segments) {
    if (segment === '.' || segment === '..' || !/^[a-zA-Z0-9._ -]+$/.test(segment)) {
      throw new Error(`Invalid folder path segment: ${segment}`);
    }
  }

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function inferAssetTypeFromMime(mimeType: string): 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' {
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  return 'DOCUMENT';
}

/**
 * Inspects the first bytes of a file buffer to determine its actual MIME type
 * independent of the client-reported Content-Type or file extension.
 */
export function detectMimeTypeFromMagicBytes(bytes: Uint8Array): AllowedAssetMimeType | null {
  if (bytes.length < 4) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PDF: 25 50 44 46 (%PDF)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  // RIFF container (WEBP or WAV)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'image/webp';
    }
    if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return 'audio/wav';
    }
  }

  // MP4 / QuickTime MOV: bytes 4..7 == 'ftyp' (66 74 79 70)
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
    if (brand === 'qt  ') {
      return 'video/quicktime';
    }
    if (brand === 'M4A ') {
      return 'audio/mp4';
    }
    return 'video/mp4';
  }

  // WebM / Matroska EBML header: 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }

  // MP3: 'ID3' (49 44 33) or frame sync (FF FB / FF F3 / FF F2)
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2))
  ) {
    return 'audio/mpeg';
  }

  // Plain UTF-8 printable text check
  let isPrintableText = true;
  const checkLen = Math.min(bytes.length, 64);
  for (let i = 0; i < checkLen; i++) {
    const b = bytes[i]!;
    if (b === 0x00 || (b < 0x09 && b !== 0x0a && b !== 0x0d)) {
      isPrintableText = false;
      break;
    }
  }
  if (isPrintableText) {
    return 'text/plain';
  }

  return null;
}

// -----------------------------------------------------------------------------
// AI Studio Conversation & Workflow Schemas
// -----------------------------------------------------------------------------

export const CreateConversationRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export const SendMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  triggerWorkflow: z.boolean().default(true),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const UpdateWorkflowStageRequestSchema = z.object({
  stage: WorkflowStageSchema,
  statusMessage: z.string().trim().max(500).optional(),
});
export type UpdateWorkflowStageRequest = z.infer<typeof UpdateWorkflowStageRequestSchema>;
