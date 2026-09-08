'use client';

import React, { useState, useMemo } from 'react';
import { XIcon } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { DocumentViewerModal } from './DocumentViewerModal';
import { RequirementRecord, SubmissionVersionRecord, ApprovalRecord } from '@lib/data/submissions';
import { SubmissionTimelineModal } from './SubmissionTimelineModal';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ChecklistItem {
  requirement: RequirementRecord;
  submission: unknown;
  state: string;
  dueDate: string | null;
  daysRemaining: number | null;
  isOverdue: boolean;
  activeVersion: SubmissionVersionRecord | null;
  latestApproval: ApprovalRecord | null;
  approvals?: ApprovalRecord[];
  versions: SubmissionVersionRecord[];
  deletionDate?: string | null;
  deletionDaysRemaining?: number | null;
  /** FR-5: who currently holds an In Review item, printed name preferred over email. */
  currentHolderName?: string | null;
}

interface InternChecklistProps {
  items: ChecklistItem[];
  internEmail?: string;
  onUploadAction: (formData: FormData) => Promise<{ success?: boolean; error?: string }>;
  onResubmitAction: (formData: FormData) => Promise<{ success?: boolean; error?: string }>;
  onGetDownloadUrlAction?: (submissionId: string) => Promise<{ signedUrl?: string; error?: string; isVerified?: boolean; fileHash?: string }>;
  /** FR-4: signed download URL for a requirement's optional blank template file. */
  onGetTemplateUrlAction?: (requirementId: string) => Promise<{ signedUrl?: string; error?: string }>;
}

