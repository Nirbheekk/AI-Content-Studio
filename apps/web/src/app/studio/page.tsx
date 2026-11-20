'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { useStudio } from '../../context/studio-context';
import {
  apiRequest,
  ConversationDto,
  getApiBaseUrl,
  MessageDto,
  ProjectDto,
  WorkflowDto,
} from '../../lib/api-client';

export default function AIStudioPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDto | null>(null);
  const [promptInput, setPromptInput] = useState<string>('');
  const [newConvTitle, setNewConvTitle] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [sseEvents, setSseEvents] = useState<
    Array<{ eventId: string; stage: string; message: string; timestamp: string }>
  >([]);

  const loadStudioState = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const [projList, convList] = await Promise.all([
        apiRequest<ProjectDto[]>({
          path: '/api/v1/projects',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<ConversationDto[]>({
          path: '/api/v1/conversations',
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);
      setProjects(projList);
      setConversations(convList);

      const defaultProjId = selectedProjectId || projList[0]?.id || '';
      if (defaultProjId && !selectedProjectId) {
        setSelectedProjectId(defaultProjId);
      }

      if (convList[0] && !activeConversation) {
        const detail = await apiRequest<ConversationDto>({
          path: `/api/v1/conversations/${convList[0].id}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setActiveConversation(detail);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load AI Studio workspace',
      });
    }
  }, [accessToken, activeWorkspace, selectedProjectId, activeConversation, setFeedback]);

  useEffect(() => {
    void loadStudioState();
  }, [loadStudioState]);

  const activeWorkflow: WorkflowDto | null =
    activeConversation?.workflows?.[0] ?? null;

  // Subscribe to SSE workflow stream for the active workflow
  useEffect(() => {
    if (!activeWorkflow || !accessToken || !activeWorkspace) return;

    const streamUrl = `${getApiBaseUrl()}/api/v1/workflows/${activeWorkflow.id}/stream?accessToken=${encodeURIComponent(accessToken)}&workspaceId=${encodeURIComponent(activeWorkspace.id)}`;
    const source = new EventSource(streamUrl);

    source.addEventListener('workflow.update', (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent<string>).data) as {
          eventId: string;
          stage: string;
          message: string;
          timestamp: string;
        };
        setSseEvents((prev) => [parsed, ...prev.slice(0, 14)]);
      } catch {
        // Ignore malformed frame
      }
    });

    return () => {
      source.close();
    };
  }, [activeWorkflow, accessToken, activeWorkspace]);

  const handleSelectConversation = async (convId: string) => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const detail = await apiRequest<ConversationDto>({
        path: `/api/v1/conversations/${convId}`,
        accessToken,
        workspaceId: activeWorkspace.id,
      });
      setActiveConversation(detail);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load conversation',
      });
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !selectedProjectId || !newConvTitle.trim()) return;
    try {
      const created = await apiRequest<ConversationDto>({
        method: 'POST',
        path: '/api/v1/conversations',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          projectId: selectedProjectId,
          title: newConvTitle.trim(),
        },
      });
      setNewConvTitle('');
      setActiveConversation(created);
      setConversations((prev) => [created, ...prev]);
      setFeedback({ type: 'success', message: 'New AI Studio conversation started' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start conversation',
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !activeConversation || !promptInput.trim()) return;
    setSending(true);
    try {
      await apiRequest<{
        userMessage: MessageDto;
        assistantMessage: MessageDto;
        workflow: WorkflowDto;
      }>({
        method: 'POST',
        path: `/api/v1/conversations/${activeConversation.id}/messages`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          content: promptInput.trim(),
          triggerWorkflow: true,
        },
      });
      setPromptInput('');
      await handleSelectConversation(activeConversation.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send prompt',
      });
    } finally {
      setSending(false);
    }
  };

  const handleAdvanceStage = async (nextStage: 'SCRIPTING' | 'COMPOSING') => {
    if (!accessToken || !activeWorkspace || !activeWorkflow || !activeConversation) return;
    try {
      await apiRequest({
        method: 'PATCH',
        path: `/api/v1/workflows/${activeWorkflow.id}/stage`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          stage: nextStage,
          statusMessage: `Advanced workflow stage to ${nextStage}`,
        },
      });
      await handleSelectConversation(activeConversation.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invalid workflow stage transition',
      });
    }
  };

  return (
    <AppShell>
      <div className="grid h-[calc(100vh-5rem)] gap-4 lg:grid-cols-12">
        {/* Left Rail: Project & Conversation History */}
        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            AI Studio Conversations
          </h2>

          <form onSubmit={handleCreateConversation} className="mt-3 space-y-2 border-b border-zinc-800 pb-3">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Select Project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="text"
                required
                value={newConvTitle}
                onChange={(e) => setNewConvTitle(e.target.value)}
                placeholder="New session title..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                New
              </button>
            </div>
          </form>

          <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-zinc-500">No conversations yet. Create one above.</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => void handleSelectConversation(conv.id)}
                  className={`w-full rounded-lg border p-2.5 text-left transition ${
                    activeConversation?.id === conv.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="truncate text-xs font-medium">{conv.title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                    {conv.project?.name ?? 'Project'}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center Workspace: Conversational Prompt & Persistent Messages */}
        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-5">
          <div className="border-b border-zinc-800 pb-3">
            <h1 className="text-base font-bold text-white">
              {activeConversation?.title ?? 'Select or start an AI Studio session'}
            </h1>
            <p className="text-[11px] text-zinc-400">
              Persistent project conversation &amp; multi-agent production specification
            </p>
          </div>

          <div className="my-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {!activeConversation ? (
              <p className="text-xs text-zinc-500">
                Choose a conversation on the left or create a new session.
              </p>
            ) : !activeConversation.messages?.length ? (
              <p className="text-xs text-zinc-500">No messages in this conversation yet.</p>
            ) : (
              activeConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl p-3 text-xs ${
                    msg.role === 'USER'
                      ? 'ml-6 bg-indigo-600 text-white'
                      : 'mr-6 border border-zinc-800 bg-zinc-950 text-zinc-200'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] opacity-75">
                    <span className="font-semibold">{msg.agentName ?? msg.role}</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="leading-relaxed">{msg.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendMessage} className="border-t border-zinc-800 pt-3">
            <div className="flex gap-2">
              <input
                type="text"
                required
                disabled={!activeConversation || sending}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe what to create (e.g. 'Create 5 Instagram Reels with dynamic captions')..."
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!activeConversation || sending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Prompt'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: Real-Time SSE Workflow Progress & Stage Controls */}
        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Live Workflow State &amp; SSE Stream
          </h2>

          {!activeWorkflow ? (
            <p className="mt-4 text-xs text-zinc-500">
              Send a prompt in the conversation to launch a persistent production workflow.
            </p>
          ) : (
            <div className="mt-3 flex-1 space-y-4 overflow-y-auto">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300">
                    Stage: {activeWorkflow.stage}
                  </span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {activeWorkflow.status}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  Active Agent: {activeWorkflow.currentAgent ?? 'CREATIVE_DIRECTOR'}
                </div>
                <p className="mt-2 text-xs text-zinc-300">{activeWorkflow.userPrompt}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {activeWorkflow.stage === 'PLANNING' && (
                    <button
                      type="button"
                      onClick={() => void handleAdvanceStage('SCRIPTING')}
                      className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
                    >
                      Advance to SCRIPTING
                    </button>
                  )}
                  {activeWorkflow.stage === 'SCRIPTING' && (
                    <button
                      type="button"
                      onClick={() => void handleAdvanceStage('COMPOSING')}
                      className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
                    >
                      Advance to COMPOSING
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-zinc-300">Persisted Workflow Steps</h3>
                <div className="mt-2 space-y-1.5">
                  {activeWorkflow.steps?.map((step) => (
                    <div
                      key={step.id}
                      className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="font-mono text-zinc-200">{step.stage}</span>
                      <span className="text-zinc-400">{step.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-zinc-300">
                  Real-Time SSE Telemetry Feed
                </h3>
                <div className="mt-2 space-y-1.5">
                  {sseEvents.length === 0 ? (
                    <div className="text-[11px] text-zinc-500">
                      Listening on /api/v1/workflows/{activeWorkflow.id.slice(0, 8)}/stream...
                    </div>
                  ) : (
                    sseEvents.map((ev) => (
                      <div
                        key={ev.eventId}
                        className="rounded border border-indigo-500/30 bg-indigo-500/10 p-2 text-[11px]"
                      >
                        <div className="font-semibold text-indigo-300">{ev.stage}</div>
                        <div className="text-zinc-200">{ev.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
