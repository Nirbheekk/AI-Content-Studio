'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  Check,
  ChevronsUpDown,
  Film,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  Search,
  Send,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useStudio } from '@/context/studio-context';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { CommandPalette } from '@/components/design-system/command-palette';
import { NewCreationDialog } from '@/components/workflow/new-creation-dialog';
import { AuthScreen } from '@/components/auth/auth-screen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export { AuthScreen };

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Create',
    items: [
      { href: '/dashboard', label: 'Command Center', icon: LayoutDashboard },
      { href: '/studio', label: 'AI Studio', icon: Sparkles },
      { href: '/editor', label: 'Video Editor', icon: Film },
      { href: '/repurpose', label: 'Repurpose', icon: Repeat },
    ],
  },
  {
    title: 'Library',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/library', label: 'Media Library', icon: ImageIcon },
    ],
  },
  {
    title: 'Distribute',
    items: [
      { href: '/publish', label: 'Publish Queue', icon: Send },
      { href: '/calendar', label: 'Calendar', icon: Calendar },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { href: '/brand-kit', label: 'Brand Kit', icon: Palette },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const FLAT_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    user,
    workspaces,
    activeWorkspace,
    isLoading,
    logout,
    switchWorkspace,
    createWorkspace,
    setFeedback,
  } = useStudio();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newCreationOpen, setNewCreationOpen] = useState(false);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-xs text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const currentNav = FLAT_NAV.find((item) => pathname.startsWith(item.href));

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreatingWs(true);
    try {
      await createWorkspace(newWsName.trim());
      setNewWsName('');
      setCreateWsOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create workspace',
      });
    } finally {
      setCreatingWs(false);
    }
  };

  const renderNavLinks = (isCollapsed: boolean, onNavigate?: () => void) => (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3 studio-scrollbar">
      {!isCollapsed ? (
        <Button
          size="sm"
          onClick={() => {
            onNavigate?.();
            setNewCreationOpen(true);
          }}
          className="w-full justify-start"
        >
          <Plus className="h-3.5 w-3.5" />
          New Creation
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={() => setNewCreationOpen(true)}
              aria-label="New Creation"
              className="mx-auto"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New Creation</TooltipContent>
        </Tooltip>
      )}

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </div>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const linkEl = (
              <Link
                key={item.href}
                href={item.href}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                  isCollapsed && 'justify-center px-0',
                  active
                    ? 'bg-sidebar-accent text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', active && 'text-foreground')} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return linkEl;
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-150 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
          {!collapsed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-sidebar-accent"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="lovable-gradient-badge flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-ai-foreground shadow-sm">
                      {(activeWorkspace?.name?.[0] ?? 'S').toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {activeWorkspace?.name ?? 'Studio'}
                    </span>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onSelect={() => switchWorkspace(ws.id)}
                    className="justify-between"
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === activeWorkspace?.id && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCreateWsOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Create Workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(collapsed && 'mx-auto')}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {renderNavLinks(collapsed)}

        <div className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-sidebar-accent',
                  collapsed && 'justify-center',
                )}
              >
                <Avatar name={user.fullName} />
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{user.fullName}</div>
                    <div className="truncate text-xs font-medium text-muted-foreground">
                      {activeWorkspace?.role ?? 'MEMBER'}
                    </div>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium text-foreground">{user.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void logout()} className="text-destructive">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>{activeWorkspace?.name ?? 'AI Content Studio'}</SheetTitle>
          </SheetHeader>
          {renderNavLinks(false, () => setMobileOpen(false))}
        </SheetContent>
      </Sheet>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <span className="truncate text-xs font-semibold text-foreground">
              {currentNav?.label ?? 'Studio'}
            </span>
            {activeWorkspace?.planTier && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {activeWorkspace.planTier}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden h-7 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              <Search className="h-3 w-3" />
              <span>Search...</span>
              <Kbd>⌘K</Kbd>
            </button>
            <Button
              variant="outline"
              size="icon-sm"
              className="sm:hidden"
              onClick={() => setCommandOpen(true)}
              aria-label="Search commands"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto studio-scrollbar">
          <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNewCreation={() => setNewCreationOpen(true)}
      />
      <NewCreationDialog open={newCreationOpen} onOpenChange={setNewCreationOpen} />

      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Organize projects, brand kits, and social accounts in a separate workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateWorkspace} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-ws-name">Workspace Name</Label>
              <Input
                id="new-ws-name"
                required
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="e.g., Growth Team"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateWsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingWs}>
                {creatingWs ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
