'use client';

import React, { useState } from 'react';
import { FileText, Upload, Check, Workflow, HardDrive } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface CreateRequirementInput {
  name: string;
  description?: string;
  accepted_types: string[];
  max_size_mb: number;
  due_date_type: 'fixed' | 'relative';
  due_date_value: string;
  routing_template_id?: string | null;
  custom_reminder_days: number | null;
}

export interface CreateRoutingTemplateInput {
  name: string;
  steps: Array<{ step: number; role: 'approver' | 'admin'; name: string }>;
  sla_days: number;
}

interface Requirement {
  id: string;
  name: string;
  description?: string | null;
  accepted_types: string[];
  max_size_mb: number;
  due_date_type: 'fixed' | 'relative';
  due_date_value: string;
  routing_template_id?: string | null;
  version_number: number;
  template_url?: string | null;
  routing_templates?: {
    id: string;
    name: string;
    sla_days?: number | null;
    steps?: Array<{ step: number; role?: string; user_id?: string; name: string }>;
  } | null;
}

interface RoutingTemplate {
  id: string;
  name: string;
  steps: Array<{ step: number; role?: string; user_id?: string; name: string }>;
  sla_days?: number | null;
}

interface AdminRequirementManagerProps {
  requirements: Requirement[];
  routingTemplates: RoutingTemplate[];
  onCreateRequirement: (data: CreateRequirementInput) => Promise<{ success?: boolean; error?: string }>;
  onUploadTemplate: (requirementId: string, formData: FormData) => Promise<{ success?: boolean; error?: string }>;
}

