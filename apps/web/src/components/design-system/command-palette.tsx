'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from '../theme/theme-provider';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  routes,
}: {
  open: boolean;
  onClose: () => void;
  routes: Array<{ href: string; label: string; group: string }>;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const items: CommandItem[] = useMemo(() => {
    const navItems: CommandItem[] = routes.map((r) => ({
      id: `nav-${r.href}`,
      label: r.label,
      group: r.group,
      action: () => {
        router.push(r.href);
        onClose();
      },
    }));
    const themeItems: CommandItem[] = [
      { id: 'theme-light', label: 'Switch to Light Theme', group: 'APPEARANCE', action: () => { setTheme('light'); onClose(); } },
      { id: 'theme-dark', label: 'Switch to Dark Theme', group: 'APPEARANCE', action: () => { setTheme('dark'); onClose(); } },
      { id: 'theme-system', label: 'Use System Theme', group: 'APPEARANCE', action: () => { setTheme('system'); onClose(); } },
    ];
    return [...navItems, ...themeItems];
  }, [routes, router, onClose, setTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q),
    );
  }, [items, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered[0]) filtered[0].action();
            }}
            placeholder="Jump to page or switch theme..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No matching commands.</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="flex items-center gap-2">
                  {item.id === 'theme-light' ? (
                    <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : item.id === 'theme-dark' ? (
                    <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : item.id === 'theme-system' ? (
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Command className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {item.label}
                </span>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  {item.group}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
