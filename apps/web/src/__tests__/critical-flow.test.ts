import { describe, expect, it } from 'vitest';
import {
  apiRequest,
  ConversationDto,
  DashboardDataDto,
  ProjectDto,
  UserDto,
  WorkspaceSummaryDto,
} from '../lib/api-client.js';

describe('@ai-content-os/web critical user flow (Auth -> Workspace -> Dashboard -> Project -> AI Studio)', () => {
  it('validatesapiRequest error handling when unauthenticated', async () => {
    await expect(
      apiRequest({
        path: '/api/v1/auth/me',
        accessToken: 'invalid-token',
      }),
    ).rejects.toThrow();
  });

  it('executes end-to-end frontend client flow against running API if reachable', async () => {
    // Check if local API container is reachable
    const healthRes = await fetch('http://localhost:4000/api/health').catch(() => null);
    if (!healthRes || !healthRes.ok) {
      return;
    }

    const loginData = await apiRequest<{
      user: UserDto;
      workspaces: WorkspaceSummaryDto[];
      activeWorkspaceId: string;
      accessToken: string;
    }>({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {
        email: 'founder@aicontent.studio',
        password: 'DemoStudioPass!2026',
      },
    });

    expect(loginData.user.email).toBe('founder@aicontent.studio');
    expect(loginData.workspaces.length).toBeGreaterThanOrEqual(1);
    const token = loginData.accessToken;
    const workspaceId = loginData.activeWorkspaceId;

    const dash = await apiRequest<DashboardDataDto>({
      path: '/api/v1/dashboard',
      accessToken: token,
      workspaceId,
    });
    expect(dash.workspace.id).toBe(workspaceId);
    expect(dash.stats.totalProjects).toBeGreaterThanOrEqual(1);

    const project = await apiRequest<ProjectDto>({
      method: 'POST',
      path: '/api/v1/projects',
      accessToken: token,
      workspaceId,
      body: {
        name: `Web Client Flow Project ${Date.now()}`,
        description: 'Created from frontend critical-flow test',
      },
    });
    expect(project.id).toBeTruthy();

    const conversation = await apiRequest<ConversationDto>({
      method: 'POST',
      path: '/api/v1/conversations',
      accessToken: token,
      workspaceId,
      body: {
        projectId: project.id,
        title: 'Frontend Critical Flow Session',
      },
    });
    expect(conversation.id).toBeTruthy();
  });
});
