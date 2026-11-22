'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { useStudio } from '@/context/studio-context';
import { cn } from '@/lib/utils';
import { Badge, type BadgeProps } from '../ui/badge';
import { Button, type ButtonProps, buttonVariants } from '../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Empty } from '../ui/empty';
import { Input } from '../ui/input';
import { Kbd } from '../ui/kbd';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/native-select';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';
import { Textarea } from '../ui/textarea';

export const Select = NativeSelect;
export const EmptyState = Empty;
export type BadgeVariant = NonNullable<BadgeProps['variant']>;
export type ButtonVariant = NonNullable<ButtonProps['variant']>;
export type ButtonSize = NonNullable<ButtonProps['size']>;

export {
  Badge,
  Button,
  type ButtonProps,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  Input,
  Kbd,
  Label,
  NativeSelect,
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
      className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
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
      ? 'text-ai'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground';

  return (
    <Card data-slot="metric-card" className="p-6 transition-colors duration-150 hover:border-foreground/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tracking-tight tabular-nums', toneClass)}>
        {value}
      </div>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
    </Card>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-0.5">
          {title && <div className="font-semibold text-destructive">{title}</div>}
          <div className="text-xs text-destructive/90">{message}</div>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
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
  status: string;
  label?: string;
}) {
  const normalized = status.toUpperCase();
  const variant: BadgeVariant =
    normalized.includes('READY') ||
    normalized.includes('PUBLISHED') ||
    normalized.includes('APPROVED') ||
    normalized.includes('COMPLETED') ||
    normalized.includes('ACTIVE')
      ? 'success'
      : normalized.includes('FAIL') ||
          normalized.includes('ERROR') ||
          normalized.includes('CANCEL')
        ? 'destructive'
        : normalized.includes('AWAITING') ||
            normalized.includes('SCHEDULED') ||
            normalized.includes('PENDING')
          ? 'warning'
          : 'ai';

  const dotClass =
    variant === 'success'
      ? 'bg-success'
      : variant === 'destructive'
        ? 'bg-destructive'
        : variant === 'warning'
          ? 'bg-warning'
          : 'bg-ai animate-pulse';

  return (
    <Badge variant={variant}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      {label ?? status.replace(/_/g, ' ')}
    </Badge>
  );
}

export interface PipelineStepItem {
  id: 'brief' | 'studio' | 'editor' | 'repurpose' | 'publish';
  label: string;
  href: string;
}

const DEFAULT_PIPELINE_STEPS: PipelineStepItem[] = [
  { id: 'brief', label: '1. Assets & Brief', href: '/library' },
  { id: 'studio', label: '2. AI Studio', href: '/studio' },
  { id: 'editor', label: '3. Refine', href: '/editor' },
  { id: 'repurpose', label: '4. Repurpose', href: '/repurpose' },
  { id: 'publish', label: '5. Approve & Publish', href: '/publish' },
];

export function WorkflowStepper({
  activeStep,
  projectId,
  compositionId,
  className,
}: {
  activeStep: PipelineStepItem['id'];
  projectId?: string | undefined;
  compositionId?: string | undefined;
  className?: string | undefined;
}) {
  const { activeProjectId, activeCompositionId } = useStudio();
  const resolvedProjectId = projectId ?? activeProjectId ?? undefined;
  const resolvedCompositionId = compositionId ?? activeCompositionId ?? undefined;
  const activeIdx = DEFAULT_PIPELINE_STEPS.findIndex((s) => s.id === activeStep);

  return (
    <nav
      aria-label="Content production workflow"
      className={cn(
        'flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-secondary/70 p-1',
        className,
      )}
    >
      {DEFAULT_PIPELINE_STEPS.map((step, idx) => {
        const isCurrent = idx === activeIdx;
        const isDone = idx < activeIdx;
        const params = new URLSearchParams();
        if (resolvedProjectId) params.set('projectId', resolvedProjectId);
        if (resolvedCompositionId && (step.id === 'editor' || step.id === 'publish')) {
          params.set('compositionId', resolvedCompositionId);
        }
        const query = params.toString();
        const href = query ? `${step.href}?${query}` : step.href;

        return (
          <Link
            key={step.id}
            href={href}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150',
              isCurrent
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                : isDone
                  ? 'text-foreground/80 hover:bg-card/60 hover:text-foreground'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
            )}
          >
            {isDone && <Check className="h-3 w-3 text-success" />}
            <span>{step.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
