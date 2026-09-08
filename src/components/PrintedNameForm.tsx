'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PrintedNameFormProps {
  currentName: string | null;
  onSaveNameAction: (fullName: string) => Promise<{ success?: boolean; error?: string }>;
}

export function PrintedNameForm({ currentName, onSaveNameAction }: PrintedNameFormProps) {
  const [name, setName] = useState(currentName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (name.trim().length < 2) {
      setErrorMsg('Printed name must be at least 2 characters.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await onSaveNameAction(name.trim());
      if (res.error) throw new Error(res.error);
      setSuccessMsg('Printed name saved.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save printed name.';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-surface-bg border border-border-default rounded-xl p-6 shadow-xs">
      <div className="pb-4 border-b border-border-default mb-4">
        <h3 className="text-base font-bold text-text-primary">Printed Name</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Composited onto signed PDFs alongside your signature stamp, in place of your email.
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-lg bg-status-returned/10 p-3 text-xs text-status-returned-text border border-status-returned/30">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div role="status" className="mb-4 rounded-lg bg-status-approved/10 p-3 text-xs text-status-approved-text border border-status-approved/30">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="printedName">Full / Printed Name</Label>
          <Input
            id="printedName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={150}
            required
            placeholder="e.g. Juan Dela Cruz"
          />
        </div>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Name'}
        </Button>
      </form>
    </div>
  );
}
