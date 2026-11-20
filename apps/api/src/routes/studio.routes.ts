import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  canTransitionWorkflowStage,
  CreateConversationRequestSchema,
  NotFoundError,
  SendMessageRequestSchema,
  UpdateWorkflowStageRequestSchema,
  ValidationError,
  WorkflowSseEvent,
  WorkflowStage,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { enqueueOrchestratorWorkflowJob, workflowEventBus } from '../lib/queues.js';
import { authorizeWorkspace } from '../middleware/auth.js';

export async function registerStudioRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/conversations', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as { projectId?: string };

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { messages: true, workflows: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.status(200).send({
      success: true,
      data: conversations,
    });
  });

  app.post('/api/v1/conversations', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = CreateConversationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid conversation creation payload', parsed.error.flatten());
    }

    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, workspaceId: ctx.workspaceId },
    });
    if (!project) {
      throw new NotFoundError('Project', parsed.data.projectId);
    }

    const conversation = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: project.id,
          title: parsed.data.title,
        },
      });

      await tx.message.create({
        data: {
          conversationId: conv.id,
          role: 'SYSTEM',
          agentName: 'CREATIVE_DIRECTOR',
          content: `AI Studio workspace initialized for project "${project.name}". Describe what you want to create.`,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'CONVERSATION_CREATED',
          entityType: 'Conversation',
          entityId: conv.id,
        },
      });

      return tx.conversation.findUnique({
        where: { id: conv.id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          workflows: { orderBy: { startedAt: 'desc' } },
        },
      });
    });

    return reply.status(201).send({
      success: true,
      data: conversation,
    });
  });

  app.get('/api/v1/conversations/:conversationId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { conversationId } = request.params as { conversationId: string };

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: ctx.workspaceId,
      },
      include: {
        project: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        workflows: {
          orderBy: { startedAt: 'desc' },
          include: {
            steps: { orderBy: { startedAt: 'asc' } },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId);
    }

    return reply.status(200).send({
      success: true,
      data: conversation,
    });
  });

  app.post('/api/v1/conversations/:conversationId/messages', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { conversationId } = request.params as { conversationId: string };
    const parsed = SendMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid message payload', parsed.error.flatten());
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId: ctx.workspaceId },
      include: {
        project: {
          include: {
            _count: { select: { assets: true } },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId);
    }

    const idempotencyKey = `wf-${conversation.id}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const result = await prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          content: parsed.data.content,
        },
      });

      const workflow = await tx.workflow.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: conversation.projectId,
          conversationId: conversation.id,
          initiatedByUserId: ctx.userId,
          idempotencyKey,
          userPrompt: parsed.data.content,
          stage: 'PLANNING',
          currentAgent: 'CREATIVE_DIRECTOR',
          status: 'RUNNING',
          planJson: {
            objective: parsed.data.content,
            projectAssetsAvailable: conversation.project._count.assets,
            targetStages: ['ANALYZING', 'PLANNING', 'SCRIPTING', 'COMPOSING'],
            generatedAt: new Date().toISOString(),
          },
        },
      });

      await tx.workflowStep.createMany({
        data: [
          {
            workflowId: workflow.id,
            stage: 'PENDING',
            status: 'COMPLETED',
            inputJson: { prompt: parsed.data.content },
            outputJson: { initialized: true },
            completedAt: new Date(),
          },
          {
            workflowId: workflow.id,
            stage: 'ANALYZING',
            agent: 'CONTENT_INTELLIGENCE',
            status: 'COMPLETED',
            inputJson: { projectId: conversation.projectId },
            outputJson: { assetCount: conversation.project._count.assets },
            completedAt: new Date(),
          },
          {
            workflowId: workflow.id,
            stage: 'PLANNING',
            agent: 'CREATIVE_DIRECTOR',
            status: 'STARTED',
            inputJson: { prompt: parsed.data.content },
          },
        ],
      });

      const assistantMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          agentName: 'CREATIVE_DIRECTOR',
          content: `Production workflow #${workflow.id.slice(0, 8)} created for "${conversation.project.name}". Analyzed ${conversation.project._count.assets} project asset(s) and entered PLANNING stage.`,
          metadataJson: {
            workflowId: workflow.id,
            stage: workflow.stage,
            agent: workflow.currentAgent,
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      return { userMessage, assistantMessage, workflow };
    });

    await enqueueOrchestratorWorkflowJob({
      workspaceId: ctx.workspaceId,
      projectId: conversation.projectId,
      workflowId: result.workflow.id,
      idempotencyKey,
    });

    const sseEvent: WorkflowSseEvent = {
      eventId: randomUUID(),
      workflowId: result.workflow.id,
      stage: 'PLANNING',
      agent: 'CREATIVE_DIRECTOR',
      progressPercent: 35,
      message: 'Creative Director Agent initialized production specification.',
      isSimulated: true,
      timestamp: new Date().toISOString(),
    };
    workflowEventBus.emitWorkflowEvent(sseEvent);

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  app.get('/api/v1/workflows', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as { projectId?: string };

    const workflows = await prisma.workflow.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        steps: { orderBy: { startedAt: 'asc' } },
      },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });

    return reply.status(200).send({
      success: true,
      data: workflows,
    });
  });

  app.get('/api/v1/workflows/:workflowId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { workflowId } = request.params as { workflowId: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
      include: {
        project: { select: { id: true, name: true } },
        steps: { orderBy: { startedAt: 'asc' } },
        agentRuns: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    return reply.status(200).send({
      success: true,
      data: workflow,
    });
  });

  app.patch('/api/v1/workflows/:workflowId/stage', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { workflowId } = request.params as { workflowId: string };
    const parsed = UpdateWorkflowStageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid workflow stage transition payload', parsed.error.flatten());
    }

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
    });
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const currentStage = workflow.stage as WorkflowStage;
    const nextStage = parsed.data.stage;

    if (!canTransitionWorkflowStage(currentStage, nextStage)) {
      throw new ValidationError(
        `Invalid workflow stage transition from ${currentStage} to ${nextStage}`,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const wf = await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          stage: nextStage,
          status:
            nextStage === 'FAILED'
              ? 'FAILED'
              : nextStage === 'CANCELLED'
                ? 'CANCELLED'
                : nextStage === 'AWAITING_APPROVAL'
                  ? 'PAUSED_APPROVAL'
                  : nextStage === 'PUBLISHED'
                    ? 'COMPLETED'
                    : 'RUNNING',
        },
      });

      await tx.workflowStep.create({
        data: {
          workflowId: wf.id,
          stage: nextStage,
          agent: wf.currentAgent,
          status: 'STARTED',
          outputJson: { message: parsed.data.statusMessage ?? `Transitioned to ${nextStage}` },
        },
      });

      return wf;
    });

    const event: WorkflowSseEvent = {
      eventId: randomUUID(),
      workflowId: updated.id,
      stage: nextStage,
      agent: updated.currentAgent,
      progressPercent: nextStage === 'AWAITING_APPROVAL' ? 90 : 50,
      message: parsed.data.statusMessage ?? `Workflow stage updated to ${nextStage}`,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    };
    workflowEventBus.emitWorkflowEvent(event);

    return reply.status(200).send({
      success: true,
      data: updated,
    });
  });

  app.get('/api/v1/workflows/:workflowId/stream', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { workflowId } = request.params as { workflowId: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
      },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const initialSnapshot: WorkflowSseEvent = {
      eventId: randomUUID(),
      workflowId: workflow.id,
      stage: workflow.stage as WorkflowStage,
      agent: workflow.currentAgent,
      progressPercent: workflow.stage === 'PLANNING' ? 35 : 20,
      message: `Connected to workflow stream (current stage: ${workflow.stage})`,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    };

    reply.raw.write(`event: workflow.update\ndata: ${JSON.stringify(initialSnapshot)}\n\n`);

    const query = (request.query ?? {}) as { once?: string };
    if (query.once === 'true') {
      reply.raw.end();
      return reply;
    }

    const unsubscribe = workflowEventBus.subscribe(workflow.id, (event) => {
      reply.raw.write(`event: workflow.update\ndata: ${JSON.stringify(event)}\n\n`);
    });

    request.raw.on('close', () => {
      unsubscribe();
    });

    return reply;
  });
}
