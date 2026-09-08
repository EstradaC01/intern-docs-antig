import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full rounded-xl border border-border-default p-2.5 text-xs text-text-primary placeholder:text-text-muted transition-colors outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-status-returned aria-invalid:ring-status-returned/40',
        className
      )}
      {...props}
    />
  );
}

export { Input };
