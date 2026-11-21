import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => {
    const isAutoWidth = className?.includes('w-auto') ?? false;
    return (
      <div className={cn('relative inline-flex items-center', isAutoWidth ? 'w-auto' : 'w-full')}>
        <select
          ref={ref}
          data-slot="native-select"
          className={cn(
            'flex h-9 w-full appearance-none rounded-xl border border-input bg-background pl-3 pr-8 text-sm text-foreground transition-colors duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
      </div>
    );
  },
);
NativeSelect.displayName = 'NativeSelect';
