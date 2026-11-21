'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { useStudio } from '../../context/studio-context';
import { apiRequest } from '../../lib/api-client';

interface WorkspaceMemberDto {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  joinedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface InvitationDto {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  status: string;
  expiresAt: string;
  inviteToken?: string;
}

export default function SettingsPage() {
  const { accessToken, activeWorkspace, refreshProfile, setFeedback } = useStudio();
  const [wsName, setWsName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366F1');
  const [accentColor, setAccentColor] = useState('#22D3EE');
  const [toneOfVoice, setToneOfVoice] = useState('');

  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [acceptTokenInput, setAcceptTokenInput] = useState('');

  const loadSettings = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const [wsDetail, memberData] = await Promise.all([
        apiRequest<{
          id: string;
          name: string;
          brandKit?: {
            brandName: string;
            primaryColor: string;
            accentColor: string;
            toneOfVoice: string;
          } | null;
        }>({
          path: `/api/v1/workspaces/${activeWorkspace.id}`,
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<{ members: WorkspaceMemberDto[]; invitations: InvitationDto[] }>({
          path: `/api/v1/workspaces/${activeWorkspace.id}/members`,
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);

      setWsName(wsDetail.name);
      setBrandName(wsDetail.brandKit?.brandName ?? wsDetail.name);
      setPrimaryColor(wsDetail.brandKit?.primaryColor ?? '#6366F1');
      setAccentColor(wsDetail.brandKit?.accentColor ?? '#22D3EE');
      setToneOfVoice(wsDetail.brandKit?.toneOfVoice ?? '');
      setMembers(memberData.members);
      setInvitations(memberData.invitations);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load workspace settings',
      });
    }
  }, [accessToken, activeWorkspace, setFeedback]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace) return;
    try {
      await apiRequest({
        method: 'PATCH',
        path: `/api/v1/workspaces/${activeWorkspace.id}`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          name: wsName.trim(),
          brandName: brandName.trim(),
          primaryColor,
          accentColor,
          toneOfVoice: toneOfVoice.trim(),
        },
      });
      await refreshProfile();
      await loadSettings();
      setFeedback({ type: 'success', message: 'Workspace & Brand Kit updated' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update workspace',
      });
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !inviteEmail.trim()) return;
    try {
      const created = await apiRequest<InvitationDto>({
        method: 'POST',
        path: `/api/v1/workspaces/${activeWorkspace.id}/invitations`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          email: inviteEmail.trim(),
          role: inviteRole,
        },
      });
      setInviteEmail('');
      setGeneratedToken(created.inviteToken ?? null);
      setFeedback({ type: 'success', message: `Invitation created for ${created.email}` });
      await loadSettings();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create invitation',
      });
    }
  };

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !acceptTokenInput.trim()) return;
    try {
      const res = await apiRequest<{ workspaceId: string; workspaceName: string; role: string }>({
        method: 'POST',
        path: '/api/v1/workspaces/invitations/accept',
        accessToken,
        body: { token: acceptTokenInput.trim() },
      });
      setAcceptTokenInput('');
      await refreshProfile();
      setFeedback({
        type: 'success',
        message: `Joined workspace "${res.workspaceName}" as ${res.role}`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to accept invitation',
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="border-b border-border pb-5">
          <h1 className="text-2xl font-bold text-foreground">Workspace Settings, Brand Kit &amp; RBAC</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure workspace identity, Brand Kit defaults, role-based access control, and team
            invitations.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={handleSaveWorkspace}
            className="space-y-4 rounded-xl border border-border bg-card/70 p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">Workspace &amp; Brand Kit</h2>
            <div>
              <label className="block text-xs text-foreground/90">Workspace Name</label>
              <input
                type="text"
                required
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground/90">Brand Name</label>
              <input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground/90">Primary Brand Color (Hex)</label>
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground/90">Accent Highlight Color (Hex)</label>
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-foreground/90">Brand Tone of Voice</label>
              <input
                type="text"
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Save Workspace &amp; Brand Kit
            </button>
          </form>

          <div className="space-y-6">
            <form
              onSubmit={handleCreateInvitation}
              className="space-y-4 rounded-xl border border-border bg-card/70 p-5"
            >
              <h2 className="text-sm font-semibold text-foreground">Invite Team Member (RBAC)</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground sm:col-span-2"
                />
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as 'ADMIN' | 'EDITOR' | 'VIEWER')
                  }
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="EDITOR">EDITOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Generate Secure Invitation Token
              </button>

              {generatedToken && (
                <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-xs text-success">
                  <div className="font-semibold">Invitation Token Generated:</div>
                  <div className="mt-1 break-all font-mono text-[11px]">{generatedToken}</div>
                </div>
              )}
            </form>

            <form
              onSubmit={handleAcceptInvitation}
              className="space-y-3 rounded-xl border border-border bg-card/70 p-5"
            >
              <h2 className="text-sm font-semibold text-foreground">Accept Workspace Invitation</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={acceptTokenInput}
                  onChange={(e) => setAcceptTokenInput(e.target.value)}
                  placeholder="Paste invitation token..."
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-input bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80"
                >
                  Accept Invite
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/70 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Workspace Members ({members.length}) &amp; Pending Invitations ({invitations.length})
          </h2>
          <div className="mt-4 space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">{m.user.fullName}</span>{' '}
                  <span className="text-muted-foreground">({m.user.email})</span>
                </div>
                <span className="rounded bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
