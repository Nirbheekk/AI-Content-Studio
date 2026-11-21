'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'destructive'
  | 'ai'
  | 'success';

export type ButtonSize = 'default' | 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground shadow-sm hover:opacity-95 active:scale-[0.99]',
  primary: 'bg-primary text-primary-foreground shadow-sm hover:opacity-95 active:scale-[0.99]',
  ai: 'bg-ai text-ai-foreground shadow-sm hover:opacity-95 active:scale-[0.99]',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:scale-[0.99]',
  outline:
    'border border-input bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground active:scale-[0.99]',
  ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:opacity-95 active:scale-[0.99]',
  success: 'bg-success text-success-foreground shadow-sm hover:opacity-95 active:scale-[0.99]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: 'h-9 rounded-lg px-4 py-2 text-xs sm:text-sm',
  sm: 'h-8 rounded-md px-3 text-xs',
  md: 'h-9 rounded-lg px-4 text-xs sm:text-sm',
  lg: 'h-10 rounded-xl px-5 text-sm',
  icon: 'h-9 w-9 rounded-lg p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={buttonVariants({
        variant,
        size,
        ...(className !== undefined ? { className } : {}),
      })}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
