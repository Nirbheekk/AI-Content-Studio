'use client';

import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './card';

export function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card
      data-slot="empty"
      className={cn(
        'flex flex-col items-center justify-center border-dashed p-8 text-center',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-header"
      className={cn('flex max-w-md flex-col items-center gap-1.5 text-center', className)}
      {...props}
    />
  );
}

export function EmptyMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-media"
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="empty-title"
      className={cn('mt-2 text-sm font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-description"
      className={cn('max-w-md text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-content" className={cn('mt-4', className)} {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>{icon ?? <Inbox className="h-5 w-5" />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
