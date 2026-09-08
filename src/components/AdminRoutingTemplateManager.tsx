'use client';

import React, { useState } from 'react';
import { Workflow, Clock, Trash2 } from 'lucide-react';
import type { CreateRoutingTemplateInput } from './AdminRequirementManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ConfirmAction';

interface RoutingTemplate {
  id: string;
  name: string;
  steps: Array<{ step: number; role?: string; user_id?: string; name: string }>;
  sla_days?: number | null;
  created_at: string;
}

interface AdminRoutingTemplateManagerProps {
  routingTemplates: RoutingTemplate[];
  onCreateTemplate: (data: CreateRoutingTemplateInput) => Promise<{ success?: boolean; error?: string }>;
  onDeleteTemplate: (templateId: string) => Promise<{ success?: boolean; error?: string }>;
}

export function AdminRoutingTemplateManager({
  routingTemplates,
  onCreateTemplate,
  onDeleteTemplate,
}: AdminRoutingTemplateManagerProps) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [slaDays, setSlaDays] = useState(2);
  const [stepCount, setStepCount] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoutingTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const steps: Array<{ step: number; role: 'approver' | 'admin'; name: string }> = [
        { step: 1, role: 'approver', name: 'Supervisor Review' },
      ];
      if (stepCount === 2) {
        steps.push({ step: 2, role: 'admin', name: 'Admin Final Sign-Off' });
      }

      const res = await onCreateTemplate({
        name,
        steps,
        sla_days: Number(slaDays),
      });

      if (res.error) throw new Error(res.error);
      setShowModal(false);
      setName('');
      setSlaDays(2);
      setStepCount(1);
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create template';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await onDeleteTemplate(deleteTarget.id);
      if (res.error) throw new Error(res.error);
      setDeleteTarget(null);
      window.location.reload();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">Routing Templates</h1>
        <Button onClick={() => setShowModal(true)}>+ New Routing Template</Button>
      </div>

      {/* Grid of Routing Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {routingTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-border-strong hover:shadow-sm transition-all"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-muted text-brand-primary">
                    <Workflow className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-text-primary truncate">{tpl.name}</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {(tpl.steps || []).length} Sequential {(tpl.steps || []).length === 1 ? 'Step' : 'Steps'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-primary bg-brand-muted px-2.5 py-1 rounded-full border border-border-default whitespace-nowrap">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {tpl.sla_days ? `${tpl.sla_days}d SLA` : 'No SLA'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(tpl)}
                    aria-label={`Delete ${tpl.name}`}
                    title="Delete routing template"
                    className="p-1.5 rounded-lg text-text-muted hover:text-status-returned-text hover:bg-status-returned/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {/* Step visualization */}
            <div className="space-y-2 border-t border-border-default pt-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Approval Chain
              </span>
              <div className="space-y-1.5">
                {(tpl.steps || []).map((s, idx) => (
                  <div
                    key={s.step || idx}
                    className="flex items-center justify-between bg-surface-muted p-2 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center">
                        {s.step || idx + 1}
                      </span>
                      <span className="font-semibold text-text-primary text-xs">{s.name || `Step ${idx + 1}`}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-text-muted bg-surface-hover px-1.5 py-0.5 rounded">
                      {s.role || 'approver'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {routingTemplates.length === 0 && (
          <div className="col-span-full py-10 text-center text-text-muted bg-surface-bg border border-border-default rounded-2xl">
            <div className="space-y-1">
              <p className="font-semibold text-text-primary text-sm">No routing templates configured yet</p>
              <p className="text-xs">Click &quot;+ New Routing Template&quot; above to create one.</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Routing Template</DialogTitle>
          </DialogHeader>

          {errorMsg && (
            <div role="alert" className="rounded-xl bg-status-returned/10 p-3 text-xs text-status-returned-text border border-status-returned/30">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-text-primary mb-1">Template Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 2-Step Executive Approval"
                  className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-text-primary mb-1">Approval Steps</label>
                  <select
                    value={stepCount}
                    onChange={(e) => setStepCount(Number(e.target.value) as 1 | 2)}
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  >
                    <option value={1}>1 Step (Supervisor)</option>
                    <option value={2}>2 Steps (Supervisor → Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-text-primary mb-1">SLA Target (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={slaDays}
                    onChange={(e) => setSlaDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  />
                </div>
              </div>

              {/* Steps Preview */}
              <div className="bg-surface-muted p-3.5 rounded-xl border border-border-default space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Workflow Preview</span>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-text-primary">
                    <span>Step 1: Supervisor Review</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Approver</span>
                  </div>
                  {stepCount === 2 && (
                    <div className="flex items-center justify-between text-text-primary">
                      <span>Step 2: Admin Final Sign-Off</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Admin</span>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Template'}
                </Button>
              </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>

      {/* Delete Routing Template Confirmation */}
      <ConfirmAction
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title="Delete this routing template?"
        description="This permanently removes the routing template. It can only be deleted once no requirement still points to it — repoint any requirements using it to a different template first. Past submissions are unaffected either way, since their approval steps are already frozen at submission time."
        confirmLabel="Delete Template"
        variant="destructive"
        isLoading={isDeleting}
        loadingLabel="Deleting…"
        error={deleteError}
        onConfirm={handleConfirmDelete}
        typedConfirmation={
          deleteTarget
            ? { requiredText: deleteTarget.name, label: `Type "${deleteTarget.name}" to confirm:` }
            : undefined
        }
      >
        {deleteTarget && (
          <div className="rounded-xl bg-surface-muted border border-border-default p-3.5 text-sm space-y-1">
            <strong className="text-text-primary">{deleteTarget.name}</strong>
            <p className="text-text-muted text-xs">
              {(deleteTarget.steps || []).length} sequential {(deleteTarget.steps || []).length === 1 ? 'step' : 'steps'} · {deleteTarget.sla_days ? `${deleteTarget.sla_days}d SLA` : 'No SLA'}
            </p>
          </div>
        )}
      </ConfirmAction>
    </div>
  );
}
