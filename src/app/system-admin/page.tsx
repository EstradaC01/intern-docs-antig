import { createAdminClient } from '@lib/supabase/admin';
import Link from 'next/link';
import { humanizeCode } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SystemAdminOverviewPage() {
  const adminClient = createAdminClient();

  const [usersRes, auditRes, submissionsRes] = await Promise.all([
    adminClient.from('users').select('id, role'),
    adminClient.from('audit_log').select('id, action, created_at').order('created_at', { ascending: false }).limit(5),
    adminClient.from('submissions').select('id, state'),
  ]);

  const users = usersRes.data || [];
  const recentAudit = auditRes.data || [];
  const submissions = submissionsRes.data || [];

  const internCount = users.filter((u) => u.role === 'intern').length;
  const approverCount = users.filter((u) => u.role === 'approver').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const sysAdminCount = users.filter((u) => u.role === 'system_admin').length;

  const inReviewCount = submissions.filter((s) => s.state === 'IN_REVIEW').length;
  const approvedCount = submissions.filter((s) => s.state === 'APPROVED').length;
  const purgedCount = submissions.filter((s) => s.state === 'PURGED').length;

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">System Administration</h1>
        <p className="text-sm text-text-muted mt-1">
          Governance, security compliance (RA 10173), user access control, and data retention.
        </p>
      </div>

      {/* High-Level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Total Users</span>
          <div className="text-3xl font-extrabold text-text-primary">{users.length}</div>
          <p className="text-[11px] text-text-muted">
            {internCount} Interns · {approverCount} Approvers · {adminCount + sysAdminCount} Admins
          </p>
        </div>

        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Active In-Review</span>
          <div className="text-3xl font-extrabold text-status-in-review-text">{inReviewCount}</div>
          <p className="text-[11px] text-text-muted">Currently in review across cohorts</p>
        </div>

        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Sealed Approvals</span>
          <div className="text-3xl font-extrabold text-status-approved-text">{approvedCount}</div>
          <p className="text-[11px] text-text-muted">3-year immutable attestation records</p>
        </div>

        <div className="bg-surface-bg border border-border-default rounded-2xl p-5 shadow-xs space-y-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Purged Files (30d)</span>
          <div className="text-3xl font-extrabold text-text-muted">{purgedCount}</div>
          <p className="text-[11px] text-text-muted">Personal data minimized lawfully</p>
        </div>
      </div>

      {/* RA 10173 Security & Compliance Status */}
      <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">
            Data Privacy (RA 10173) &amp; Security Posture
          </h2>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-approved-text bg-status-approved/10 px-2.5 py-1 rounded-full border border-status-approved/30">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Compliant &amp; Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
          <div className="p-4 rounded-xl bg-surface-muted border border-border-default space-y-1.5">
            <span className="font-bold text-text-primary block">30-Day Retention Sweep</span>
            <p className="text-text-muted text-[11px] leading-relaxed">
              Automated daily purge removes sensitive DTR file bytes after 30 days while retaining 3-year approval hashes.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-muted border border-border-default space-y-1.5">
            <span className="font-bold text-text-primary block">Append-Only Audit Log</span>
            <p className="text-text-muted text-[11px] leading-relaxed">
              Database engine denies all UPDATE and DELETE operations on audit_log. Every security event is permanent.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-muted border border-border-default space-y-1.5">
            <span className="font-bold text-text-primary block">Signature Image Isolation</span>
            <p className="text-text-muted text-[11px] leading-relaxed">
              Signatures stored in private zero-read buckets. Server-side compositing prevents raw asset exposure.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Governance Links & Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Governance Controls */}
        <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-text-primary">System Governance Portals</h3>
          <div className="space-y-3">
            <Link
              href="/system-admin/users"
              className="flex items-center justify-between p-3.5 rounded-xl border border-border-default hover:bg-surface-hover transition-colors"
            >
              <div>
                <span className="font-semibold text-xs text-text-primary block">User &amp; Role Governance</span>
                <span className="text-[11px] text-text-muted">Manage system administrators, approvers, and roles</span>
              </div>
              <span className="text-xs text-brand-primary font-bold">Manage Users →</span>
            </Link>

            <Link
              href="/system-admin/audit-log"
              className="flex items-center justify-between p-3.5 rounded-xl border border-border-default hover:bg-surface-hover transition-colors"
            >
              <div>
                <span className="font-semibold text-xs text-text-primary block">Security Audit Log</span>
                <span className="text-[11px] text-text-muted">Inspect system-wide immutable event history &amp; IP traces</span>
              </div>
              <span className="text-xs text-brand-primary font-bold">View Logs →</span>
            </Link>

            <Link
              href="/system-admin/retention"
              className="flex items-center justify-between p-3.5 rounded-xl border border-border-default hover:bg-surface-hover transition-colors"
            >
              <div>
                <span className="font-semibold text-xs text-text-primary block">Retention &amp; Deletion Engine</span>
                <span className="text-[11px] text-text-muted">Verify 30-day post-approval purge and survival records</span>
              </div>
              <span className="text-xs text-brand-primary font-bold">Inspect Retention →</span>
            </Link>
          </div>
        </div>

        {/* Recent Audit Activities */}
        <div className="bg-surface-bg border border-border-default rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-text-primary">Recent Security Events</h3>
            <Link href="/system-admin/audit-log" className="text-xs text-brand-primary font-semibold hover:underline">
              View All
            </Link>
          </div>

          <div className="space-y-2.5">
            {recentAudit.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted text-xs">
                <span className="font-semibold text-[11px] text-text-primary">{humanizeCode(log.action)}</span>
                <span className="text-[11px] text-text-muted">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {recentAudit.length === 0 && (
              <p className="text-xs text-text-muted italic">No recent events.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
