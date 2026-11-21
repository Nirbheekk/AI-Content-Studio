'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Palette,
  Shield,
  SunMoon,
  UserPlus,
  Users,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
} from '../../components/design-system/primitives';
import { ThemeToggle } from '../../components/theme/theme-toggle';
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
  const [primaryColor, setPrimaryColor] = useState('#6956E8');
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
      setPrimaryColor(wsDetail.brandKit?.primaryColor ?? '#6956E8');
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

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setFeedback({ type: 'success', message: 'Copied invitation token to clipboard' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to copy token' });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Team &amp; Workspace Settings"
          description="Manage workspace identity, interface theme preference, role-based access control (RBAC), and team invitations."
          badge={<Badge variant="ai">Role: {activeWorkspace?.role ?? 'MEMBER'}</Badge>}
        />

        {/* Appearance & Theme Preference Card */}
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ai-surface text-primary">
              <SunMoon className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Appearance &amp; Theme Preference
              </h2>
              <p className="text-xs text-muted-foreground">
                Switch between Light, Dark, and System themes. Persisted locally with zero flash on
                reload.
              </p>
            </div>
          </div>
          <ThemeToggle />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Workspace & Brand Kit Defaults */}
          <Card className="p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Palette className="h-4 w-4 text-primary" />
                <span>Workspace &amp; Brand Defaults</span>
              </div>
              <Link
                href="/brand-kit"
                className="text-xs font-medium text-primary hover:underline"
              >
                Open Full Brand Kit Studio →
              </Link>
            </div>

            <form onSubmit={handleSaveWorkspace} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Workspace Name
                </label>
                <Input
                  type="text"
                  required
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Brand Name</label>
                <Input
                  type="text"
                  required
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Primary Brand Color (Hex)
                  </label>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-8 w-8 shrink-0 rounded-lg border border-border"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <Input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Accent Highlight Color (Hex)
                  </label>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-8 w-8 shrink-0 rounded-lg border border-border"
                      style={{ backgroundColor: accentColor }}
                    />
                    <Input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Brand Tone of Voice
                </label>
                <Input
                  type="text"
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                />
              </div>

              <Button type="submit" size="sm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Save Workspace &amp; Brand Kit
              </Button>
            </form>
          </Card>

          {/* Right: RBAC Invitations */}
          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-foreground">
                <UserPlus className="h-4 w-4 text-primary" />
                <span>Invite Team Member (RBAC)</span>
              </div>
              <form onSubmit={handleCreateInvitation} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                    />
                  </div>
                  <Select
                    aria-label="Invite role"
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as 'ADMIN' | 'EDITOR' | 'VIEWER')
                    }
                  >
                    <option value="EDITOR">EDITOR</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="VIEWER">VIEWER</option>
                  </Select>
                </div>

                <Button type="submit" size="sm">
                  <KeyRound className="h-3.5 w-3.5" />
                  Generate Secure Invitation Token
                </Button>

                {generatedToken && (
                  <div className="rounded-xl border border-success/40 bg-success-surface p-3 text-xs text-success">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Invitation Token Generated:</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopyToken(generatedToken)}
                      >
                        <Copy className="h-3 w-3" />
                        Copy Token
                      </Button>
                    </div>
                    <div className="mt-1.5 break-all font-mono text-[11px] text-foreground">
                      {generatedToken}
                    </div>
                  </div>
                )}
              </form>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-foreground">
                <Shield className="h-4 w-4 text-primary" />
                <span>Accept Workspace Invitation</span>
              </div>
              <form onSubmit={handleAcceptInvitation} className="mt-4 flex gap-2">
                <Input
                  type="text"
                  required
                  value={acceptTokenInput}
                  onChange={(e) => setAcceptTokenInput(e.target.value)}
                  placeholder="Paste invitation token..."
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Accept Invite
                </Button>
              </form>
            </Card>
          </div>
        </div>

        {/* Members & Pending Invitations */}
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary" />
              <span>
                Workspace Members ({members.length}) &amp; Pending Invitations ({invitations.length})
              </span>
            </div>
            <Badge variant="outline">Tenant Isolated</Badge>
          </div>

          <div className="mt-4 space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/35 px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">{m.user.fullName}</span>{' '}
                  <span className="text-muted-foreground">({m.user.email})</span>
                </div>
                <Badge variant="ai">{m.role}</Badge>
              </div>
            ))}

            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="font-medium text-foreground">{inv.email}</span>{' '}
                  <span className="text-muted-foreground">(Invited • {inv.status})</span>
                </div>
                <Badge variant="warning">{inv.role}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
