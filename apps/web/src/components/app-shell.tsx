'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  Command,
  Film,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Plus,
  Repeat,
  Send,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useStudio } from '../context/studio-context';
import { cn } from '../lib/cn';
import { ThemeToggle } from './theme/theme-toggle';
import { CommandPalette } from './design-system/command-palette';
import { Badge, Button, Input } from './design-system/primitives';

interface NavEntry {
  href: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: Array<{ title: string; items: NavEntry[] }> = [
  {
    title: 'WORKSPACE',
    items: [
      { href: '/dashboard', label: 'Overview', group: 'WORKSPACE', icon: LayoutDashboard },
      { href: '/projects', label: 'Projects', group: 'WORKSPACE', icon: FolderKanban },
      { href: '/library', label: 'Media Library', group: 'WORKSPACE', icon: ImageIcon },
    ],
  },
  {
    title: 'CREATE',
    items: [
      { href: '/studio', label: 'AI Studio', group: 'CREATE', icon: Sparkles },
      { href: '/editor', label: 'Video Editor', group: 'CREATE', icon: Film },
      { href: '/repurpose', label: 'Repurpose', group: 'CREATE', icon: Repeat },
    ],
  },
  {
    title: 'PUBLISH',
    items: [
      { href: '/publish', label: 'Publishing', group: 'PUBLISH', icon: Send },
      { href: '/calendar', label: 'Calendar', group: 'PUBLISH', icon: Calendar },
    ],
  },
  {
    title: 'INSIGHTS',
    items: [{ href: '/analytics', label: 'Analytics', group: 'INSIGHTS', icon: BarChart3 }],
  },
  {
    title: 'MANAGE',
    items: [
      { href: '/brand-kit', label: 'Brand Kit', group: 'MANAGE', icon: Palette },
      { href: '/settings', label: 'Team & Settings', group: 'MANAGE', icon: Settings },
    ],
  },
];

const FLAT_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function AuthScreen({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' }) {
  const { loginWithCredentials, registerAccount, feedback, setFeedback } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      if (mode === 'login') {
        await loginWithCredentials(email, password);
      } else {
        await registerAccount({
          email,
          password,
          fullName,
          ...(workspaceName.trim() ? { workspaceName: workspaceName.trim() } : {}),
        });
      }
      if (pathname === '/register' || pathname === '/login') {
        router.replace('/dashboard');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Authentication failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      await loginWithCredentials('founder@aicontent.studio', 'DemoStudioPass!2026');
      if (pathname === '/register' || pathname === '/login') {
        router.replace('/dashboard');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Demo login failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <Badge variant="ai">
            <Sparkles className="h-3 w-3" />
            AI Content Operating System
          </Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {mode === 'login' ? 'Sign in to your Studio' : 'Create your Studio Workspace'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe it. Create it. Refine it. Publish it.
          </p>
        </div>

        {feedback && (
          <div
            role="alert"
            className={cn(
              'mb-4 rounded-lg border px-4 py-3 text-xs font-medium',
              feedback.type === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-success/30 bg-success-surface text-success',
            )}
          >
            {feedback.message}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-secondary p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={cn(
              'rounded-md py-2 text-xs font-medium transition-colors',
              mode === 'login'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={cn(
              'rounded-md py-2 text-xs font-medium transition-colors',
              mode === 'register'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Register &amp; Onboard
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Full Name</label>
                <Input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Workspace Name (Optional)
                </label>
                <Input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Rivera Media Studio"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Email Address</label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Password</label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            {submitting
              ? 'Authenticating...'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Workspace & Continue'}
          </Button>
        </form>

        <div className="mt-5 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleDemoLogin}
            disabled={submitting}
            className="w-full"
          >
            Demo Login (Seeded Studio Owner)
          </Button>
          <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
            founder@aicontent.studio / DemoStudioPass!2026
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    user,
    workspaces,
    activeWorkspace,
    isLoading,
    switchWorkspace,
    createWorkspace,
    logout,
    feedback,
    setFeedback,
  } = useStudio();

  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading AI Content Studio session...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen defaultMode={pathname === '/register' ? 'register' : 'login'} />;
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreatingWs(true);
    try {
      await createWorkspace(newWsName.trim());
      setNewWsName('');
      setShowNewWorkspaceModal(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create workspace',
      });
    } finally {
      setCreatingWs(false);
    }
  };

  const currentNav =
    FLAT_NAV_ITEMS.find(
      (i) => pathname === i.href || (pathname === '/' && i.href === '/dashboard'),
    ) ?? FLAT_NAV_ITEMS[0]!;

  const renderSidebarBody = (onNavigate?: () => void) => (
    <>
      <div className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            {...(onNavigate ? { onClick: onNavigate } : {})}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-sidebar-foreground"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span>AI Content Studio</span>
          </Link>
          <Badge variant="ai">{activeWorkspace?.role ?? 'MEMBER'}</Badge>
        </div>

        <div className="mt-3">
          <label className="block text-[11px] font-medium text-muted-foreground">
            Active Workspace
          </label>
          <div className="mt-1 flex gap-1.5">
            <select
              aria-label="Active Workspace"
              value={activeWorkspace?.id ?? ''}
              onChange={(e) => switchWorkspace(e.target.value)}
              className="w-full rounded-lg border border-sidebar-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-ring focus:outline-none"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name} ({ws.role})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewWorkspaceModal(true)}
              title="Create New Workspace"
              aria-label="Create New Workspace"
              className="inline-flex items-center justify-center rounded-lg border border-sidebar-border bg-secondary px-2 text-foreground transition-colors hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || (pathname === '/' && item.href === '/dashboard');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-fast',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/80 hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="truncate text-xs font-medium text-foreground">{user.fullName}</div>
        <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onNavigate?.();
            void logout();
          }}
          className="mt-3 w-full justify-center"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {renderSidebarBody()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop Topbar */}
        <header className="hidden h-14 items-center justify-between gap-4 border-b border-border bg-card/70 px-6 backdrop-blur-sm lg:flex">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
            <span className="font-mono uppercase tracking-wider">{currentNav.group}</span>
            <span>/</span>
            <span className="font-semibold text-foreground">{currentNav.label}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-secondary px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Command className="h-3.5 w-3.5 shrink-0" />
              <span>Quick jump</span>
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl+K
              </kbd>
            </button>
            <ThemeToggle />
            <Link
              href="/studio"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Create with AI
            </Link>
          </div>
        </header>

        {/* Mobile & Tablet Topbar */}
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5 lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-foreground"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-foreground">AI Content Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Badge variant="ai">{activeWorkspace?.name ?? 'Studio'}</Badge>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="fixed inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
            <div className="relative z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar">
              <div className="flex items-center justify-end border-b border-sidebar-border px-4 py-2.5">
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              </div>
              {renderSidebarBody(() => setMobileNavOpen(false))}
            </div>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={cn(
              'flex items-center justify-between border-b px-4 py-2.5 text-xs font-medium md:px-6',
              feedback.type === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-success/30 bg-success-surface text-success',
            )}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="ml-4 font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        routes={FLAT_NAV_ITEMS.map(({ href, label, group }) => ({ href, label, group }))}
      />

      {showNewWorkspaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Create New Workspace</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each workspace has isolated projects, assets, Brand Kit, and RBAC members.
            </p>
            <form onSubmit={handleCreateWorkspace} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Workspace Name
                </label>
                <Input
                  type="text"
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Acme Social Studio"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewWorkspaceModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingWs}>
                  {creatingWs ? 'Creating...' : 'Create Workspace'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
