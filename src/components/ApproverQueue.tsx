'use client';

// Force client chunk cache invalidation
import React, { useState, useMemo } from 'react';
import { XIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { DocumentViewerModal } from './DocumentViewerModal';
import { DocumentPreview } from './DocumentPreview';
import { RequirementRecord, SubmissionVersionRecord } from '@lib/data/submissions';
import Link from 'next/link';
import { SubmissionTimelineModal } from './SubmissionTimelineModal';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ApproverQueueItem {
  id: string;
  requirement_id: string;
  intern_id: string;
  state: string;
  current_step: number;
  current_holder_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  isOverdue: boolean;
  waitingHours: number;
  users?: { id: string; email: string; full_name?: string | null; school?: string | null; batch?: string | null };
  requirements?: RequirementRecord | null;
  routing_snapshot?: { sla_days?: number } | null;
  activeVersion: SubmissionVersionRecord | null;
  totalSteps?: number;
  stepRole?: string;
  canUserApprove?: boolean;
  disabledReason?: string | null;
}

// FR-19 default SLA target is 2 working days; colors the wait-time text itself so urgency
// is visible without opening the row -- neutral under target, amber approaching it, crimson
// at/past it.
function waitTimeToneClass(waitingHours: number, slaDays: number): string {
  const targetHours = slaDays * 24;
  if (waitingHours >= targetHours) return 'text-red-700 font-bold';
  if (waitingHours >= targetHours * 0.7) return 'text-amber-600 font-semibold';
  return 'text-text-muted';
}

function getRowStatusEdgeClass(sub: ApproverQueueItem, slaDays: number): string {
  const targetHours = slaDays * 24;
  if (sub.isOverdue || sub.state === 'OVERDUE' || sub.waitingHours >= targetHours) {
    return 'border-l-4 border-l-red-500'; // red = overdue
  }
  if (sub.waitingHours >= targetHours * 0.7) {
    return 'border-l-4 border-l-amber-500'; // amber = pending-soon
  }
  return 'border-l-4 border-l-slate-300'; // gray/neutral = on-track
}

export interface ApproverUser {
  id: string;
  email: string;
  role: string;
}

interface ApproverQueueProps {
  items: ApproverQueueItem[];
  approverEmail?: string;
  hasSignature: boolean;
  signaturePreviewUrl?: string | null;
  approversList?: ApproverUser[];
  /** FR-15 / Appendix A: only Administrators may reassign a step. */
  canReassign?: boolean;
  /** Hides the internal "Approver Review Queue" heading/subheading -- set when the page embedding this component already renders its own heading (e.g. Final Approval Queue). */
  hideHeader?: boolean;
  onApproveAction: (submissionId: string) => Promise<{ success?: boolean; error?: string; final?: boolean; signedUrl?: string | null }>;
  onReturnAction: (submissionId: string, comment: string) => Promise<{ success?: boolean; error?: string }>;
  onReassignAction: (submissionId: string, newApproverId: string, reason: string) => Promise<{ success?: boolean; error?: string }>;
  onGetDownloadUrlAction: (submissionId: string) => Promise<{ signedUrl?: string; error?: string; isVerified?: boolean; fileHash?: string }>;
}

export function ApproverQueue({
  items,
  approverEmail,
  hasSignature,
  signaturePreviewUrl,
  approversList = [],
  canReassign = false,
  hideHeader = false,
  onApproveAction,
  onReturnAction,
  onReassignAction,
  onGetDownloadUrlAction,
}: ApproverQueueProps) {
  const [selectedSub, setSelectedSub] = useState<ApproverQueueItem | null>(null);
  const [modalType, setModalType] = useState<'approve' | 'return' | 'reassign' | null>(null);
  const [returnComment, setReturnComment] = useState('');
  const [reassignApproverId, setReassignApproverId] = useState(approversList[0]?.id || '');
  const [reassignReason, setReassignReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [timelineSubId, setTimelineSubId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [filterSchool, setFilterSchool] = useState<string>('ALL');
  const [filterBatch, setFilterBatch] = useState<string>('ALL');

  // In-page Document Review Overlay State
  const [viewerSub, setViewerSub] = useState<ApproverQueueItem | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [activeSigPreview, setActiveSigPreview] = useState(signaturePreviewUrl);
  const [activeHasSig, setActiveHasSig] = useState(hasSignature);

  // Inline expand-in-row preview state (accordion -- one row at a time).
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [isExpandedLoading, setIsExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  React.useEffect(() => {
    setActiveSigPreview(signaturePreviewUrl);
    setActiveHasSig(hasSignature);
  }, [signaturePreviewUrl, hasSignature]);

  const schoolOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.users?.school).filter((s): s is string => !!s))).sort(),
    [items]
  );
  const batchOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.users?.batch).filter((b): b is string => !!b))).sort(),
    [items]
  );

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      const matchesSchool = filterSchool === 'ALL' || i.users?.school === filterSchool;
      const matchesBatch = filterBatch === 'ALL' || i.users?.batch === filterBatch;
      return matchesSchool && matchesBatch;
    });
  }, [items, filterSchool, filterBatch]);

  const openApproveModal = (sub: ApproverQueueItem) => {
    setSelectedSub(sub);
    setModalType('approve');
    setActionError(null);
  };

  const openReturnModal = (sub: ApproverQueueItem) => {
    setSelectedSub(sub);
    setModalType('return');
    setReturnComment('');
    setActionError(null);
  };

  const openReassignModal = (sub: ApproverQueueItem) => {
    setSelectedSub(sub);
    setModalType('reassign');
    setReassignReason('');
    setReassignApproverId(approversList.find((a) => a.id !== sub.current_holder_id)?.id || approversList[0]?.id || '');
    setActionError(null);
  };

  const closeModal = () => {
    setSelectedSub(null);
    setViewerSub(null);
    setModalType(null);
    setReturnComment('');
    setReassignReason('');
    setActionError(null);
  };

  const openViewerModal = async (sub: ApproverQueueItem) => {
    setViewerSub(sub);
    setSelectedSub(sub);
    setViewerUrl(null);
    setIsViewerLoading(true);
    setViewerError(null);
    setActionError(null);

    try {
      const res = await onGetDownloadUrlAction(sub.id);
      if (res.error) throw new Error(res.error);
      if (res.signedUrl) {
        setViewerUrl(res.signedUrl);
      } else {
        throw new Error('No document preview link available');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load document preview';
      setViewerError(msg);
    } finally {
      setIsViewerLoading(false);
    }
  };

  const toggleExpandRow = async (sub: ApproverQueueItem) => {
    if (expandedSubmissionId === sub.id) {
      setExpandedSubmissionId(null);
      setExpandedUrl(null);
      setExpandedError(null);
      return;
    }

    setExpandedSubmissionId(sub.id);
    setExpandedUrl(null);
    setExpandedError(null);
    setIsExpandedLoading(true);

    try {
      const res = await onGetDownloadUrlAction(sub.id);
      if (res.error) throw new Error(res.error);
      if (res.signedUrl) {
        setExpandedUrl(res.signedUrl);
      } else {
        throw new Error('No document preview link available');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load document preview';
      setExpandedError(msg);
    } finally {
      setIsExpandedLoading(false);
    }
  };

  const handleModalApprove = async () => {
    if (!viewerSub) return;
    if (!hasSignature) {
      setActionError('You must enroll a signature before you can approve.');
      return;
    }
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await onApproveAction(viewerSub.id);
      if (res.error) throw new Error(res.error);
      setViewerSub(null);
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Approval failed.';
      setActionError(msg);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalReturn = async (comment: string) => {
    if (!viewerSub) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await onReturnAction(viewerSub.id, comment);
      if (res.error) throw new Error(res.error);
      setViewerSub(null);
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Return failed.';
      setActionError(msg);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalReassign = async (newApproverId: string, reason: string) => {
    if (!viewerSub || !onReassignAction) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await onReassignAction(viewerSub.id, newApproverId, reason);
      if (res.error) throw new Error(res.error);
      setViewerSub(null);
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Reassignment failed.';
      setActionError(msg);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async (sub: ApproverQueueItem) => {
    openViewerModal(sub);
  };

  const handleConfirmApprove = async () => {
    if (!selectedSub) return;
    if (!activeHasSig) {
      setActionError('You must enroll a signature before you can approve.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await onApproveAction(selectedSub.id);
      if (res.error) throw new Error(res.error);
      closeModal();
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Approval failed.';
      setActionError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!selectedSub) return;
    if (returnComment.trim().length < 10) {
      setActionError('Return comment must be at least 10 characters long.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await onReturnAction(selectedSub.id, returnComment);
      if (res.error) throw new Error(res.error);
      closeModal();
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Return failed.';
      setActionError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!selectedSub) return;
    if (!reassignApproverId) {
      setActionError('Please select a target approver.');
      return;
    }
    if (reassignReason.trim().length < 10) {
      setActionError('Reassignment reason must be at least 10 characters long.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await onReassignAction(selectedSub.id, reassignApproverId, reassignReason);
      if (res.error) throw new Error(res.error);
      closeModal();
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Reassignment failed.';
      setActionError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

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

      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-bg p-6 rounded-xl border border-border-default shadow-xs">
        {!hideHeader && (
          <div>
            <h2 className="text-xl font-bold text-text-primary">Approver Review Queue</h2>
            <p className="text-sm text-text-muted mt-1">
              {approverEmail ? `Logged in as ${approverEmail}` : 'Submissions pending your review.'}
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 ml-auto">
          {(schoolOptions.length > 0 || batchOptions.length > 0) && (
            <div className="flex items-end gap-2">
              {schoolOptions.length > 0 && (
                <div>
                  <label htmlFor="queue-filter-school" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">School</label>
                  <select
                    id="queue-filter-school"
                    value={filterSchool}
                    onChange={(e) => setFilterSchool(e.target.value)}
                    className="text-xs p-1.5 rounded border border-border-default bg-surface-muted"
                  >
                    <option value="ALL">All Schools</option>
                    {schoolOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {batchOptions.length > 0 && (
                <div>
                  <label htmlFor="queue-filter-batch" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Batch</label>
                  <select
                    id="queue-filter-batch"
                    value={filterBatch}
                    onChange={(e) => setFilterBatch(e.target.value)}
                    className="text-xs p-1.5 rounded border border-border-default bg-surface-muted"
                  >
                    <option value="ALL">All Batches</option>
                    {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="text-right flex flex-col items-end gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Pending Review</span>
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-accent text-white shadow-xs">
              {filteredItems.length}{filteredItems.length !== items.length ? ` / ${items.length}` : ''}
            </span>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="bg-surface-bg rounded-xl border border-border-default p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-base font-semibold text-text-primary">
            {items.length === 0 ? 'All caught up!' : 'No matches for this filter'}
          </h3>
          <p className="text-sm text-text-muted mt-1">
            {items.length === 0
              ? 'There are no submissions currently awaiting your review.'
              : 'No pending submissions match the selected school/batch. Try clearing the filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface-bg rounded-xl border border-border-default shadow-xs overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Submission review queue">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-primary/[0.06] border-b border-border-default text-xs uppercase font-semibold text-text-muted">
                <tr>
                  <th className="px-6 py-4">Intern / Submitter</th>
                  <th className="px-6 py-4">Requirement</th>
                  <th className="px-6 py-4">Version</th>
                  <th className="px-6 py-4">Wait Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {filteredItems.map((sub) => {
                  const activeVer = sub.activeVersion;
                  const slaDays = sub.routing_snapshot?.sla_days ?? sub.requirements?.routing_templates?.sla_days ?? 2;
                  const waitToneClass = waitTimeToneClass(sub.waitingHours, slaDays);
                  const rowEdgeClass = getRowStatusEdgeClass(sub, slaDays);
                  return (
                    <React.Fragment key={sub.id}>
                    <tr className="hover:bg-surface-hover transition-colors align-top">
                      <td className={`px-6 py-4 font-medium text-text-primary align-top ${rowEdgeClass}`}>
                        {sub.users?.full_name || sub.users?.email || 'Unknown'}
                        {(sub.users?.school || sub.users?.batch) && (
                          <div className="text-[10px] font-normal text-text-muted">
                            {[sub.users?.school, sub.users?.batch].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-text-primary align-top">
                        <div className="font-semibold">{sub.requirements?.name}</div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span className="text-xs font-mono font-semibold text-text-muted">
                          v{activeVer?.version_number || 1}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-xs align-top ${waitToneClass}`}>
                        {sub.waitingHours < 24 ? (
                          <span>{sub.waitingHours} hours ago</span>
                        ) : (
                          <span>{Math.floor(sub.waitingHours / 24)} days ago</span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="space-y-1">
                          <StatusBadge state={sub.state} isOverdue={sub.isOverdue} />
                          {sub.totalSteps && sub.totalSteps > 1 && (
                            <span className="block text-[10px] font-mono font-bold text-slate-500">
                              Step {sub.current_step} of {sub.totalSteps} ({sub.stepRole === 'admin' ? 'Admin Review' : 'Supervisor'})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap align-top">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleExpandRow(sub)}
                          title={expandedSubmissionId === sub.id ? 'Collapse preview' : 'Expand preview'}
                          aria-expanded={expandedSubmissionId === sub.id}
                          className="text-text-muted hover:text-text-primary px-1.5"
                        >
                          {expandedSubmissionId === sub.id ? (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openViewerModal(sub)}
                          title="View Document in Overlay"
                          className="text-brand-primary/80 hover:text-brand-primary hover:underline font-medium"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTimelineSubId(sub.id)}
                          title="View timeline history"
                          className="text-brand-primary/80 hover:text-brand-primary hover:underline font-medium"
                        >
                          Timeline
                        </Button>
                        {canReassign && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openReassignModal(sub)}
                            disabled={sub.canUserApprove === false && sub.stepRole === 'admin'}
                            title="Reassign to another approver"
                            className="text-brand-primary/80 hover:text-brand-primary hover:underline font-medium"
                          >
                            Reassign
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReturnModal(sub)}
                          disabled={sub.canUserApprove === false && sub.stepRole === 'admin'}
                          className="border-border-default bg-transparent text-text-primary hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50/50 transition-colors"
                        >
                          Return
                        </Button>
                        {sub.canUserApprove === false ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                            title={sub.disabledReason || 'Awaiting Admin Final Approval'}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            {sub.disabledReason || 'Awaiting Admin Approval'}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="success"
                            onClick={() => openApproveModal(sub)}
                            className="shadow-xs hover:bg-emerald-800 hover:shadow-md hover:shadow-brand-primary/20 focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {sub.totalSteps && sub.totalSteps > 1 && sub.current_step === 1 ? 'Approve Step 1' : 'Sign & Approve'}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expandedSubmissionId === sub.id && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-surface-muted/40 border-t border-border-default">
                          <div className="space-y-2">
                            <DocumentPreview
                              fileUrl={expandedUrl}
                              isLoadingFile={isExpandedLoading}
                              error={expandedError}
                              title={sub.requirements?.name || 'Requirement Document'}
                              className="w-full h-[420px] bg-slate-100 p-1 sm:p-2 overflow-hidden flex items-center justify-center relative rounded-lg"
                            />
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openViewerModal(sub)}
                                className="text-brand-primary/80 hover:text-brand-primary hover:underline font-medium text-xs"
                              >
                                Expand full screen
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sign & Approve Confirmation Dialog with Signature Preview */}
      <Dialog open={!!selectedSub && modalType === 'approve'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <DialogTitle>Sign & Approve Submission</DialogTitle>
            </div>
          </DialogHeader>

          {selectedSub && (
            <>
              <p className="text-xs text-text-muted -mt-2">
                Applying your digital signature stamp to{' '}
                <strong className="text-text-primary">{selectedSub.users?.full_name || selectedSub.users?.email}</strong>&apos;s submission.
              </p>

              <div className="p-3 bg-surface-muted rounded-xl text-xs space-y-1.5 text-text-muted border border-border-default">
                <div><strong>Requirement:</strong> {selectedSub.requirements?.name}</div>
                <div><strong>Version:</strong> Version {selectedSub.activeVersion?.version_number}</div>
              </div>

              {/* Signature Stamp Preview */}
              <div className="border border-dashed border-border-strong rounded-xl p-3.5 bg-surface-muted">
                <span className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                  Your Signature Stamp to be Applied:
                </span>
                {activeHasSig && activeSigPreview ? (
                  <div className="h-20 flex items-center justify-center bg-white rounded-lg border border-border-default p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeSigPreview}
                      alt="Your Enrolled Signature"
                      className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-center py-3 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>No signature enrolled.</span>
                    <Link href="/approver/signature" className="font-bold underline text-amber-900">
                      Enroll signature first
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}

          {actionError && (
            <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
              {actionError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeModal} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              onClick={handleConfirmApprove}
              disabled={isProcessing || !activeHasSig}
            >
              {isProcessing ? 'Compositing & Stamping...' : 'Confirm & Apply Signature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog with Mandatory Comment (>= 10 chars) */}
      <Dialog open={!!selectedSub && modalType === 'return'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Submission for Revision</DialogTitle>
            <p className="text-xs text-text-muted">
              Explain why this document is being returned to the intern. A clear explanation is required so they know what to correct.
            </p>
          </DialogHeader>

          {actionError && (
            <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
              {actionError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="return-comment" className="block text-xs font-semibold text-text-primary">
              Return Comment (Minimum 10 characters):
            </label>
            <textarea
              id="return-comment"
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
              placeholder="e.g. Missing mentor signature on page 2. Please have it signed and re-upload."
              rows={4}
              aria-describedby="return-comment-count"
              className="w-full rounded-lg border border-border-default p-3 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
            <div id="return-comment-count" className="text-right text-[10px] text-text-muted">
              {returnComment.trim().length} / 10 characters minimum
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeModal} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmReturn}
              disabled={isProcessing || returnComment.trim().length < 10}
            >
              {isProcessing ? 'Returning Document...' : 'Return Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approver Reassignment Dialog (FR-15, Administrator-only) */}
      <Dialog open={!!selectedSub && modalType === 'reassign'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Approver</DialogTitle>
            <p className="text-xs text-text-muted">
              Transfer this submission to a different approver. A mandatory reason is required and will be audit-logged.
            </p>
          </DialogHeader>

          {actionError && (
            <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
              {actionError}
            </div>
          )}

          <div className="space-y-3.5">
            <div>
              <label htmlFor="reassign-target" className="block text-xs font-semibold text-text-primary mb-1">
                Assign To:
              </label>
              <select
                id="reassign-target"
                value={reassignApproverId}
                onChange={(e) => setReassignApproverId(e.target.value)}
                className="w-full rounded-lg border border-border-default p-2 text-xs text-text-primary focus:border-brand-primary outline-none"
              >
                {approversList
                  .filter((a) => a.email !== approverEmail)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email} ({a.role})
                    </option>
                  ))}
              </select>
              {approversList.filter((a) => a.email !== approverEmail).length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  No other approver accounts found. Add another approver in Admin &gt; Users.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="reassign-reason" className="block text-xs font-semibold text-text-primary mb-1">
                Reason for Reassignment (Min 10 characters):
              </label>
              <textarea
                id="reassign-reason"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="e.g. Primary supervisor on official leave; reassigning to alternate approver."
                rows={3}
                aria-describedby="reassign-reason-count"
                className="w-full rounded-lg border border-border-default p-2 text-xs text-text-primary focus:border-brand-primary outline-none"
              />
              <div id="reassign-reason-count" className="text-right text-[10px] text-text-muted">
                {reassignReason.trim().length} / 10 characters minimum
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeModal} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReassign}
              disabled={isProcessing || reassignReason.trim().length < 10}
            >
              {isProcessing ? 'Reassigning...' : 'Confirm Reassignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timeline Modal */}
      {timelineSubId && (
        <SubmissionTimelineModal
          submissionId={timelineSubId}
          onClose={() => setTimelineSubId(null)}
        />
      )}

      {/* In-Page Document Review & Sign Overlay */}
      {viewerSub && (
        <DocumentViewerModal
          open={!!viewerSub}
          onOpenChange={(open) => {
            if (!open) {
              setViewerSub(null);
              setViewerUrl(null);
              setActionError(null);
            }
          }}
          title={viewerSub.requirements?.name || 'Requirement Document'}
          subtitle={`Submitted by ${viewerSub.users?.full_name || viewerSub.users?.email || 'Intern'}`}
          fileUrl={viewerUrl}
          isLoadingFile={isViewerLoading}
          error={viewerError}
          downloadFileName={`${(viewerSub.requirements?.name || 'document').toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`}
          canReview={viewerSub.canUserApprove !== false}
          hasSignature={activeHasSig}
          signaturePreviewUrl={activeSigPreview}
          onSignatureUpdated={(newUrl) => {
            setActiveSigPreview(newUrl);
            setActiveHasSig(true);
          }}
          signatureEnrollUrl="/approver/signature"
          isProcessingReview={isProcessing}
          onApprove={viewerSub.canUserApprove !== false ? handleModalApprove : undefined}
          onReturn={handleModalReturn}
          canReassign={canReassign}
          approversList={approversList}
          currentApproverEmail={approverEmail}
          onReassign={canReassign ? handleModalReassign : undefined}
          metadata={{
            internEmail: viewerSub.users?.email,
            submittedAt: viewerSub.created_at,
            versionNumber: viewerSub.activeVersion?.version_number,
            statusBadge: (
              <StatusBadge state={viewerSub.state} isOverdue={viewerSub.isOverdue} />
            ),
            templateName: viewerSub.routing_snapshot ? 'Custom Routing' : 'Default Workflow',
            stepInfo:
              viewerSub.totalSteps && viewerSub.totalSteps > 1
                ? `Step ${viewerSub.current_step} of ${viewerSub.totalSteps} (${
                    viewerSub.stepRole === 'admin' ? 'Admin Review' : 'Supervisor'
                  })`
                : '1-Step Review',
            returnComment: viewerSub.activeVersion?.return_comment || undefined,
          }}
        />
      )}
    </div>
  );
}
