import { z } from 'zod';
import { AgentTypeSchema, RenderStatusSchema, WorkflowStageSchema } from './workflow.js';

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

export const DependencyHealthSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  latencyMs: z.number().nonnegative(),
  message: z.string().optional(),
});
export type DependencyHealth = z.infer<typeof DependencyHealthSchema>;

export const HealthCheckResponseSchema = z.object({
  service: z.string(),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.string(),
  uptimeSec: z.number().nonnegative(),
  dependencies: z.object({
    postgres: DependencyHealthSchema,
    redis: DependencyHealthSchema,
    minio: DependencyHealthSchema,
  }),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const WorkflowSseEventSchema = z.object({
  eventId: z.string(),
  workflowId: z.string(),
  stage: WorkflowStageSchema,
  agent: AgentTypeSchema.nullable(),
  progressPercent: z.number().int().min(0).max(100),
  renderStatus: RenderStatusSchema.optional(),
  message: z.string(),
  isSimulated: z.boolean().default(false),
  timestamp: z.string(),
});
export type WorkflowSseEvent = z.infer<typeof WorkflowSseEventSchema>;

export const WorkerRoleSchema = z.enum([
  'general',
  'orchestrator',
  'media',
  'rendering',
  'publishing',
]);
export type WorkerRole = z.infer<typeof WorkerRoleSchema>;

export const QUEUE_NAMES = {
  general: 'general-queue',
  orchestrator: 'orchestrator-queue',
  media: 'media-queue',
  rendering: 'render-queue',
  publishing: 'publish-queue',
} as const;
