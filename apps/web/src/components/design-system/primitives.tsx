'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  Badge,
  type BadgeVariant,
} from '../ui/badge';
import {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
} from '../ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyState,
  EmptyTitle,
} from '../ui/empty';
import { Input } from '../ui/input';
import { Kbd } from '../ui/kbd';
import { Label } from '../ui/label';
import { NativeSelect, Select } from '../ui/native-select';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';
import { Textarea } from '../ui/textarea';

export {
  Badge,
  type BadgeVariant,
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyState,
  EmptyTitle,
  Input,
  Kbd,
  Label,
  NativeSelect,
  Select,
  Separator,
  Skeleton,
  Textarea,
};

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      data-slot="page-header"
      className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sublabel,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'default' | 'ai' | 'success' | 'warning';
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'ai'
      ? 'text-primary'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground';

  return (
    <Card data-slot="metric-card" className="p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums', toneClass)}>
        {value}
      </div>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
    </Card>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function StatusIndicator({
  status,
  label,
}: {
  status: 'healthy' | 'success' | 'warning' | 'error' | 'idle' | 'processing';
  label: string;
}) {
  const dot =
    status === 'healthy' || status === 'success'
      ? 'bg-success'
      : status === 'warning'
        ? 'bg-warning'
        : status === 'error'
          ? 'bg-destructive'
          : status === 'processing'
            ? 'animate-pulse bg-primary'
            : 'bg-muted-foreground';

  return (
    <span
      data-slot="status-indicator"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
    >
      <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
