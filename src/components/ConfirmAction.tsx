'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Extra content rendered between the description and the error/action row (e.g. a summary block). */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions (return, cancel, role change) get the rose treatment; default is neutral/brand. */
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
  loadingLabel?: string;
  /** Disables the confirm button beyond the loading state, e.g. an unmet validation rule. */
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  /**
   * High-stakes tier: requires the user to type an exact word/phrase before the confirm
   * button becomes enabled. Use for irreversible, wide-blast-radius actions (e.g. a manual
   * retention purge) where a click-through confirm isn't enough friction.
   */
  typedConfirmation?: {
    requiredText: string;
    label?: string;
  };
}

/**
 * Shared confirmation dialog for state-changing actions (07-design-system.md §5,
 * 11-frontend-ui-rules.md §3: "no destructive or state-changing action is wired
 * directly to a single click without this component"). Built on the shadcn/ui
 * Dialog primitive, so it inherits focus trapping, Escape-to-close, and
 * focus-return-on-close for free.
 */
export function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  loadingLabel = 'Working…',
  confirmDisabled = false,
  error,
  onConfirm,
  typedConfirmation,
}: ConfirmActionProps) {
  const [typedValue, setTypedValue] = React.useState('');
  const typedInputId = React.useId();

  const typedMismatch = !!typedConfirmation && typedValue !== typedConfirmation.requiredText;

  const handleOpenChange = (next: boolean) => {
    if (isLoading) return;
    if (!next) setTypedValue('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children}

        {typedConfirmation && (
          <div className="space-y-1.5">
            <label htmlFor={typedInputId} className="block text-xs font-semibold text-text-primary">
              {typedConfirmation.label || `Type "${typedConfirmation.requiredText}" to confirm:`}
            </label>
            <input
              id={typedInputId}
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isLoading}
              className="w-full rounded-lg border border-border-default p-2.5 text-sm font-mono text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg bg-status-returned/10 p-3 text-xs text-status-returned-text border border-status-returned/30">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isLoading} onClick={() => handleOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            disabled={isLoading || confirmDisabled || typedMismatch}
            onClick={() => onConfirm()}
          >
            {isLoading ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
