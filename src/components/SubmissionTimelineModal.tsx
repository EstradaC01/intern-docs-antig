'use client';

import React, { useEffect, useState } from 'react';
import type { SubmissionWithRelations } from '../../lib/data/submissions';
import { fetchSubmissionTimelineAction, fetchSubmissionDetailsAction } from '../app/actions/submissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from './StatusBadge';
import { humanizeCode } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  action: string;
  created_at: string;
  actor_id: string | null;
  users?: { email: string; role: string } | null;
}

interface SubmissionTimelineModalProps {
  submissionId: string;
  onClose: () => void;
}

export function SubmissionTimelineModal({ submissionId, onClose }: SubmissionTimelineModalProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [submission, setSubmission] = useState<SubmissionWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [timelineData, subDetails] = await Promise.all([
          fetchSubmissionTimelineAction(submissionId),
          fetchSubmissionDetailsAction(submissionId)
        ]);
        // TypeScript workaround for select() return types
        setEvents(timelineData as unknown as TimelineEvent[]);
        setSubmission(subDetails);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load timeline');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [submissionId]);

  const totalSteps = submission?.routing_snapshot?.steps?.length
    || submission?.requirements?.routing_templates?.steps?.length
    || 1;
  const currentStep = submission?.current_step || 1;

  const getActionDescription = (action: string) => {
    const lookup: Record<string, string> = {
      SUBMIT_DOCUMENT: 'Document Submitted',
      RESUBMIT_DOCUMENT: 'Document Re-submitted',
      APPROVE_STEP: 'Step Approved',
      APPROVE_FINAL: 'Final Approval Granted',
      RETURN_SUBMISSION: 'Document Returned for Revision',
      REASSIGN_APPROVER: 'Approver Reassigned',
    };
    return lookup[action] || humanizeCode(action);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0" showCloseButton>
        <DialogHeader className="p-6 border-b border-border-default shrink-0">
          <DialogTitle>Submission Timeline</DialogTitle>
          {submission && (
            <p className="text-xs text-text-muted">
              {submission.requirements?.name}
            </p>
          )}
        </DialogHeader>

        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-status-returned/10 p-3 text-xs text-status-returned-text border border-status-returned/30">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Section */}
              <div className="bg-surface-muted p-4 rounded-xl border border-border-default text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs font-semibold text-text-muted mb-1">Current State</span>
                    {submission?.state && <StatusBadge state={submission.state} />}
                  </div>
                  {submission?.state === 'IN_REVIEW' && (
                    <>
                      <div>
                        <span className="block text-xs font-semibold text-text-muted">Progress</span>
                        <span className="font-bold text-text-primary">Step {currentStep} of {totalSteps}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Timeline Events */}
              <div className="relative border-l border-border-default ml-3 space-y-6">
                {events.map((ev) => (
                  <div key={ev.id} className="relative pl-6">
                    <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-border-strong border-2 border-white" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-text-primary">
                        {getActionDescription(ev.action)}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(ev.created_at).toLocaleString()}
                      </span>
                      {ev.users && (
                        <span className="text-[11px] text-text-muted mt-0.5">
                          by {ev.users.email} ({humanizeCode(ev.users.role)})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-xs text-text-muted italic pl-4">No events recorded.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
