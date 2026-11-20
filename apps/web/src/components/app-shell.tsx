'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStudio } from '../context/studio-context';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/library', label: 'Content Library' },
  { href: '/studio', label: 'AI Studio' },
  { href: '/editor', label: 'Video Editor' },
  { href: '/repurpose', label: 'Repurpose Engine' },
  { href: '/brand-kit', label: 'Brand Kit' },
  { href: '/settings', label: 'Settings & RBAC' },
];

export function AuthScreen({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' }) {
  const { loginWithCredentials, registerAccount, feedback, setFeedback } = useStudio();
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl">
        <div className="mb-6">
          <span className="inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            AI Content Operating System
          </span>
          <h1 className="mt-3 text-2xl font-bold text-white">
            {mode === 'login' ? 'Sign in to your Studio' : 'Create your Studio Workspace'}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Describe it. Create it. Refine it. Publish it.
          </p>
        </div>

        {feedback && (
          <div
            role="alert"
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              feedback.type === 'error'
                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-md py-2 text-xs font-medium transition ${
              mode === 'login' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-md py-2 text-xs font-medium transition ${
              mode === 'register' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Register &amp; Onboard
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Workspace Name (Onboarding)
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Rivera Media Lab"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@aicontent.studio"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting
              ? 'Authenticating...'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account & Workspace'}
          </button>
        </form>

        <div className="mt-6 border-t border-zinc-800 pt-4">
          <button
            type="button"
            disabled={submitting}
            onClick={handleDemoLogin}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Quick Sign In with Seeded Demo Founder Account
          </button>
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
    feedback,
    setFeedback,
    switchWorkspace,
    createWorkspace,
    logout,
  } = useStudio();

  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading AI Content Studio workspace...
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

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-tight text-white">AI Content Studio</span>
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
              {activeWorkspace?.role ?? 'MEMBER'}
            </span>
          </div>

          <div className="mt-3">
            <label className="block text-[11px] text-zinc-400">Active Workspace</label>
            <div className="mt-1 flex gap-1.5">
              <select
                aria-label="Active Workspace"
                value={activeWorkspace?.id ?? ''}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
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
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || (pathname === '/' && item.href === '/dashboard');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800 p-4">
          <div className="truncate text-xs font-medium text-white">{user.fullName}</div>
          <div className="truncate text-[11px] text-zinc-400">{user.email}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-red-500/40 hover:text-red-300"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {feedback && (
          <div
            role="status"
            className={`flex items-center justify-between border-b px-6 py-2.5 text-xs ${
              feedback.type === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
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

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {showNewWorkspaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-white">Create New Workspace</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Each workspace has isolated projects, assets, Brand Kit, and RBAC members.
            </p>
            <form onSubmit={handleCreateWorkspace} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300">Workspace Name</label>
                <input
                  type="text"
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Acme Social Studio"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewWorkspaceModal(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingWs}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  {creatingWs ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
