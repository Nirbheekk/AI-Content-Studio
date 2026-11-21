'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-border bg-card text-card-foreground shadow-lg text-xs font-sans',
          title: 'text-xs font-medium text-foreground',
          description: 'text-xs text-muted-foreground',
          actionButton:
            'rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground',
          cancelButton:
            'rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground',
        },
      }}
    />
  );
}
