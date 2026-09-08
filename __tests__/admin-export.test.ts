import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

let dashboardData: {
  interns: Row[];
  requirements: Row[];
  submissions: Row[];
};

/* eslint-disable @typescript-eslint/no-unused-vars */
const auditInsert = vi.fn(async (_row: Row) => ({ error: null }));

vi.mock('@lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }) }),
  }),
}));

vi.mock('@lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: auditInsert }) }),
}));

vi.mock('@lib/data/dashboard', () => ({
  getAdminDashboardData: async () => dashboardData,
}));

import { GET } from '../src/app/api/admin/export/route';

function makeRequest(query: string) {
  return new Request(`http://localhost/api/admin/export${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  dashboardData = {
    interns: [{ id: 'intern-1', email: 'a@example.com', full_name: 'A Intern', school: 'MIT', batch: '2026A', internship_start: '2026-01-01T00:00:00Z', internship_end: '2026-06-01T00:00:00Z' }],
    requirements: [{ id: 'req-1', name: 'DTR' }],
    submissions: [{
      id: 'sub-1', intern_id: 'intern-1', requirement_id: 'req-1', state: 'APPROVED',
      current_holder_id: null, current_holder_email: 'appr@example.com', current_holder_name: 'Approver Name',
      due_date: '2026-02-01T00:00:00Z', isOverdue: false,
      submitted_at: '2026-01-05T00:00:00Z', approved_at: '2026-01-10T00:00:00Z',
      approver_email: 'appr@example.com', approver_name: 'Approver Name',
    }],
  };
});

describe('GET /api/admin/export — column customization', () => {
  it('defaults to the original 10 columns when cols is omitted (backward compat)', async () => {
    const res = await GET(makeRequest(''));
    const csv = await res.text();
    const header = csv.split('\n')[0];
    // Header row is a plain comma-join, not CSV-quoted -- matches the pre-existing route
    // exactly (only data rows go through toCsvField). Quoting the header would be an
    // unrequested behavior change and would break this "byte-for-byte identical" check.
    expect(header).toBe('Intern Name,Intern Email,School,Batch,Requirement,State,Submitted Date,Approved Date,Approver,Current Holder');
  });

  it('produces a header matching a custom subset, in registry order', async () => {
    const res = await GET(makeRequest('?cols=state,intern_email,overdue'));
    const csv = await res.text();
    const [header, row1] = csv.split('\n');
    // Registry order is state, then intern_email is earlier in EXPORT_COLUMNS than overdue --
    // but the route must render in the ORDER THE ADMIN SELECTED is not required; it must
    // render in a stable, registry-defined order so the CSV is deterministic regardless of
    // how `cols` was ordered in the query string.
    expect(header).toBe('Intern Email,State,Overdue');
    expect(row1).toBe('"a@example.com","APPROVED","No"');
  });

  it('falls back to the default 10 when cols contains no recognized keys', async () => {
    const res = await GET(makeRequest('?cols=not_a_real_column'));
    const csv = await res.text();
    const header = csv.split('\n')[0];
    expect(header).toBe('Intern Name,Intern Email,School,Batch,Requirement,State,Submitted Date,Approved Date,Approver,Current Holder');
  });

  it('records the selected columns in the audit log payload', async () => {
    await GET(makeRequest('?cols=intern_email,due_date'));
    const payload = auditInsert.mock.calls[0][0] as Row;
    expect(payload.action).toBe('EXPORT_DASHBOARD_CSV');
    expect((payload.payload as Row).columns).toEqual(['intern_email', 'due_date']);
  });
});
