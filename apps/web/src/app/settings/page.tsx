'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Save, UserPlus, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  NativeSelect,
  PageHeader,
} from '@/components/design-system/primitives';
import { Avatar } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useStudio } from '@/context/studio-context';
import { apiRequest } from '@/lib/api-client';

interface WorkspaceMemberDto {
  id: string;
  role: string;
  user: { id: string; email: string; fullName: string };
}

interface InvitationDto {
  id: string;
  email: string;
  role: string;
  status: string;
  inviteToken?: string;
}

export default function SettingsPage() {
  const { accessToken, activeWorkspace, refreshProfile, setFeedback } = useStudio();
  const [wsName, setWsName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#18181b');
  const [accentColor, setAccentColor] = useState('#5e6ad2');
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
      setPrimaryColor(wsDetail.brandKit?.primaryColor ?? '#18181b');
      setAccentColor(wsDetail.brandKit?.accentColor ?? '#5e6ad2');
      setToneOfVoice(wsDetail.brandKit?.toneOfVoice ?? '');
      setMembers(memberData.members);
      setInvitations(memberData.invitations);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load settings',
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
      setFeedback({ type: 'success', message: 'Workspace settings saved' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save workspace',
      });
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace || !inviteEmail.trim()) return;
    try {
      const created = await apiRequest<InvitationDto>({
        method: 'POST',
        path: `/api/v1/workspaces/${activeWorkspace.id}/invitations`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail('');
      setGeneratedToken(created.inviteToken ?? null);
      setFeedback({ type: 'success', message: `Invitation created for ${created.email}` });
      await loadSettings();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invitation failed',
      });
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !acceptTokenInput.trim()) return;
    try {
      const res = await apiRequest<{ workspaceName: string; role: string }>({
        method: 'POST',
        path: '/api/v1/workspaces/invitations/accept',
        accessToken,
        body: { token: acceptTokenInput.trim() },
      });
      setAcceptTokenInput('');
      await refreshProfile();
      setFeedback({
        type: 'success',
        message: `Joined "${res.workspaceName}" as ${res.role}`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invalid invite token',
      });
    }
  };

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setFeedback({ type: 'success', message: 'Invitation token copied' });
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHeader
          title="Team & Settings"
          description="Manage workspace configuration, appearance, and RBAC team invitations."
          badge={activeWorkspace ? <Badge variant="outline">{activeWorkspace.role}</Badge> : undefined}
        />

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="team">Team & RBAC ({members.length})</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card className="max-w-xl">
              <CardHeader>
                <CardTitle>Workspace Profile</CardTitle>
                <CardDescription>Default identity applied across projects and exports.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveWorkspace} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="set-ws-name">Workspace Name</Label>
                    <Input
                      id="set-ws-name"
                      value={wsName}
                      onChange={(e) => setWsName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="set-brand">Default Brand Name</Label>
                    <Input
                      id="set-brand"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="set-tone">Tone of Voice</Label>
                    <Input
                      id="set-tone"
                      value={toneOfVoice}
                      onChange={(e) => setToneOfVoice(e.target.value)}
                    />
                  </div>
                  <Button type="submit">
                    <Save className="h-3.5 w-3.5" />
                    Save Workspace
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Members ({members.length})
                </CardTitle>
                <CardDescription>Active workspace collaborators and RBAC roles.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={m.user.fullName} />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{m.user.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.user.email}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">{m.role}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    Invite Member
                  </CardTitle>
                  <CardDescription>Generate a role-scoped invitation token.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <form onSubmit={handleInvite} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="inv-email">Email</Label>
                      <Input
                        id="inv-email"
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="editor@company.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="inv-role">Role</Label>
                      <NativeSelect
                        id="inv-role"
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value as 'ADMIN' | 'EDITOR' | 'VIEWER')
                        }
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                      </NativeSelect>
                    </div>
                    <Button type="submit" size="sm">
                      Create Invitation
                    </Button>
                  </form>

                  {generatedToken && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
                      <code className="truncate font-mono text-xs">{generatedToken}</code>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => void copyToken(generatedToken)}
                        aria-label="Copy invitation token"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {invitations.length > 0 && (
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Pending Invitations ({invitations.length})
                      </div>
                      {invitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">{inv.email}</span>
                          <Badge variant="outline">{inv.role}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Accept Invitation</CardTitle>
                  <CardDescription>Join another workspace with an invite token.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAcceptInvite} className="flex gap-2">
                    <Input
                      value={acceptTokenInput}
                      onChange={(e) => setAcceptTokenInput(e.target.value)}
                      placeholder="Paste invite token..."
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Join
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Theme Preference</CardTitle>
                <CardDescription>Persisted locally across sessions.</CardDescription>
              </CardHeader>
              <CardContent>
                <ThemeToggle />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
