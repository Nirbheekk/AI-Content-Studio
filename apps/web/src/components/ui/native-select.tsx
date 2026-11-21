'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      data-slot="native-select"
      className={cn(
        'flex h-9 w-full min-w-0 max-w-full truncate rounded-lg border border-input bg-card px-3 py-1.5 text-xs sm:text-sm text-foreground shadow-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
NativeSelect.displayName = 'NativeSelect';

export const Select = NativeSelect;
