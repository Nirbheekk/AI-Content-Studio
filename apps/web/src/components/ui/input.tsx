import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
