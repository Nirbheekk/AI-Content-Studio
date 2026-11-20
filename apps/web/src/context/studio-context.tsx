'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  UserDto,
  WorkspaceSummaryDto,
} from '../lib/api-client';

interface StudioContextValue {
  user: UserDto | null;
  workspaces: WorkspaceSummaryDto[];
  activeWorkspace: WorkspaceSummaryDto | null;
  accessToken: string | null;
  isLoading: boolean;
  feedback: { type: 'success' | 'error'; message: string } | null;
  setFeedback: (fb: { type: 'success' | 'error'; message: string } | null) => void;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerAccount: (params: {
    email: string;
    password: string;
    fullName: string;
    workspaceName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string, slug?: string) => Promise<WorkspaceSummaryDto>;
  refreshProfile: () => Promise<void>;
}

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

const STORAGE_TOKEN_KEY = 'aicos_access_token';
const STORAGE_REFRESH_KEY = 'aicos_refresh_token';
const STORAGE_WORKSPACE_KEY = 'aicos_active_workspace_id';

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummaryDto[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const hydrateFromToken = useCallback(async (token: string, preferredWorkspaceId?: string | null) => {
    const profile = await apiRequest<{ user: UserDto; workspaces: WorkspaceSummaryDto[] }>({
      path: '/api/v1/auth/me',
      accessToken: token,
    });
    setUser(profile.user);
    setWorkspaces(profile.workspaces);
    const chosenId =
      (preferredWorkspaceId &&
      profile.workspaces.some((w) => w.id === preferredWorkspaceId)
        ? preferredWorkspaceId
        : profile.workspaces[0]?.id) ?? null;
    setActiveWorkspaceId(chosenId);
    if (chosenId && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_WORKSPACE_KEY, chosenId);
    }
  }, []);

  useEffect(() => {
    const savedToken =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_TOKEN_KEY) : null;
    const savedWs =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_WORKSPACE_KEY) : null;

    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    setAccessToken(savedToken);
    hydrateFromToken(savedToken, savedWs)
      .catch(async () => {
        const savedRefresh = window.localStorage.getItem(STORAGE_REFRESH_KEY);
        if (savedRefresh) {
          try {
            const refreshed = await apiRequest<{ accessToken: string; refreshToken: string }>({
              method: 'POST',
              path: '/api/v1/auth/refresh',
              body: { refreshToken: savedRefresh },
            });
            window.localStorage.setItem(STORAGE_TOKEN_KEY, refreshed.accessToken);
            window.localStorage.setItem(STORAGE_REFRESH_KEY, refreshed.refreshToken);
            setAccessToken(refreshed.accessToken);
            await hydrateFromToken(refreshed.accessToken, savedWs);
            return;
          } catch {
            // Clear expired credentials
          }
        }
        window.localStorage.removeItem(STORAGE_TOKEN_KEY);
        window.localStorage.removeItem(STORAGE_REFRESH_KEY);
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [hydrateFromToken]);

  const loginWithCredentials = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<{
      user: UserDto;
      workspaces: WorkspaceSummaryDto[];
      activeWorkspaceId: string | null;
      accessToken: string;
      refreshToken: string;
    }>({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email, password },
    });

    setAccessToken(result.accessToken);
    setUser(result.user);
    setWorkspaces(result.workspaces);
    const wsId = result.activeWorkspaceId ?? result.workspaces[0]?.id ?? null;
    setActiveWorkspaceId(wsId);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_TOKEN_KEY, result.accessToken);
      window.localStorage.setItem(STORAGE_REFRESH_KEY, result.refreshToken);
      if (wsId) {
        window.localStorage.setItem(STORAGE_WORKSPACE_KEY, wsId);
      }
    }
    setFeedback({ type: 'success', message: `Signed in as ${result.user.fullName}` });
  }, []);

  const registerAccount = useCallback(
    async (params: {
      email: string;
      password: string;
      fullName: string;
      workspaceName?: string;
    }) => {
      const result = await apiRequest<{
        user: UserDto;
        workspaces: WorkspaceSummaryDto[];
        activeWorkspaceId: string;
        accessToken: string;
        refreshToken: string;
      }>({
        method: 'POST',
        path: '/api/v1/auth/register',
        body: params,
      });

      setAccessToken(result.accessToken);
      setUser(result.user);
      setWorkspaces(result.workspaces);
      setActiveWorkspaceId(result.activeWorkspaceId);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_TOKEN_KEY, result.accessToken);
        window.localStorage.setItem(STORAGE_REFRESH_KEY, result.refreshToken);
        window.localStorage.setItem(STORAGE_WORKSPACE_KEY, result.activeWorkspaceId);
      }
      setFeedback({ type: 'success', message: 'Workspace and account created' });
    },
    [],
  );

  const logout = useCallback(async () => {
    const savedRefresh =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_REFRESH_KEY) : null;
    try {
      await apiRequest({
        method: 'POST',
        path: '/api/v1/auth/logout',
        accessToken,
        body: savedRefresh ? { refreshToken: savedRefresh } : {},
      });
    } catch {
      // Proceed with local cleanup
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_TOKEN_KEY);
      window.localStorage.removeItem(STORAGE_REFRESH_KEY);
      window.localStorage.removeItem(STORAGE_WORKSPACE_KEY);
    }
    setAccessToken(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setFeedback({ type: 'success', message: 'Signed out' });
  }, [accessToken]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_WORKSPACE_KEY, workspaceId);
    }
    setFeedback({ type: 'success', message: 'Switched active workspace' });
  }, []);

  const createWorkspace = useCallback(
    async (name: string, slug?: string) => {
      if (!accessToken) {
        throw new Error('Authentication required');
      }
      const created = await apiRequest<WorkspaceSummaryDto>({
        method: 'POST',
        path: '/api/v1/workspaces',
        accessToken,
        body: { name, ...(slug ? { slug } : {}) },
      });
      await hydrateFromToken(accessToken, created.id);
      setFeedback({ type: 'success', message: `Workspace "${created.name}" created` });
      return created;
    },
    [accessToken, hydrateFromToken],
  );

  const refreshProfile = useCallback(async () => {
    if (accessToken) {
      await hydrateFromToken(accessToken, activeWorkspaceId);
    }
  }, [accessToken, activeWorkspaceId, hydrateFromToken]);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  return (
    <StudioContext.Provider
      value={{
        user,
        workspaces,
        activeWorkspace,
        accessToken,
        isLoading,
        feedback,
        setFeedback,
        loginWithCredentials,
        registerAccount,
        logout,
        switchWorkspace,
        createWorkspace,
        refreshProfile,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used inside StudioProvider');
  }
  return ctx;
}
