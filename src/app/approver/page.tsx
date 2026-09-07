import {
  getApproverQueue,
  approveSubmissionSigned,
  returnSubmission,
  reassignApprover,
  getSubmissionSignedDownloadUrl,
} from '@lib/data/submissions';
import { hasEnrolledSignature, getOwnSignaturePreviewUrl } from '@lib/data/signatures';
import { getApproversList } from '@lib/data/routing';
import { createClient } from '@lib/supabase/server';
import { ApproverQueue } from '@/components/ApproverQueue';
import { AutoRefresh } from '@/components/AutoRefresh';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ApproverDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  // FR-15 / Appendix A: reassignment is an Administrator-only action.
  const canReassign = dbUser?.role === 'admin' || dbUser?.role === 'system_admin';

  const [items, hasSignature, signaturePreview, approversList] = await Promise.all([
    getApproverQueue(),
    hasEnrolledSignature(user.id),
    getOwnSignaturePreviewUrl(),
    getApproversList(),
  ]);

  async function handleApprove(submissionId: string) {
    'use server';
    try {
      const res = await approveSubmissionSigned(submissionId);
      return { success: true, final: res.final, signedUrl: res.signedUrl };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Approval failed';
      return { error: msg };
    }
  }

  async function handleReturn(submissionId: string, comment: string) {
    'use server';
    try {
      await returnSubmission(submissionId, comment);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Return failed';
      return { error: msg };
    }
  }

  async function handleReassign(submissionId: string, newApproverId: string, reason: string) {
    'use server';
    try {
      await reassignApprover(submissionId, newApproverId, reason);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Reassignment failed';
      return { error: msg };
    }
  }

  async function handleGetDownloadUrl(submissionId: string) {
    'use server';
    try {
      const res = await getSubmissionSignedDownloadUrl(submissionId);
      return { signedUrl: res.signedUrl, isVerified: res.isVerified, fileHash: res.fileHash };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch download link';
      return { error: msg };
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-6">
      {/* Background auto-refresh so supervisors see incoming documents promptly -- re-runs
          this page's Server Components every 15s via router.refresh(), no client-side querying. */}
      <AutoRefresh intervalMs={15_000} />
      {/* Missing Signature Alert Banner */}
      {!hasSignature && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <svg className="h-5 w-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="text-xs font-bold text-amber-900">Signature Required for Approvals</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                You have not enrolled your digital signature stamp yet. You must enroll a signature before you can approve submissions.
              </p>
            </div>
          </div>
          <Link
            href="/approver/signature"
            className="shrink-0 px-3.5 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors"
          >
            Enroll Signature Now →
          </Link>
        </div>
      )}

      <ApproverQueue
        items={items}
        approverEmail={user.email}
        hasSignature={hasSignature}
        signaturePreviewUrl={signaturePreview.previewUrl}
        approversList={approversList}
        canReassign={canReassign}
        onApproveAction={handleApprove}
        onReturnAction={handleReturn}
        onReassignAction={handleReassign}
        onGetDownloadUrlAction={handleGetDownloadUrl}
      />
    </div>
  );
}