export function AdminRequirementManager({
  requirements,
  routingTemplates,
  onCreateRequirement,
  onUploadTemplate,
}: AdminRequirementManagerProps) {
  const [showReqModal, setShowReqModal] = useState(false);
  const [templateUploadingId, setTemplateUploadingId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<Record<string, string>>({});

  // Requirement form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [acceptedTypes, setAcceptedTypes] = useState<string[]>(['application/pdf', 'image/png', 'image/jpeg']);
  const [maxSizeMb, setMaxSizeMb] = useState(20);
  const [dueDateType, setDueDateType] = useState<'fixed' | 'relative'>('relative');
  const [dueDateValue, setDueDateValue] = useState('30');
  const [routingTemplateId, setRoutingTemplateId] = useState('');
  const [customReminderDays, setCustomReminderDays] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTypeToggle = (type: string) => {
    if (acceptedTypes.includes(type)) {
      if (acceptedTypes.length > 1) {
        setAcceptedTypes(acceptedTypes.filter((t) => t !== type));
      }
    } else {
      setAcceptedTypes([...acceptedTypes, type]);
    }
  };

  const handleReqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await onCreateRequirement({
        name,
        description,
        accepted_types: acceptedTypes,
        max_size_mb: Number(maxSizeMb),
        due_date_type: dueDateType,
        due_date_value: dueDateValue,
        routing_template_id: routingTemplateId || null,
        custom_reminder_days: customReminderDays.trim() === '' ? null : Number(customReminderDays),
      });
      if (res.error) throw new Error(res.error);
      setShowReqModal(false);
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create requirement';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTemplateFileChange = async (requirementId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTemplateError((prev) => ({ ...prev, [requirementId]: '' }));
    setTemplateUploadingId(requirementId);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const res = await onUploadTemplate(requirementId, formData);
      if (res.error) throw new Error(res.error);
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload template';
      setTemplateError((prev) => ({ ...prev, [requirementId]: msg }));
    } finally {
      setTemplateUploadingId(null);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">Requirements</h1>
        <Button onClick={() => setShowReqModal(true)}>+ New Requirement</Button>
      </div>

      {/* Requirements List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {requirements.map((req) => (
          <div
            key={req.id}
            className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-4 hover:border-border-strong hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-muted text-brand-primary">
                  <FileText className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-text-primary truncate">{req.name}</h3>
                  <span className="text-[10px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                    Version {req.version_number}
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-brand-primary bg-brand-muted px-2.5 py-1 rounded-full border border-border-default whitespace-nowrap">
                {req.due_date_type === 'relative' ? `Due ${req.due_date_value}d after start` : `Due ${req.due_date_value}`}
              </span>
            </div>

            <p className="text-xs text-text-muted line-clamp-2">{req.description || 'No description'}</p>

            <div className="text-[11px] text-text-muted bg-surface-muted p-3.5 rounded-xl space-y-2.5">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {req.accepted_types.map((t) => t.split('/')[1]?.toUpperCase()).join(', ')} · Max {req.max_size_mb} MB
                </span>
              </div>
              <div className="pt-2.5 border-t border-border-default/60 flex flex-wrap items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5 font-semibold text-text-primary">
                  <Workflow className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {req.routing_templates?.name || 'Default (1-Step)'}
                </span>
                <span className="text-[10px] font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-border-default">
                  {req.routing_templates?.steps && req.routing_templates.steps.length > 0
                    ? req.routing_templates.steps.map((s) => (s.role === 'admin' ? 'Admin' : 'Supervisor')).join(' → ')
                    : 'Supervisor'}
                </span>
              </div>
            </div>

            {/* FR-4: optional blank template file interns can download before filling it out */}
            <div className="pt-3 border-t border-border-default/60 flex items-center justify-between gap-2 text-[11px]">
              <span className={`flex items-center gap-1.5 ${req.template_url ? 'text-emerald-700 font-semibold' : 'text-text-muted'}`}>
                {req.template_url && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                {req.template_url ? 'Template file attached' : 'No template file'}
              </span>
              <label className="cursor-pointer">
                <span className="flex items-center gap-1 text-brand-primary font-semibold hover:underline">
                  <Upload className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {templateUploadingId === req.id ? 'Uploading…' : req.template_url ? 'Replace' : 'Upload Template'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  disabled={templateUploadingId === req.id}
                  onChange={(e) => handleTemplateFileChange(req.id, e)}
                />
              </label>
            </div>
            {templateError[req.id] && (
              <p role="alert" className="text-[11px] text-rose-700">{templateError[req.id]}</p>
            )}
          </div>
        ))}

        {requirements.length === 0 && (
          <div className="md:col-span-2 py-10 text-center text-text-muted bg-surface-bg border border-border-default rounded-2xl">
            <div className="space-y-1">
              <p className="font-semibold text-text-primary text-sm">No requirements defined yet</p>
              <p className="text-xs">Click &quot;+ New Requirement&quot; above to create the cohort&apos;s first one.</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Requirement Modal */}
      <Dialog open={showReqModal} onOpenChange={setShowReqModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Requirement Definition</DialogTitle>
          </DialogHeader>

          {errorMsg && (
            <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleReqSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-text-primary mb-1">Requirement Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mid-term Evaluation Form"
                  className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-text-primary mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Instructions for the intern..."
                  className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-text-primary mb-1">Due Date Rule</label>
                  <select
                    value={dueDateType}
                    onChange={(e) => {
                      const nextType = e.target.value as 'fixed' | 'relative';
                      setDueDateType(nextType);
                      setDueDateValue(nextType === 'relative' ? '30' : new Date().toISOString().split('T')[0]);
                    }}
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  >
                    <option value="relative">Relative to Internship Start</option>
                    <option value="fixed">Fixed Calendar Date</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-text-primary mb-1">
                    {dueDateType === 'relative' ? 'Days from Start' : 'Date (YYYY-MM-DD)'}
                  </label>
                  <input
                    type="text"
                    required
                    value={dueDateValue}
                    onChange={(e) => setDueDateValue(e.target.value)}
                    placeholder={dueDateType === 'relative' ? '30' : '2026-12-31'}
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-text-primary mb-1">Routing Template</label>
                  <select
                    value={routingTemplateId}
                    onChange={(e) => setRoutingTemplateId(e.target.value)}
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  >
                    <option value="">Default (Single Supervisor Review)</option>
                    {routingTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} (SLA: {t.sla_days}d)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-text-primary mb-1">Max Size (MB)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={maxSizeMb}
                    onChange={(e) => setMaxSizeMb(Number(e.target.value))}
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-text-primary mb-1">
                    Custom Reminder Threshold (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={customReminderDays}
                    onChange={(e) => setCustomReminderDays(e.target.value)}
                    placeholder="Uses template default"
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    Optional. Overrides the routing template&apos;s SLA for the approver
                    reminder digest only. Leave blank to use the template default.
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-text-primary mb-1.5">Accepted File Types</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedTypes.includes('application/pdf')}
                      onChange={() => handleTypeToggle('application/pdf')}
                      className="rounded border-border-default text-brand-primary focus:ring-brand-primary cursor-pointer"
                    />
                    PDF
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedTypes.includes('image/png')}
                      onChange={() => handleTypeToggle('image/png')}
                      className="rounded border-border-default text-brand-primary focus:ring-brand-primary cursor-pointer"
                    />
                    PNG
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedTypes.includes('image/jpeg')}
                      onChange={() => handleTypeToggle('image/jpeg')}
                      className="rounded border-border-default text-brand-primary focus:ring-brand-primary cursor-pointer"
                    />
                    JPEG
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setShowReqModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Requirement'}
                </Button>
              </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
