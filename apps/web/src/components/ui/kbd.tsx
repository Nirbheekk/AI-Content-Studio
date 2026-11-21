import * as React from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
