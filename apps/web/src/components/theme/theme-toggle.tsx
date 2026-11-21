'use client';

import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemeMode, useTheme } from './theme-provider';
import { cn } from '../../lib/cn';

const MODES: Array<{ id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const nextMode: ThemeMode = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const current = MODES.find((m) => m.id === theme) ?? MODES[2]!;
    const Icon = current.icon;
    return (
      <button
        type="button"
        onClick={() => setTheme(nextMode)}
        aria-label={`Theme: ${current.label}. Click to switch.`}
        title={`Theme: ${current.label}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme selector"
      className="inline-flex items-center rounded-lg border border-border bg-secondary p-0.5"
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = theme === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setTheme(m.id)}
            aria-pressed={active}
            title={`${m.label} theme`}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