export function InternChecklist({
  items,
  internEmail,
  onUploadAction,
  onResubmitAction,
  onGetDownloadUrlAction,
  onGetTemplateUrlAction,
}: InternChecklistProps) {
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [modalMode, setModalMode] = useState<'upload' | 'resubmit' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [timelineSubId, setTimelineSubId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isExportingApproved, setIsExportingApproved] = useState(false);
  const [exportApprovedError, setExportApprovedError] = useState<string | null>(null);
  const [filterReq, setFilterReq] = useState<string>('ALL');
  const [filterState, setFilterState] = useState<string>('ALL');

  // In-page Document Preview Overlay State
  const [viewerItem, setViewerItem] = useState<{
    item: ChecklistItem | null;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const STATE_OPTIONS = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'NOT_STARTED', label: 'Not Started' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'IN_REVIEW', label: 'In Review' },
    { value: 'RETURNED', label: 'Returned' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'OVERDUE', label: 'Overdue' },
  ];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesReq = filterReq === 'ALL' || item.requirement.id === filterReq;
      const matchesState =
        filterState === 'ALL' ||
        (filterState === 'OVERDUE' ? item.isOverdue : item.state === filterState);
      return matchesReq && matchesState;
    });
  }, [items, filterReq, filterState]);

  const openUploadModal = (item: ChecklistItem) => {
    setSelectedItem(item);
    setModalMode('upload');
    setSelectedFile(null);
    setUploadError(null);
  };

  const openResubmitModal = (item: ChecklistItem) => {
    setSelectedItem(item);
    setModalMode('resubmit');
    setSelectedFile(null);
    setUploadError(null);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setModalMode(null);
    setSelectedFile(null);
    setUploadError(null);
  };

  const handleDownload = async (item: ChecklistItem, isSignedPdf = false) => {
    const sub = item.submission as { id?: string } | null;
    if (!sub?.id || !onGetDownloadUrlAction) return;

    setViewerItem({
      item,
      title: isSignedPdf ? `${item.requirement.name} (Signed PDF)` : item.requirement.name,
      subtitle: isSignedPdf
        ? 'Official Digitally Signed Document'
        : `Version ${item.activeVersion?.version_number || 1} Submission`,
    });
    setViewerUrl(null);
    setIsViewerLoading(true);
    setViewerError(null);

    try {
      const res = await onGetDownloadUrlAction(sub.id);
      if (res.error) throw new Error(res.error);
      if (res.signedUrl) {
        setViewerUrl(res.signedUrl);
      } else {
        throw new Error('No download link available');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load document';
      setViewerError(msg);
    } finally {
      setIsViewerLoading(false);
    }
  };

  const handleDownloadTemplate = async (requirementId: string, reqName: string) => {
    if (!onGetTemplateUrlAction) return;
    setViewerItem({
      item: null,
      title: `${reqName} Template`,
      subtitle: 'Blank Document Template',
    });
    setViewerUrl(null);
    setIsViewerLoading(true);
    setViewerError(null);

    try {
      const res = await onGetTemplateUrlAction(requirementId);
      if (res.error) throw new Error(res.error);
      if (res.signedUrl) {
        setViewerUrl(res.signedUrl);
      } else {
        throw new Error('No template link available');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load template';
      setViewerError(msg);
    } finally {
      setIsViewerLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !selectedFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setIsUploading(true);
    setUploadError(null);

    try {
      let result;
      if (modalMode === 'upload') {
        formData.append('requirement_id', selectedItem.requirement.id);
        result = await onUploadAction(formData);
      } else {
        const sub = selectedItem.submission as { id?: string } | null;
        if (!sub?.id) throw new Error('Submission ID missing');
        formData.append('submission_id', sub.id);
        result = await onResubmitAction(formData);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      closeModal();
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleExportApproved = async () => {
    setIsExportingApproved(true);
    setExportApprovedError(null);
    try {
      const res = await fetch('/api/intern/export-approved');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approved_documents_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setExportApprovedError(msg);
    } finally {
      setIsExportingApproved(false);
    }
  };

  const hasApprovedDocuments = items.some((i) => i.state === 'APPROVED' || i.state === 'COMPLETED');

  return (
    <div className="w-full space-y-6">
      {downloadError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-800 border border-rose-200"
        >
          <span>{downloadError}</span>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            aria-label="Dismiss error"
            className="shrink-0 p-0.5 rounded text-rose-600 hover:text-rose-800"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Profile Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-bg p-6 rounded-xl border border-border-default shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Internship Document Checklist</h2>
          <p className="text-sm text-text-muted mt-1">
            {internEmail ? `Logged in as ${internEmail}` : 'Track your required submission progress.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasApprovedDocuments && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportApproved}
              disabled={isExportingApproved}
              className="border-brand-primary text-brand-primary hover:bg-brand-primary/5 font-semibold"
            >
              {isExportingApproved ? 'Preparing…' : 'Download all approved documents'}
            </Button>
          )}
          <ProgressBar
            completed={items.filter((i) => i.state === 'APPROVED' || i.state === 'COMPLETED').length}
            total={items.length}
          />
        </div>
      </div>
      {exportApprovedError && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-800 border border-rose-200">
          <span>{exportApprovedError}</span>
          <button
            type="button"
            onClick={() => setExportApprovedError(null)}
            aria-label="Dismiss error"
            className="shrink-0 p-0.5 rounded text-rose-600 hover:text-rose-800"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-surface-bg p-3.5 rounded-xl border border-border-default shadow-xs">
        <div className="inline-flex items-center bg-surface-muted border border-border-default rounded-lg px-3 py-1.5 focus-within:ring-1 focus-within:ring-brand-primary focus-within:border-brand-primary transition-all">
          <label htmlFor="checklist-filter-req" className="text-[10px] font-bold text-text-muted uppercase tracking-wider select-none shrink-0 pr-2 border-r border-border-default">
            Requirement
          </label>
          <select
            id="checklist-filter-req"
            value={filterReq}
            onChange={(e) => setFilterReq(e.target.value)}
            className="text-xs bg-transparent pl-2 text-text-primary font-medium focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Requirements</option>
            {items.map((item) => (
              <option key={item.requirement.id} value={item.requirement.id}>
                {item.requirement.name}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-flex items-center bg-surface-muted border border-border-default rounded-lg px-3 py-1.5 focus-within:ring-1 focus-within:ring-brand-primary focus-within:border-brand-primary transition-all">
          <label htmlFor="checklist-filter-state" className="text-[10px] font-bold text-text-muted uppercase tracking-wider select-none shrink-0 pr-2 border-r border-border-default">
            Status
          </label>
          <select
            id="checklist-filter-state"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="text-xs bg-transparent pl-2 text-text-primary font-medium focus:outline-none cursor-pointer"
          >
            {STATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Checklist Grid */}
      <div className="grid gap-4">
        {filteredItems.length === 0 && (
          <div className="bg-surface-bg rounded-xl border border-border-default p-8 text-center text-sm text-text-muted">
            No requirements match the current filters.
          </div>
        )}
        {filteredItems.map((item) => {
          const req = item.requirement;
          const activeVer = item.activeVersion;
          const latestAppr = item.latestApproval;
          const sub = item.submission as { id?: string } | null;

          return (
            <div
              key={req.id}
              className="bg-surface-bg rounded-xl border border-border-default p-5 shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-text-primary">{req.name}</h3>
                    <StatusBadge state={item.state} isOverdue={item.isOverdue} />
                    {item.state === 'IN_REVIEW' && item.currentHolderName && (
                      <span className="text-[11px] text-text-muted">
                        with <span className="font-semibold text-text-primary">{item.currentHolderName}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted line-clamp-2">{req.description}</p>
                </div>

                {/* Right Action / Details */}
                <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0 flex-wrap sm:flex-nowrap">
                  {req.template_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadTemplate(req.id, req.name)}
                      className="border-border-default text-text-muted hover:text-text-primary hover:bg-surface-hover font-medium text-xs shadow-none"
                    >
                      Download Template
                    </Button>
                  )}

                  {item.state === 'NOT_STARTED' && (
                    <Button size="sm" onClick={() => openUploadModal(item)}>
                      Upload File
                    </Button>
                  )}

                  {item.state === 'RETURNED' && (
                    <Button size="sm" onClick={() => openResubmitModal(item)}>
                      Re-upload Revision
                    </Button>
                  )}

                  {item.state === 'APPROVED' && sub?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(item, true)}
                      className="border-status-approved/30 bg-status-approved/10 text-emerald-800 hover:bg-status-approved/20"
                    >
                      <svg className="h-3.5 w-3.5 text-status-approved" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Download Signed PDF
                    </Button>
                  )}

                  {['SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED'].includes(item.state) && sub?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTimelineSubId(sub.id!)}
                      className="border-border-default text-text-muted hover:text-text-primary hover:bg-surface-hover font-medium text-xs shadow-none"
                    >
                      Timeline
                    </Button>
                  )}
                  {['SUBMITTED', 'IN_REVIEW'].includes(item.state) && sub?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(item, false)}
                      className="border-border-default text-text-muted hover:text-text-primary hover:bg-surface-hover font-medium text-xs shadow-none"
                    >
                      View Submitted
                    </Button>
                  )}
                </div>
              </div>

              {/* Due Date, SLA & Signatories Metadata */}
              <div className="mt-4 pt-3 border-t border-border-default space-y-2 text-xs text-text-muted">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      <strong>Due:</strong>{' '}
                      {item.dueDate ? new Date(item.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Flexible'}
                    </span>
                    {item.daysRemaining !== null && item.state !== 'APPROVED' && item.state !== 'COMPLETED' && (
                      <span
                        className={
                          item.daysRemaining < 0 || item.isOverdue
                            ? 'text-red-600 font-bold'
                            : item.daysRemaining <= 3
                            ? 'text-brand-accent font-semibold'
                            : 'text-text-muted'
                        }
                      >
                        ({item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)} days overdue` : `${item.daysRemaining} days remaining`})
                      </span>
                    )}
                    {activeVer && (
                      <span className="font-mono font-semibold text-[11px] text-text-muted">
                        Version {activeVer.version_number}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px]">
                      Accepts: {req.accepted_types.map((t) => t.replace('image/', '').replace('application/', '.')).join(', ')} (Max {req.max_size_mb} MB)
                    </span>
                  </div>
                </div>

                {/* Workflow / Required Signatories */}
                <div className="pt-1.5 border-t border-border-default/60 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <span className="text-slate-600">
                    Template: <strong className="text-text-primary">{req.routing_templates?.name || 'Default Workflow'}</strong>
                  </span>
                  <span className="font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    Required Signatories: {req.routing_templates?.steps && req.routing_templates.steps.length > 0
                      ? req.routing_templates.steps.map((s) => (s.role === 'admin' ? 'Admin' : 'Supervisor')).join(' → ')
                      : 'Supervisor (1-Step)'}
                  </span>
                </div>
              </div>

              {/* Return Comment Alert Box */}
              {item.state === 'RETURNED' && activeVer?.return_comment && (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs border border-red-200 text-red-900">
                  <div className="flex items-center gap-1.5 font-bold mb-1 text-red-800">
                    <svg className="h-3.5 w-3.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Supervisor Return Feedback (v{activeVer.version_number}):</span>
                  </div>
                  <p className="pl-5 italic text-red-950">&ldquo;{activeVer.return_comment}&rdquo;</p>
                </div>
              )}

              {/* Approved Attestation Banner with Signed By Information */}
              {item.state === 'APPROVED' && latestAppr && (
                <div className="mt-3 rounded-xl bg-emerald-50/90 p-3 text-xs border border-emerald-200 text-emerald-950 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Digitally Signed & Approved
                      </span>
                      <span className="text-emerald-700 text-[11px]">
                        on {new Date(latestAppr.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Sealed & Verified
                    </span>
                  </div>

                  {/* Signatures List */}
                  <div className="pt-1.5 border-t border-emerald-200/60 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-semibold text-emerald-950">Signed by:</span>
                    {item.approvals && item.approvals.length > 0 ? (
                      item.approvals.map((appr, idx) => (
                        <span key={appr.id || idx} className="inline-flex items-center gap-1.5 bg-white/95 px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs font-mono text-[11px] text-emerald-900">
                          <span className="font-sans font-semibold text-emerald-800">
                            {appr.step ? `Step ${appr.step}:` : `Step ${idx + 1}:`}
                          </span>
                          <span>{appr.users?.full_name || appr.users?.email || (appr.step === 2 ? 'admin@makerspace.com' : 'supervisor@makerspace.com')}</span>
                        </span>
                      ))
                    ) : (
                      <span className="font-mono text-emerald-900">{latestAppr.users?.full_name || latestAppr.users?.email || 'Authorized Signatory'}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Deletion Countdown Banner -- escalates at 7 and 1 days, matching the FR-17 email warnings */}
              {item.deletionDaysRemaining !== undefined && item.deletionDaysRemaining !== null && item.deletionDaysRemaining < 14 && item.state !== 'PURGED' && activeVer && (() => {
                const days = item.deletionDaysRemaining!;
                const critical = days <= 1;
                const urgent = days <= 7;
                const tone = critical
                  ? 'bg-red-100 border-red-300 text-red-950'
                  : urgent
                  ? 'bg-amber-100 border-amber-300 text-amber-950'
                  : 'bg-amber-50 border-amber-200 text-amber-900';
                const iconTone = critical ? 'text-red-600' : 'text-amber-600';
                return (
                  <div role="alert" className={`mt-3 rounded-lg p-2.5 text-xs border flex items-center gap-2 ${tone} ${critical ? 'font-semibold' : ''}`}>
                    <svg className={`h-4 w-4 shrink-0 ${iconTone} ${critical ? 'motion-safe:animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <strong>{critical ? 'Final Warning:' : 'Data Retention Warning:'}</strong> This document will be permanently deleted from storage in {days} {days === 1 ? 'day' : 'days'} (on {new Date(item.deletionDate!).toLocaleDateString()}) per retention policy. Please download a copy for your records if needed.
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Upload / Re-upload Modal */}
      <Dialog open={!!selectedItem && !!modalMode} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {modalMode === 'upload' ? `Submit ${selectedItem.requirement.name}` : `Re-upload Revision for ${selectedItem.requirement.name}`}
                </DialogTitle>
                <p className="text-xs text-text-muted">
                  Select your document to submit. Accepted formats: {selectedItem.requirement.accepted_types.join(', ')} (Max {selectedItem.requirement.max_size_mb} MB).
                </p>
              </DialogHeader>

              {uploadError && (
                <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
                  {uploadError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="border-2 border-dashed border-border-default hover:border-brand-primary rounded-xl p-6 text-center cursor-pointer transition-colors bg-surface-muted">
                  <input
                    type="file"
                    id="file-upload"
                    onChange={handleFileChange}
                    accept={selectedItem.requirement.accepted_types.join(',')}
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                    <svg className="h-10 w-10 text-text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-xs font-semibold text-text-primary">
                      {selectedFile ? selectedFile.name : 'Click to browse or drag file here'}
                    </span>
                    <span className="text-[11px] text-text-muted mt-1">
                      {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : `PDF, PNG, or JPEG up to ${selectedItem.requirement.max_size_mb} MB`}
                    </span>
                  </label>
                </div>

                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={closeModal} disabled={isUploading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUploading || !selectedFile}>
                    {isUploading ? 'Uploading & Sealing...' : 'Upload & Submit'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Timeline Modal */}
      {timelineSubId && (
        <SubmissionTimelineModal
          submissionId={timelineSubId}
          onClose={() => setTimelineSubId(null)}
        />
      )}

      {/* Document Viewer Modal */}
      {viewerItem && (
        <DocumentViewerModal
          open={!!viewerItem}
          onOpenChange={(open) => !open && setViewerItem(null)}
          title={viewerItem.title}
          subtitle={viewerItem.subtitle}
          fileUrl={viewerUrl}
          isLoadingFile={isViewerLoading}
          error={viewerError}
          downloadFileName={`${viewerItem.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`}
          metadata={
            viewerItem.item
              ? {
                  internEmail: internEmail,
                  versionNumber: viewerItem.item.activeVersion?.version_number,
                  statusBadge: (
                    <StatusBadge
                      state={viewerItem.item.state}
                      isOverdue={viewerItem.item.isOverdue}
                    />
                  ),
                  templateName: viewerItem.item.requirement.routing_templates?.name,
                  returnComment: viewerItem.item.activeVersion?.return_comment || undefined,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
