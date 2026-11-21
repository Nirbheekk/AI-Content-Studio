import * as React from 'react';
import { cn } from '@/lib/utils';

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      data-slot="avatar"
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-foreground',
        className,
      )}
    >
      {initials || 'U'}
    </span>
  );
}
