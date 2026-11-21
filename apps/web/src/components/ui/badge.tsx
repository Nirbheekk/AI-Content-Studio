'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'ai'
  | 'success'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'outline';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground border-border',
  secondary: 'bg-secondary text-secondary-foreground border-border',
  ai: 'bg-ai-surface text-accent-foreground border-primary/25',
  success: 'bg-success-surface text-success border-success/30',
  warning: 'bg-warning-surface text-warning border-warning/30',
  info: 'bg-info-surface text-info border-info/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  outline: 'bg-transparent text-muted-foreground border-border',
};

export function Badge({
  children,
  variant = 'default',
  className,
  ...props
}: React.ComponentProps<'span'> & {
  variant?: BadgeVariant;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-normal break-words transition-colors',
        BADGE_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
