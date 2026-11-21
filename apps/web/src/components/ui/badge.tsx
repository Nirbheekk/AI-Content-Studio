import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none transition-colors duration-150',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        neutral: 'border-border bg-secondary text-muted-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border bg-card text-foreground',
        ai: 'border-ai/25 bg-ai-surface text-ai',
        success: 'border-success/25 bg-success-surface text-success',
        warning: 'border-warning/25 bg-warning-surface text-warning',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
        destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
        info: 'border-info/25 bg-info-surface text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
