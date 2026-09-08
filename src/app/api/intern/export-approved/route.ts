import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createClient } from '@lib/supabase/server';
import { createAdminClient } from '@lib/supabase/admin';
import { getApprovedDocumentsForExport } from '@lib/data/bulk-export';
import { headers } from 'next/headers';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'document';
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new NextResponse('Unauthorized', { status: 401 });

  let result;
  try {
    result = await getApprovedDocumentsForExport();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to build export';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (result.files.length === 0) {
    return NextResponse.json({ error: 'No approved documents available to export.' }, { status: 404 });
  }

  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  for (const file of result.files) {
    const base = sanitizeFileName(file.requirementName);
    const count = usedNames.get(base) || 0;
    usedNames.set(base, count + 1);
    const name = count === 0 ? `${base}.pdf` : `${base} (${count + 1}).pdf`;
    zip.file(name, file.buffer);
  }

  if (result.skipped.length > 0) {
    const manifest = result.skipped.map((s) => `${s.requirementName}: ${s.reason}`).join('\n');
    zip.file('_skipped.txt', manifest);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const adminClient = createAdminClient();
  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'BULK_EXPORT_APPROVED_DOCS',
    target_id: user.id,
    target_type: 'users',
    source_ip: ip,
    payload: {
      count: result.files.length,
      skipped: result.skipped,
    },
  });

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${(user.email || user.id).replace(/[^a-zA-Z0-9._-]/g, '_')}_approved_documents_${new Date().toISOString().split('T')[0]}.zip"`,
    },
  });
}
