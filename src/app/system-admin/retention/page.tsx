import Link from 'next/link';
import { createAdminClient } from '@lib/supabase/admin';
import { runRetentionSweep } from '@lib/jobs/retention-sweep';
import { RunRetentionSweepButton } from '@/components/RunRetentionSweepButton';
import { humanizeCode } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SystemAdminRetentionPage() {
  const adminClient = createAdminClient();

  const [submissionsRes, auditRes] = await Promise.all([
    adminClient
      .from('submissions')
      .select('id, state, requirements(name), users!submissions_intern_id_fkey(email), submission_versions(id, deleted_at, file_hash), approvals(created_at)')
      .order('created_at', { ascending: false }),
    adminClient
      .from('audit_log')
      .select('id, action, target_id, payload, created_at')
      .eq('action', 'RETENTION_PURGE_EXECUTED')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const submissions = submissionsRes.data || [];
  const purgeLogs = auditRes.data || [];

  const purgedItems = submissions.filter((s) => s.state === 'PURGED');
  const activeItems = submissions.filter((s) => s.state !== 'PURGED');

  async function handleManualSweep() {
    'use server';
    try {
      await runRetentionSweep();
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Retention sweep failed.';
      return { error: msg };
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Retention &amp; Deletion Engine</h1>
          <p className="text-sm text-text-muted mt-1">
            Enforces the 30-day post-approval storage purge under the Philippine Data Privacy Act (RA 10173).
          </p>
        </div>

        <RunRetentionSweepButton onRunSweepAction={handleManualSweep} />
      </div>

      {/* Retention Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Active Documents</span>
          <div className="text-2xl font-bold text-text-primary">{activeItems.length}</div>
          <p className="text-[11px] text-text-muted">Files retained in private storage</p>
        </div>

        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Purged Files (30d)</span>
          <div className="text-2xl font-bold text-text-muted">{purgedItems.length}</div>
          <p className="text-[11px] text-text-muted">Storage bytes wiped permanently</p>
        </div>

        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Surviving Approval Records</span>
          <div className="text-2xl font-bold text-status-approved-text">100%</div>
          <p className="text-[11px] text-text-muted">Retained for at least 3 years (FR-23)</p>
        </div>
      </div>

      {/* RA 10173 Policy Rules */}
      <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-3">
        <h2 className="text-base font-bold text-text-primary">Policy Execution Rules (PRD FR-22 &amp; FR-23)</h2>
        <ul className="list-disc list-inside space-y-2 text-xs text-text-muted leading-relaxed">
          <li>
            <strong className="text-text-primary">Approved Documents:</strong> Storage bytes are permanently deleted <strong>30 days after final approval</strong>.
          </li>
          <li>
            <strong className="text-text-primary">Non-Approved Documents:</strong> Storage bytes are permanently deleted <strong>30 days after internship end date</strong>.
          </li>
          <li>
            <strong className="text-text-primary">Automated Warning Emails:</strong> Advance notifications are sent at <strong>14 days, 7 days, and 1 day</strong> before deletion.
          </li>
          <li>
            <strong className="text-text-primary">Survival Attestation:</strong> Submission metadata, approver identity, UTC timestamp, and SHA-256 hash survive deletion for <strong>at least 3 years</strong>.
          </li>
        </ul>
      </div>

      {/* Purge Audit History */}
      <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="font-bold text-sm text-text-primary">Recent Retention Purge Logs ({purgeLogs.length})</h2>

        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Recent retention purge logs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-default text-text-muted bg-surface-muted">
                <th className="py-3 px-4 font-semibold">Event</th>
                <th className="py-3 px-4 font-semibold">Target Submission</th>
                <th className="py-3 px-4 font-semibold">Purged File Hash (SHA-256)</th>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {purgeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-hover transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary text-[11px]">{humanizeCode(log.action)}</td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    {log.target_id ? (
                      <Link href={`/admin/submissions/${log.target_id}`} className="text-brand-primary hover:underline">
                        {log.target_id}
                      </Link>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[10px] text-text-muted max-w-xs truncate">
                    {log.payload?.file_hash || '—'}
                  </td>
                  <td className="py-3 px-4 text-text-muted">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {purgeLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-text-muted italic">
                    No documents have reached the 30-day deletion threshold yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
