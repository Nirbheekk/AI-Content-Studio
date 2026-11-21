'use client';

import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'ai';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:opacity-95',
  ai: 'bg-ai text-ai-foreground shadow-sm hover:opacity-95',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-border bg-card text-foreground hover:bg-secondary',
  ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:opacity-95',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-md px-3 text-xs',
  md: 'h-9 rounded-lg px-4 text-xs sm:text-sm',
  lg: 'h-11 rounded-xl px-5 text-sm',
  icon: 'h-9 w-9 rounded-lg p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[88px] w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1.5 text-xs sm:text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

type BadgeVariant = 'default' | 'ai' | 'success' | 'warning' | 'info' | 'destructive' | 'outline';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground border-border',
  ai: 'bg-ai-surface text-accent-foreground border-primary/25',
  success: 'bg-success-surface text-success border-success/30',
  warning: 'bg-warning-surface text-warning border-warning/30',
  info: 'bg-info-surface text-info border-info/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  outline: 'bg-transparent text-muted-foreground border-border',
};

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-normal break-words',
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

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
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sublabel,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'default' | 'ai' | 'success' | 'warning';
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
    <Card className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums', toneClass)}>
        {value}
      </div>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
    </Card>
  );
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
    <Card className="flex flex-col items-center justify-center border-dashed p-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
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

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-secondary', className)} />;
}

export function StatusIndicator({
  status,
  label,
}: {
  status: 'healthy' | 'warning' | 'error' | 'idle';
  label: string;
}) {
  const dot =
    status === 'healthy'
      ? 'bg-success'
      : status === 'warning'
        ? 'bg-warning'
        : status === 'error'
          ? 'bg-destructive'
          : 'bg-muted-foreground';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
