'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  BarChart3,
  Calendar,
  Film,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Moon,
  Palette,
  Plus,
  Repeat,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from '@/components/theme/theme-provider';

interface CommandAction {
  id: string;
  label: string;
  group: 'Create' | 'Library' | 'Distribute' | 'Workspace' | 'Appearance';
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewCreation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewCreation?: () => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const navigate = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const actions: CommandAction[] = [
    ...(onNewCreation
      ? [
          {
            id: 'new-creation',
            label: 'New Creation Brief',
            group: 'Create' as const,
            keywords: 'new brief start workflow create video',
            icon: Plus,
            onSelect: () => {
              onOpenChange(false);
              onNewCreation();
            },
          },
        ]
      : []),
    {
      id: 'dashboard',
      label: 'Command Center',
      group: 'Create',
      keywords: 'home overview dashboard',
      icon: LayoutDashboard,
      onSelect: () => navigate('/dashboard'),
    },
    {
      id: 'studio',
      label: 'AI Studio',
      group: 'Create',
      keywords: 'prompt generate agent chat preview',
      icon: Sparkles,
      onSelect: () => navigate('/studio'),
    },
    {
      id: 'editor',
      label: 'Video Editor',
      group: 'Create',
      keywords: 'timeline scenes remotion edit',
      icon: Film,
      onSelect: () => navigate('/editor'),
    },
    {
      id: 'repurpose',
      label: 'Repurpose Formats',
      group: 'Create',
      keywords: 'shorts reels tiktok linkedin variants',
      icon: Repeat,
      onSelect: () => navigate('/repurpose'),
    },
    {
      id: 'projects',
      label: 'Projects',
      group: 'Library',
      keywords: 'campaigns folders workspaces',
      icon: FolderKanban,
      onSelect: () => navigate('/projects'),
    },
    {
      id: 'library',
      label: 'Media Library',
      group: 'Library',
      keywords: 'assets upload video audio image',
      icon: ImageIcon,
      onSelect: () => navigate('/library'),
    },
    {
      id: 'publish',
      label: 'Publish Queue',
      group: 'Distribute',
      keywords: 'postiz social approve schedule',
      icon: Send,
      onSelect: () => navigate('/publish'),
    },
    {
      id: 'calendar',
      label: 'Content Calendar',
      group: 'Distribute',
      keywords: 'schedule dates timeline posts',
      icon: Calendar,
      onSelect: () => navigate('/calendar'),
    },
    {
      id: 'analytics',
      label: 'Analytics',
      group: 'Distribute',
      keywords: 'metrics usage tokens renders',
      icon: BarChart3,
      onSelect: () => navigate('/analytics'),
    },
    {
      id: 'brand-kit',
      label: 'Brand Kit',
      group: 'Workspace',
      keywords: 'colors fonts tone style',
      icon: Palette,
      onSelect: () => navigate('/brand-kit'),
    },
    {
      id: 'settings',
      label: 'Team & Settings',
      group: 'Workspace',
      keywords: 'rbac members tokens workspace',
      icon: Settings,
      onSelect: () => navigate('/settings'),
    },
    {
      id: 'theme-light',
      label: 'Switch to Light Mode',
      group: 'Appearance',
      keywords: 'light theme appearance',
      icon: Sun,
      onSelect: () => {
        setTheme('light');
        onOpenChange(false);
      },
    },
    {
      id: 'theme-dark',
      label: 'Switch to Dark Mode',
      group: 'Appearance',
      keywords: 'dark theme appearance',
      icon: Moon,
      onSelect: () => {
        setTheme('dark');
        onOpenChange(false);
      },
    },
  ];

  const groups: Array<CommandAction['group']> = [
    'Create',
    'Library',
    'Distribute',
    'Workspace',
    'Appearance',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <Command className="flex h-full w-full flex-col bg-popover text-popover-foreground">
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Jump to view or run action..."
              className="flex h-10 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1.5 studio-scrollbar">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
              No matching command.
            </Command.Empty>
            {groups.map((group) => {
              const items = actions.filter((a) => a.group === group);
              if (items.length === 0) return null;
              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.keywords}`}
                        onSelect={item.onSelect}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{item.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
