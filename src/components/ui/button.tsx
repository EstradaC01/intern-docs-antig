import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default: 'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-xs',
        destructive: 'bg-status-returned text-white hover:bg-status-overdue shadow-xs',
        success: 'bg-status-approved text-white hover:bg-status-approved-text shadow-xs',
        outline: 'border border-border-default bg-surface-bg text-text-primary hover:bg-surface-hover',
        ghost: 'text-text-muted hover:bg-surface-hover hover:text-text-primary',
        link: 'text-brand-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-2.5 py-1.5',
        lg: 'h-10 px-5 py-2.5',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
