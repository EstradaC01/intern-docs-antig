import { describe, it, expect } from 'vitest';
import { EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMN_KEYS } from '../lib/export/columns';
import type { DashboardIntern, DashboardRequirement, DashboardSubmission } from '../lib/data/dashboard';

const intern: DashboardIntern = {
  id: 'intern-1', email: 'a@example.com', full_name: 'A Intern',
  internship_start: '2026-01-01T00:00:00Z', internship_end: '2026-06-01T00:00:00Z',
  school: 'MIT', batch: '2026A',
};
const req: DashboardRequirement = { id: 'req-1', name: 'DTR' };
const sub: DashboardSubmission = {
  id: 'sub-1', intern_id: 'intern-1', requirement_id: 'req-1', state: 'APPROVED',
  current_holder_id: null, current_holder_email: 'appr@example.com', current_holder_name: 'Approver Name',
  due_date: '2026-02-01T00:00:00Z', isOverdue: false,
  submitted_at: '2026-01-05T00:00:00Z', approved_at: '2026-01-10T00:00:00Z',
  approver_email: 'appr@example.com', approver_name: 'Approver Name',
};

function getColumn(key: string) {
  const col = EXPORT_COLUMNS.find((c) => c.key === key);
  if (!col) throw new Error(`No such column: ${key}`);
  return col;
}

describe('EXPORT_COLUMNS', () => {
  it('has exactly 14 columns with unique keys', () => {
    expect(EXPORT_COLUMNS).toHaveLength(14);
    expect(new Set(EXPORT_COLUMNS.map((c) => c.key)).size).toBe(14);
  });

  it('DEFAULT_EXPORT_COLUMN_KEYS matches the original 10, in the original order', () => {
    expect(DEFAULT_EXPORT_COLUMN_KEYS).toEqual([
      'intern_name', 'intern_email', 'school', 'batch',
      'requirement', 'state', 'submitted_date', 'approved_date', 'approver', 'current_holder',
    ]);
  });

  it('renders the 4 new fields correctly', () => {
    expect(getColumn('due_date').getValue(intern, req, sub, sub.state)).toBe('2026-02-01');
    expect(getColumn('overdue').getValue(intern, req, sub, sub.state)).toBe('No');
    expect(getColumn('overdue').getValue(intern, req, { ...sub, isOverdue: true }, sub.state)).toBe('Yes');
    expect(getColumn('internship_start').getValue(intern, req, sub, sub.state)).toBe('2026-01-01');
    expect(getColumn('internship_end').getValue(intern, req, sub, sub.state)).toBe('2026-06-01');
  });

  it('renders existing fields the same as before (regression check)', () => {
    expect(getColumn('intern_name').getValue(intern, req, sub, sub.state)).toBe('A Intern');
    expect(getColumn('intern_email').getValue(intern, req, sub, sub.state)).toBe('a@example.com');
    expect(getColumn('requirement').getValue(intern, req, sub, sub.state)).toBe('DTR');
    expect(getColumn('state').getValue(intern, req, sub, 'NOT_STARTED')).toBe('NOT_STARTED');
    expect(getColumn('submitted_date').getValue(intern, req, sub, sub.state)).toBe('2026-01-05');
    expect(getColumn('approved_date').getValue(intern, req, sub, sub.state)).toBe('2026-01-10');
    expect(getColumn('approver').getValue(intern, req, sub, sub.state)).toBe('Approver Name');
    expect(getColumn('current_holder').getValue(intern, req, sub, sub.state)).toBe('Approver Name');
  });

  it('handles a missing submission (NOT_STARTED row) without throwing', () => {
    expect(getColumn('submitted_date').getValue(intern, req, undefined, 'NOT_STARTED')).toBe('');
    expect(getColumn('approver').getValue(intern, req, undefined, 'NOT_STARTED')).toBe('');
    expect(getColumn('overdue').getValue(intern, req, undefined, 'NOT_STARTED')).toBe('No');
  });
});
