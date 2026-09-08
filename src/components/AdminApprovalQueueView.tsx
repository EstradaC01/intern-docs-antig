'use client';

import React, { useState } from 'react';
import { ApproverQueue, ApproverQueueItem, ApproverUser } from './ApproverQueue';

interface AdminApprovalQueueViewProps {
  allItems: ApproverQueueItem[];
  approverEmail?: string;
  hasSignature: boolean;
  signaturePreviewUrl?: string | null;
  approversList: ApproverUser[];
  onApproveAction: (
    submissionId: string
  ) => Promise<{ success?: boolean; error?: string; final?: boolean; signedUrl?: string | null }>;
  onReturnAction: (submissionId: string, comment: string) => Promise<{ success?: boolean; error?: string }>;
  onReassignAction: (
    submissionId: string,
    newApproverId: string,
    reason: string
  ) => Promise<{ success?: boolean; error?: string }>;
  onGetDownloadUrlAction: (
    submissionId: string
  ) => Promise<{ signedUrl?: string; error?: string; isVerified?: boolean; fileHash?: string }>;
}

export function AdminApprovalQueueView({
  allItems,
  approverEmail,
  hasSignature,
  signaturePreviewUrl,
  approversList,
  onApproveAction,
  onReturnAction,
  onReassignAction,
  onGetDownloadUrlAction,
}: AdminApprovalQueueViewProps) {
  // 1. Step 2 (Admin Final Approval) items in multi-step workflows
  const step2Items = allItems.filter(
    (item) => item.totalSteps && item.totalSteps >= 2 && item.current_step === 2 && item.stepRole === 'admin'
  );

  // 2. Step 1 items (Supervisor review or 1-step requirements)
  const step1Items = allItems.filter(
    (item) => item.current_step === 1 || (item.totalSteps === 1 && item.current_step === 1)
  );

  const [activeTab, setActiveTab] = useState<'final' | 'step1' | 'all'>('all');

  const displayedItems =
    activeTab === 'final' ? step2Items : activeTab === 'step1' ? step1Items : allItems;

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-default pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('final')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'final'
              ? 'bg-brand-primary text-white shadow-xs'
              : 'bg-surface-bg text-text-muted hover:text-text-primary hover:bg-surface-hover border border-border-default'
          }`}
        >
          <span>Final Approvals (Step 2)</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'final'
                ? 'bg-white/20 text-white'
                : 'bg-surface-muted text-text-muted border border-border-default'
            }`}
          >
            {step2Items.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('step1')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'step1'
              ? 'bg-brand-primary text-white shadow-xs'
              : 'bg-surface-bg text-text-muted hover:text-text-primary hover:bg-surface-hover border border-border-default'
          }`}
        >
          <span>Step 1 Approvals (Supervisor Fallback)</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'step1'
                ? 'bg-white/20 text-white'
                : 'bg-surface-muted text-text-muted border border-border-default'
            }`}
          >
            {step1Items.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'all'
              ? 'bg-brand-primary text-white shadow-xs'
              : 'bg-surface-bg text-text-muted hover:text-text-primary hover:bg-surface-hover border border-border-default'
          }`}
        >
          <span>All Pending</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'all'
                ? 'bg-white/20 text-white'
                : 'bg-surface-muted text-text-muted border border-border-default'
            }`}
          >
            {allItems.length}
          </span>
        </button>
      </div>

      {/* Info Callout for Step 1 Fallback Mode */}
      {activeTab === 'step1' && (
        <div className="bg-brand-muted/70 border border-brand-accent/40 rounded-2xl p-4 flex items-start gap-3.5 text-xs text-text-primary shadow-xs">
          <div className="p-1.5 rounded-lg bg-brand-primary text-white shrink-0 mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <span className="font-bold text-brand-primary block text-sm">Supervisor Fallback Mode</span>
            <p className="text-text-muted mt-1 leading-relaxed">
              These documents are currently awaiting Step 1 (Supervisor Review). If the assigned supervisor is unavailable
              or unassigned at the moment, you can review and digitally sign on their behalf as an administrator, return
              with feedback, or reassign to another available supervisor.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {displayedItems.length === 0 ? (
        <div className="bg-surface-bg border border-border-default rounded-2xl p-10 text-center shadow-xs">
          <svg
            className="mx-auto h-12 w-12 text-status-approved mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-sm font-bold text-text-primary">
            {activeTab === 'final'
              ? 'No pending final approvals'
              : activeTab === 'step1'
              ? 'No pending Step 1 submissions'
              : 'No pending submissions'}
          </h3>
          <p className="text-xs text-text-muted mt-1 max-w-md mx-auto">
            {activeTab === 'final'
              ? 'All 2-way approval documents have received final approval or are currently awaiting Step 1 supervisor review.'
              : activeTab === 'step1'
              ? 'All intern submissions have already cleared Step 1 supervisor review.'
              : 'All cohort submissions have been processed.'}
          </p>
          {activeTab === 'final' && step1Items.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setActiveTab('step1')}
                className="text-xs font-semibold text-brand-primary hover:underline"
              >
                View {step1Items.length} submission{step1Items.length > 1 ? 's' : ''} awaiting Step 1 review →
              </button>
            </div>
          )}
        </div>
      ) : (
        <ApproverQueue
          items={displayedItems}
          approverEmail={approverEmail}
          hasSignature={hasSignature}
          signaturePreviewUrl={signaturePreviewUrl}
          approversList={approversList}
          canReassign={true}
          hideHeader
          onApproveAction={onApproveAction}
          onReturnAction={onReturnAction}
          onReassignAction={onReassignAction}
          onGetDownloadUrlAction={onGetDownloadUrlAction}
        />
      )}
    </div>
  );
}
