import 'server-only';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { downloadAndVerifyFile } from './submissions';

export interface ApprovedDocumentFile {
  requirementName: string;
  buffer: Buffer;
}

export interface SkippedDocument {
  requirementName: string;
  reason: string;
}

export interface ApprovedDocumentsExportResult {
  files: ApprovedDocumentFile[];
  skipped: SkippedDocument[];
}

interface ApprovalRow {
  step: number;
  created_at: string;
  signed_pdf_url: string | null;
  file_hash: string;
}

/**
 * FR: bulk export of one intern's own approved documents before the 30-day retention
 * purge (lib/jobs/retention-sweep.ts). Self-service only -- always scoped to the
 * session's own user.id, never an internId parameter. Signed outputs only, matching
 * what getSubmissionSignedDownloadUrl serves for an APPROVED submission.
 */
export async function getApprovedDocumentsForExport(): Promise<ApprovedDocumentsExportResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const adminClient = createAdminClient();

  const { data: submissions, error } = await adminClient
    .from('submissions')
    .select(`
      id,
      requirements(name),
      approvals(step, created_at, signed_pdf_url, file_hash)
    `)
    .eq('intern_id', user.id)
    .eq('state', 'APPROVED');

  if (error) throw new Error(`Failed to load approved documents: ${error.message}`);

  const files: ApprovedDocumentFile[] = [];
  const skipped: SkippedDocument[] = [];

  for (const sub of submissions || []) {
    // @ts-expect-error nested field mapping
    const reqName: string = sub.requirements?.name || 'Document';
    const approvals = (sub.approvals || []) as ApprovalRow[];
    const latestApproval = [...approvals].sort(
      (a, b) => (b.step || 0) - (a.step || 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    if (!latestApproval?.signed_pdf_url) {
      skipped.push({ requirementName: reqName, reason: 'No signed output on record' });
      continue;
    }

    try {
      const { buffer } = await downloadAndVerifyFile(latestApproval.signed_pdf_url, latestApproval.file_hash, sub.id);
      files.push({ requirementName: reqName, buffer });
    } catch {
      skipped.push({ requirementName: reqName, reason: 'Integrity check failed' });
    }
  }

  return { files, skipped };
}
