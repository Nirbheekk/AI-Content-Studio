'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number;
}

export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, ...props }, ref) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      ref={ref}
      data-slot="progress"
      value={clamped}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-secondary',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-transform duration-300"
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = 'Progress';
