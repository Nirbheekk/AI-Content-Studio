import * as React from 'react';
import { cn } from '@/lib/utils';

export function Empty({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm [&>svg]:h-8 [&>svg]:w-8">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold tracking-tight text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
