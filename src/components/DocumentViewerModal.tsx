'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Undo2,
  UserCheck,
  Download,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/SignaturePad';
import { enrollSignatureAction } from '@/app/actions/signatures';

export interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  fileUrl: string | null;
  isLoadingFile?: boolean;
  error?: string | null;
  downloadFileName?: string;
  onDownload?: () => void;

  // Review & Signing Capabilities (Approvers / Admins)
  canReview?: boolean;
  hasSignature?: boolean;
  signaturePreviewUrl?: string | null;
  signatureEnrollUrl?: string;
  isProcessingReview?: boolean;
  onApprove?: () => Promise<void> | void;
  onReturn?: (comment: string) => Promise<void> | void;
  onSignatureUpdated?: (newPreviewUrl: string) => void;

  // Admin Reassignment
  canReassign?: boolean;
  approversList?: Array<{ id: string; email: string; role: string }>;
  currentApproverEmail?: string;
  onReassign?: (newApproverId: string, reason: string) => Promise<void> | void;

  // Metadata Display
  metadata?: {
    internEmail?: string | null;
    submittedAt?: string;
    versionNumber?: number;
    statusBadge?: React.ReactNode;
    templateName?: string;
    stepInfo?: string;
    currentHolderName?: string;
    returnComment?: string;
  };
}

