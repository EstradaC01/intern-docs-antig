// FR-21 CSV export column definitions. Single source of truth for both the export
// route (src/app/api/admin/export/route.ts) and the column-picker UI
// (src/components/ColumnPicker.tsx) so the two can never disagree on a column's label
// or how its value is computed.
import type { DashboardIntern, DashboardRequirement, DashboardSubmission } from '../data/dashboard';

export interface ExportColumn {
  key: string;
  label: string;
  getValue: (
    intern: DashboardIntern,
    req: DashboardRequirement,
    sub: DashboardSubmission | undefined,
    state: string
  ) => string;
}

function toDate(value: string | null | undefined): string {
  return value ? new Date(value).toISOString().split('T')[0] : '';
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'intern_name', label: 'Intern Name', getValue: (intern) => intern.full_name || '' },
  { key: 'intern_email', label: 'Intern Email', getValue: (intern) => intern.email },
  { key: 'school', label: 'School', getValue: (intern) => intern.school || '' },
  { key: 'batch', label: 'Batch', getValue: (intern) => intern.batch || '' },
  { key: 'requirement', label: 'Requirement', getValue: (_intern, req) => req.name },
  { key: 'state', label: 'State', getValue: (_intern, _req, _sub, state) => state },
  { key: 'submitted_date', label: 'Submitted Date', getValue: (_i, _r, sub) => toDate(sub?.submitted_at) },
  { key: 'approved_date', label: 'Approved Date', getValue: (_i, _r, sub) => toDate(sub?.approved_at) },
  { key: 'approver', label: 'Approver', getValue: (_i, _r, sub) => sub?.approver_name || sub?.approver_email || '' },
  { key: 'current_holder', label: 'Current Holder', getValue: (_i, _r, sub) => sub?.current_holder_name || sub?.current_holder_email || '' },
  { key: 'due_date', label: 'Due Date', getValue: (_i, _r, sub) => toDate(sub?.due_date) },
  { key: 'overdue', label: 'Overdue', getValue: (_i, _r, sub) => (sub?.isOverdue ? 'Yes' : 'No') },
  { key: 'internship_start', label: 'Internship Start', getValue: (intern) => toDate(intern.internship_start) },
  { key: 'internship_end', label: 'Internship End', getValue: (intern) => toDate(intern.internship_end) },
];

export const DEFAULT_EXPORT_COLUMN_KEYS = [
  'intern_name', 'intern_email', 'school', 'batch',
  'requirement', 'state', 'submitted_date', 'approved_date', 'approver', 'current_holder',
];
