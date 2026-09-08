import { AuditLogTable } from '@/components/AuditLogTable';
import { getAuditLogs, AuditLogEntry } from '@lib/data/audit';
import { getSubmissionSignedDownloadUrl } from '@lib/data/submissions';

export const dynamic = 'force-dynamic';

export default async function SystemAdminAuditLogPage() {
  let initialLogs: AuditLogEntry[] = [];
  let errorMsg: string | null = null;

  try {
    initialLogs = await getAuditLogs({ limit: 150 });
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load audit logs';
  }

  async function handleGetDownloadUrl(submissionId: string) {
    'use server';
    try {
      const res = await getSubmissionSignedDownloadUrl(submissionId);
      return { signedUrl: res.signedUrl, isVerified: res.isVerified, fileHash: res.fileHash };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to generate file download link';
      return { error: msg };
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Security Audit Log</h1>
        <p className="text-sm text-text-muted mt-1">
          Append-only, immutable record of all authentication, state transition, and administrative events.
        </p>
      </div>

      {errorMsg ? (
        <div className="rounded-xl bg-status-returned/10 p-6 text-sm text-status-returned-text border border-status-returned/30">
          Failed to load audit logs: {errorMsg}
        </div>
      ) : (
        <AuditLogTable
          initialLogs={initialLogs}
          onGetDownloadUrlAction={handleGetDownloadUrl}
        />
      )}
    </div>
  );
}