export function DocumentViewerModal({
  open,
  onOpenChange,
  title,
  subtitle,
  fileUrl,
  isLoadingFile = false,
  error = null,
  downloadFileName,
  onDownload,
  canReview = false,
  hasSignature = true,
  signaturePreviewUrl,
  signatureEnrollUrl = '/approver/signature',
  isProcessingReview = false,
  onApprove,
  onReturn,
  onSignatureUpdated,
  canReassign = false,
  approversList = [],
  currentApproverEmail,
  onReassign,
  metadata,
}: DocumentViewerModalProps) {
  const [activeReviewAction, setActiveReviewAction] = useState<'none' | 'return' | 'reassign'>('none');
  const [isEditingSignature, setIsEditingSignature] = useState(false);
  const [currentSignaturePreview, setCurrentSignaturePreview] = useState<string | null | undefined>(signaturePreviewUrl);
  const [currentHasSignature, setCurrentHasSignature] = useState(hasSignature);
  const [returnComment, setReturnComment] = useState('');
  const [reassignApproverId, setReassignApproverId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    setCurrentSignaturePreview(signaturePreviewUrl);
    setCurrentHasSignature(hasSignature);
  }, [signaturePreviewUrl, hasSignature]);

  const isImage = Boolean(
    fileUrl &&
      (/\.(jpeg|jpg|png|webp|gif)(\?|$)/i.test(fileUrl) ||
        fileUrl.includes('image/') ||
        fileUrl.includes('image%2F'))
  );

  const handleDownloadClick = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (fileUrl) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = downloadFileName || 'document.pdf';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleConfirmApprove = async () => {
    if (!onApprove) return;
    if (!hasSignature) {
      setActionError('You must enroll a signature before you can approve.');
      return;
    }
    setActionError(null);
    try {
      await onApprove();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed.';
      setActionError(msg);
    }
  };

  const handleConfirmReturn = async () => {
    if (!onReturn) return;
    if (returnComment.trim().length < 10) {
      setActionError('Return comment must be at least 10 characters long.');
      return;
    }
    setActionError(null);
    try {
      await onReturn(returnComment);
      setActiveReviewAction('none');
      setReturnComment('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Return failed.';
      setActionError(msg);
    }
  };

  const handleConfirmReassign = async () => {
    if (!onReassign) return;
    const targetApprover =
      reassignApproverId || approversList.find((a) => a.email !== currentApproverEmail)?.id || '';
    if (!targetApprover) {
      setActionError('Please select a target approver.');
      return;
    }
    if (reassignReason.trim().length < 10) {
      setActionError('Reassignment reason must be at least 10 characters long.');
      return;
    }
    setActionError(null);
    try {
      await onReassign(targetApprover, reassignReason);
      setActiveReviewAction('none');
      setReassignReason('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reassignment failed.';
      setActionError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[98vw] !max-w-[1600px] h-[96vh] !max-h-[96vh] p-0 flex flex-col overflow-hidden bg-surface-bg border-border-default shadow-2xl rounded-2xl"
        showCloseButton={true}
      >
        {/* Top Header Bar */}
        <DialogHeader className="px-6 py-3.5 border-b border-border-default flex-row items-center justify-between shrink-0 bg-surface-muted gap-4">
          <div className="flex items-center gap-3 min-w-0 pr-6">
            <div className="h-9 w-9 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-bold text-text-primary truncate">
                  {title}
                </DialogTitle>
                {metadata?.versionNumber !== undefined && (
                  <span className="font-mono text-[11px] font-semibold text-text-muted bg-surface-bg border border-border-default px-2 py-0.5 rounded">
                    v{metadata.versionNumber}
                  </span>
                )}
                {metadata?.statusBadge}
              </div>
              {subtitle && <p className="text-xs text-text-muted truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 mr-8">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border-default text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Open file in separate tab fallback"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="sr-only">Open in New Tab</span>
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Modal Main Body */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
          {/* Left Canvas: Document Previewer */}
          <div className="flex-1 h-full min-h-[360px] bg-slate-100 p-1 sm:p-2 overflow-hidden flex items-center justify-center relative">
            {isLoadingFile ? (
              <div className="flex flex-col items-center gap-2 text-text-muted">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                <span className="text-xs font-medium">Generating secure document preview…</span>
              </div>
            ) : error ? (
              <div
                role="alert"
                className="max-w-md p-6 bg-surface-bg rounded-xl border border-rose-200 text-center space-y-3"
              >
                <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
                <h4 className="text-sm font-bold text-rose-900">Preview Unavailable</h4>
                <p className="text-xs text-rose-700">{error}</p>
                {fileUrl && (
                  <Button size="sm" onClick={handleDownloadClick} className="mt-2 gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download File Instead
                  </Button>
                )}
              </div>
            ) : fileUrl ? (
              isImage ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
                  <img
                    src={fileUrl}
                    alt={title}
                    className="max-h-full max-w-full object-contain rounded shadow-xs bg-white"
                  />
                </div>
              ) : (
                <iframe
                  src={fileUrl}
                  title={title}
                  className="w-full h-full rounded-lg border border-border-default bg-white shadow-xs"
                />
              )
            ) : (
              <div className="text-xs text-text-muted text-center p-6">
                No document file available to preview.
              </div>
            )}
          </div>

          {/* Right Panel: Review & Sign Sidebar (for Approvers / Admins) */}
          {canReview && (
            <div className="w-full lg:w-[380px] bg-surface-bg border-t lg:border-t-0 lg:border-l border-border-default flex flex-col overflow-y-auto shrink-0">
              <div className="p-5 space-y-4 flex-1">
                {/* Submission Details Box */}
                <div className="bg-surface-muted rounded-xl p-3.5 border border-border-default space-y-2 text-xs">
                  <h4 className="font-bold text-text-primary uppercase tracking-wider text-[10px]">
                    Submission Details
                  </h4>
                  {metadata?.internEmail && (
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Intern:</span>
                      <span className="font-semibold text-text-primary truncate">
                        {metadata.internEmail}
                      </span>
                    </div>
                  )}
                  {metadata?.submittedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Submitted:</span>
                      <span className="font-medium text-text-primary">
                        {new Date(metadata.submittedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  {metadata?.templateName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Workflow:</span>
                      <span className="font-medium text-text-primary">
                        {metadata.templateName}
                      </span>
                    </div>
                  )}
                  {metadata?.stepInfo && (
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Routing Step:</span>
                      <span className="font-medium text-text-primary">{metadata.stepInfo}</span>
                    </div>
                  )}
                  {metadata?.currentHolderName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Assigned to:</span>
                      <span className="font-medium text-text-primary">
                        {metadata.currentHolderName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Enrolled Signature Stamp Preview */}
                {currentHasSignature && currentSignaturePreview && (
                  <div className="border border-dashed border-border-default rounded-xl p-2.5 bg-surface-muted space-y-1.5">
                    <span className="block text-[10px] uppercase font-bold text-text-muted">
                      Your Signature Stamp to be Applied:
                    </span>
                    <div className="h-14 flex items-center justify-center bg-white rounded-lg border border-border-default p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentSignaturePreview}
                        alt="Your Enrolled Signature"
                        className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                      />
                    </div>
                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsEditingSignature(true)}
                        className="text-[11px] font-semibold text-brand-primary hover:text-brand-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
                        title="Edit or update your signature stamp without leaving this page"
                      >
                        <span>Edit signature</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Return Comment Warning if already Returned */}
                {metadata?.returnComment && (
                  <div className="rounded-lg bg-red-50 p-3 text-xs border border-red-200 text-red-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-red-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                      <span>Previous Return Comment:</span>
                    </div>
                    <p className="italic text-red-950 pl-5">&ldquo;{metadata.returnComment}&rdquo;</p>
                  </div>
                )}

                {/* Signature Warning */}
                {!currentHasSignature && (
                  <div
                    role="alert"
                    className="rounded-lg bg-amber-50 p-3 text-xs border border-amber-200 text-amber-900 flex items-start gap-2"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-bold">No Signature Enrolled</p>
                      <p className="mt-0.5 text-[11px] text-amber-800">
                        You must enroll your signature stamp before approving documents.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsEditingSignature(true)}
                        className="inline-block mt-1 font-bold underline text-brand-primary text-xs cursor-pointer"
                      >
                        Enroll signature now →
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {actionError && (
                  <div
                    role="alert"
                    className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200 flex items-start justify-between gap-2"
                  >
                    <span>{actionError}</span>
                    <button
                      type="button"
                      onClick={() => setActionError(null)}
                      className="text-rose-600 hover:text-rose-800 font-bold"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Action Forms */}
                {activeReviewAction === 'return' ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                        <Undo2 className="h-3.5 w-3.5" />
                        Return for Revision
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveReviewAction('none')}
                        className="text-xs text-text-muted hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                    <div>
                      <label htmlFor="modal-return-comment" className="sr-only">
                        Return Comment
                      </label>
                      <textarea
                        id="modal-return-comment"
                        value={returnComment}
                        onChange={(e) => setReturnComment(e.target.value)}
                        placeholder="Explain what the intern needs to correct (minimum 10 characters)..."
                        rows={3}
                        className="w-full rounded-lg border border-border-default p-2 text-xs text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      />
                      <div className="text-right text-[10px] text-text-muted mt-1">
                        {returnComment.trim().length} / 10 chars min
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleConfirmReturn}
                      disabled={isProcessingReview || returnComment.trim().length < 10}
                      className="w-full text-xs font-semibold"
                    >
                      {isProcessingReview ? 'Returning Document...' : 'Submit Return'}
                    </Button>
                  </div>
                ) : activeReviewAction === 'reassign' && canReassign ? (
                  <div className="rounded-xl border border-border-default bg-surface-muted p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Reassign Approver
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveReviewAction('none')}
                        className="text-xs text-text-muted hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                    <div>
                      <label
                        htmlFor="modal-reassign-target"
                        className="block text-[11px] font-semibold text-text-muted mb-1"
                      >
                        Assign To:
                      </label>
                      <select
                        id="modal-reassign-target"
                        value={reassignApproverId}
                        onChange={(e) => setReassignApproverId(e.target.value)}
                        className="w-full rounded-lg border border-border-default p-1.5 text-xs text-text-primary bg-white focus:outline-none"
                      >
                        {approversList
                          .filter((a) => a.email !== currentApproverEmail)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.email} ({a.role})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="modal-reassign-reason"
                        className="block text-[11px] font-semibold text-text-muted mb-1"
                      >
                        Reason (min 10 chars):
                      </label>
                      <textarea
                        id="modal-reassign-reason"
                        value={reassignReason}
                        onChange={(e) => setReassignReason(e.target.value)}
                        placeholder="State mandatory reason for reassignment..."
                        rows={2}
                        className="w-full rounded-lg border border-border-default p-2 text-xs text-text-primary bg-white focus:outline-none"
                      />
                      <div className="text-right text-[10px] text-text-muted mt-0.5">
                        {reassignReason.trim().length} / 10 chars min
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmReassign}
                      disabled={isProcessingReview || reassignReason.trim().length < 10}
                      className="w-full text-xs font-semibold"
                    >
                      {isProcessingReview ? 'Reassigning...' : 'Confirm Reassignment'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Action Buttons Bar at bottom of sidebar */}
              <div className="p-4 border-t border-border-default bg-surface-muted/60 space-y-2">
                {onApprove && (
                  <Button
                    type="button"
                    variant="success"
                    size="default"
                    onClick={handleConfirmApprove}
                    disabled={isProcessingReview || !hasSignature}
                    className="w-full text-xs font-bold shadow-xs py-2.5"
                  >
                    {isProcessingReview ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        Compositing Signature…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Approve & Apply Signature
                      </>
                    )}
                  </Button>
                )}

                <div className="flex gap-2">
                  {onReturn && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActiveReviewAction(activeReviewAction === 'return' ? 'none' : 'return')
                      }
                      disabled={isProcessingReview}
                      className="flex-1 text-xs text-rose-800 border-rose-200 hover:bg-rose-50"
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1" />
                      Return
                    </Button>
                  )}

                  {canReassign && onReassign && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActiveReviewAction(
                          activeReviewAction === 'reassign' ? 'none' : 'reassign'
                        )
                      }
                      disabled={isProcessingReview}
                      className="flex-1 text-xs text-text-muted hover:text-text-primary"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      Reassign
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* In-Modal Signature Editor Overlay (FR-11: in-place signature edit without redirect or new tab) */}
        {isEditingSignature && (
          <div className="absolute inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-bg rounded-2xl shadow-2xl border border-border-default w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-3.5 border-b border-border-default bg-surface-muted flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      {currentHasSignature ? 'Edit Digital Signature Stamp' : 'Enroll Digital Signature Stamp'}
                    </h3>
                    <p className="text-[11px] text-text-muted">
                      Draw on canvas or upload an image. Saves instantly to your account.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingSignature(false)}
                  className="h-7 w-7 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover flex items-center justify-center transition-colors text-base font-medium cursor-pointer"
                  title="Close signature editor"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <SignaturePad
                  currentSignatureUrl={currentSignaturePreview}
                  onSaveSignature={async (formData) => {
                    const res = await enrollSignatureAction(formData);
                    if (res.success && res.previewUrl) {
                      setCurrentSignaturePreview(res.previewUrl);
                      setCurrentHasSignature(true);
                      if (onSignatureUpdated) {
                        onSignatureUpdated(res.previewUrl);
                      }
                    }
                    return res;
                  }}
                  onSuccess={() => {
                    setTimeout(() => {
                      setIsEditingSignature(false);
                    }, 600);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
