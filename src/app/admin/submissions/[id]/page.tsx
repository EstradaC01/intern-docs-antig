import { createClient } from '@lib/supabase/server';
import { createAdminClient } from '@lib/supabase/admin';
import { cancelSubmission, reopenSubmission } from '@lib/data/submissions';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { SubmissionAdminActions } from '@/components/SubmissionAdminActions';
import { humanizeCode } from '@/lib/utils';

export default async function AdminSubmissionViewPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    redirect('/login');
  }

  const adminClient = createAdminClient();
  const { id } = await params;

  // Fetch submission details with versions and approvals
  const { data: submission, error } = await adminClient
    .from('submissions')
    .select(`
      *,
      users!submissions_intern_id_fkey(email, internship_start, internship_end),
      requirements(name),
      submission_versions(*),
      approvals(*, users!approvals_approver_id_fkey(email, role))
    `)
    .eq('id', id)
    .single();

  if (error || !submission) {
    notFound();
  }

  async function handleCancel(reason: string) {
    'use server';
    try {
      await cancelSubmission(id, reason);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to cancel submission';
      return { error: msg };
    }
  }

  async function handleReopen() {
    'use server';
    try {
      await reopenSubmission(id);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to reopen submission';
      return { error: msg };
    }
  }

  // Find active version
  const versions = submission.submission_versions || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeVersion = versions.find((v: any) => !v.is_superseded) || versions[0];
  
  // Sort approvals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approvals = (submission.approvals || []).sort((a: any, b: any) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="min-h-screen bg-surface-muted py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-sm font-semibold text-text-muted hover:text-text-primary">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="bg-surface-bg border border-border-default rounded-xl shadow-xs p-6">
          <div className="flex justify-between items-start mb-6 border-b border-border-default pb-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Submission Record</h1>
              <p className="text-sm text-text-muted mt-1">
                <strong>Intern:</strong> {submission.users?.email}
              </p>
              <p className="text-sm text-text-muted">
                <strong>Requirement:</strong> {submission.requirements?.name}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge state={submission.state} />
              <SubmissionAdminActions
                state={submission.state}
                onCancelAction={handleCancel}
                onReopenAction={handleReopen}
              />
            </div>
          </div>

          {activeVersion?.deleted_at ? (
            <div className="mb-6 bg-surface-muted border border-border-default rounded-lg p-4 text-sm text-text-muted">
              <div className="flex items-center gap-2 font-bold mb-2 text-text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Document Deleted (Retention Policy)
              </div>
              <p>The file bytes for this submission were permanently deleted on <strong>{new Date(activeVersion.deleted_at).toLocaleString()}</strong> in accordance with data retention policies.</p>
              <p className="mt-2 text-xs font-medium text-text-primary bg-white px-2.5 py-1 border border-border-default rounded inline-block">
                Document Record: Version {activeVersion.version_number}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                This record serves as audit proof that the approval took place prior to data deletion.
              </p>
            </div>
          ) : (
            <div className="mb-6 bg-status-submitted/10 border border-status-submitted/30 rounded-lg p-4 text-sm text-status-submitted-text">
              File bytes are still securely stored. Retention purge has not yet occurred.
            </div>
          )}

          <div>
            <h2 className="text-lg font-bold text-text-primary mb-3">Approval History</h2>
            {approvals.length === 0 ? (
              <p className="text-sm text-text-muted italic">No approvals recorded.</p>
            ) : (
              <div className="space-y-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {approvals.map((appr: any) => (
                  <div key={appr.id} className="bg-surface-muted border border-border-default rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-text-primary">Step {appr.step} Approval</p>
                      <p className="text-xs text-text-muted">by {appr.users?.email} ({humanizeCode(appr.users?.role || '')})</p>
                      <p className="text-xs text-text-muted mt-1">{new Date(appr.created_at).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-status-approved-text bg-status-approved/10 border border-status-approved/30 px-2.5 py-1 rounded mb-1">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Verified Signature
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
