import { NextResponse } from 'next/server';
import { createClient } from '@lib/supabase/server';
import { createAdminClient } from '@lib/supabase/admin';
import { getAdminDashboardData } from '@lib/data/dashboard';
import { EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMN_KEYS } from '@lib/export/columns';
import { headers } from 'next/headers';

// FR-21: one row per intern-requirement pair, in the columns the PRD specifies -- not
// the wide per-requirement matrix the on-screen dashboard uses (FR-20 is a different,
// deliberately different-shaped view of the same data).
function toCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new NextResponse('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!dbUser || !['admin', 'system_admin'].includes(dbUser.role)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filterReq = searchParams.get('req') || 'ALL';
  const filterState = searchParams.get('state') || 'ALL';
  const filterApprover = searchParams.get('appr') || 'ALL';
  const filterSchool = searchParams.get('school') || 'ALL';
  const filterBatch = searchParams.get('batch') || 'ALL';

  // Column selection: unrecognized/missing keys fall back to the original 10, so an
  // existing bookmarked export link (no `cols` param at all) keeps working unchanged.
  const colsParam = searchParams.get('cols');
  const requestedKeys = colsParam
    ? colsParam.split(',').map((k) => k.trim()).filter(Boolean)
    : DEFAULT_EXPORT_COLUMN_KEYS;
  let activeColumns = EXPORT_COLUMNS.filter((c) => requestedKeys.includes(c.key));
  if (activeColumns.length === 0) {
    activeColumns = EXPORT_COLUMNS.filter((c) => DEFAULT_EXPORT_COLUMN_KEYS.includes(c.key));
  }

  // Fetch data
  const data = await getAdminDashboardData();

  const requirementsToRender = filterReq === 'ALL'
    ? data.requirements
    : data.requirements.filter(r => r.id === filterReq);

  let csv = activeColumns.map((c) => c.label).join(',') + '\n';
  let resultCount = 0;

  for (const intern of data.interns) {
    if (filterSchool !== 'ALL' && intern.school !== filterSchool) continue;
    if (filterBatch !== 'ALL' && intern.batch !== filterBatch) continue;

    for (const req of requirementsToRender) {
      const sub = data.submissions.find(s => s.intern_id === intern.id && s.requirement_id === req.id);
      const state = sub ? sub.state : 'NOT_STARTED';

      if (filterState !== 'ALL') {
        const matchesState = filterState === 'OVERDUE' ? (sub?.isOverdue ?? false) : state === filterState;
        if (!matchesState) continue;
      }
      if (filterApprover !== 'ALL' && sub?.current_holder_email !== filterApprover) continue;

      const row = activeColumns.map((c) => c.getValue(intern, req, sub, state));
      csv += row.map(toCsvField).join(',') + '\n';
      resultCount++;
    }
  }

  // Audit log the export
  const adminClient = createAdminClient();
  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

  await adminClient.from('audit_log').insert({
    actor_id: user.id,
    action: 'EXPORT_DASHBOARD_CSV',
    target_id: null,
    target_type: 'system',
    source_ip: ip,
    payload: {
      filterReq, filterState, filterApprover, filterSchool, filterBatch, resultCount,
      columns: activeColumns.map((c) => c.key),
    },
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="intern_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
