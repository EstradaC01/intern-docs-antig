# CSV Export Column Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pick which columns go into the FR-21 CSV export, from a set of 14 (the existing 10 plus 4 fields already loaded by `getAdminDashboardData()` but never exported), with the choice remembered per-browser.

**Architecture:** Extract a shared column registry (`lib/export/columns.ts`) that both the export route and a new picker component read, so labels/order can never drift between what the admin sees and what's actually in the CSV. The route gains a `cols` query param (comma-separated keys; missing/invalid falls back to the original 10, so existing bookmarked export links keep working). The UI gains a small custom dropdown panel (no new dependency — this repo has no Radix Popover installed) next to the existing Export button, backed by `localStorage`.

**Tech Stack:** Next.js 16 App Router route handler, React (client component), Vitest.

**Spec:** Scoped in chat during brainstorming on 2026-09-08 (bounded extension of the existing `/api/admin/export` route and `AdminDashboardMatrix.tsx` — no separate spec file). Key decisions carried into this plan:
- Column universe: the current 10 plus Due Date, Overdue (Yes/No), Internship Start, Internship End — 14 total.
- Toggle only, fixed CSV column order (no drag-to-reorder).
- Selection persists via `localStorage`, not the backend.
- Missing/invalid `cols` param on the route falls back to the original 10 columns, so nothing existing breaks.

## Global Constraints

- The route must remain backward-compatible: a request with no `cols` param produces byte-for-byte the same header and column order as today.
- Every export stays audit-logged (`EXPORT_DASHBOARD_CSV`), now including which columns were selected.
- No new npm dependency for the picker UI.

---

## Task 1: Shared column registry

**Files:**
- Create: `lib/export/columns.ts`
- Test: `__tests__/export-columns.test.ts`

**Interfaces:**
- Consumes: `AdminDashboardData` types from `lib/data/dashboard.ts` (`DashboardIntern`,
  `DashboardRequirement`, `DashboardSubmission`).
- Produces: `EXPORT_COLUMNS: ExportColumn[]`, `DEFAULT_EXPORT_COLUMN_KEYS: string[]`,
  and the `ExportColumn` interface (`{ key: string; label: string; getValue(intern, req, sub, state): string }`).
  Task 2 (route) and Task 3 (picker UI) both import from this file by these exact names.

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/export-columns.test.ts`
Expected: FAIL — `lib/export/columns.ts` does not exist yet.

- [ ] **Step 3: Write the column registry**

```typescript
// lib/export/columns.ts
//
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/export-columns.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/export/columns.ts __tests__/export-columns.test.ts
git commit -m "$(cat <<'EOF'
Extract FR-21 export column registry as shared source of truth

Single definition of the 14 selectable export columns (existing 10 + Due Date,
Overdue, Internship Start, Internship End), so the export route and the
upcoming column-picker UI can't drift apart on labels or values.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Route reads `cols` and uses the registry

**Files:**
- Modify: `src/app/api/admin/export/route.ts`
- Test: `__tests__/admin-export.test.ts` (new file)

**Interfaces:**
- Consumes: `EXPORT_COLUMNS`, `DEFAULT_EXPORT_COLUMN_KEYS` from `lib/export/columns.ts` (Task 1).
- Produces: the route now accepts `?cols=key1,key2,...`. No other task depends on this
  route's internals directly.

- [ ] **Step 1: Write the failing tests**

```typescript
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
    expect(header).toBe('"Intern Name","Intern Email","School","Batch","Requirement","State","Submitted Date","Approved Date","Approver","Current Holder"');
  });

  it('produces a header matching a custom subset, in registry order', async () => {
    const res = await GET(makeRequest('?cols=state,intern_email,overdue'));
    const csv = await res.text();
    const [header, row1] = csv.split('\n');
    // Registry order is state, then intern_email is earlier in EXPORT_COLUMNS than overdue --
    // but the route must render in the ORDER THE ADMIN SELECTED is not required; it must
    // render in a stable, registry-defined order so the CSV is deterministic regardless of
    // how `cols` was ordered in the query string.
    expect(header).toBe('"Intern Email","State","Overdue"');
    expect(row1).toBe('"a@example.com","APPROVED","No"');
  });

  it('falls back to the default 10 when cols contains no recognized keys', async () => {
    const res = await GET(makeRequest('?cols=not_a_real_column'));
    const csv = await res.text();
    const header = csv.split('\n')[0];
    expect(header).toBe('"Intern Name","Intern Email","School","Batch","Requirement","State","Submitted Date","Approved Date","Approver","Current Holder"');
  });

  it('records the selected columns in the audit log payload', async () => {
    await GET(makeRequest('?cols=intern_email,due_date'));
    const payload = auditInsert.mock.calls[0][0] as Row;
    expect(payload.action).toBe('EXPORT_DASHBOARD_CSV');
    expect((payload.payload as Row).columns).toEqual(['intern_email', 'due_date']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/admin-export.test.ts`
Expected: FAIL — the route doesn't read `cols` yet, doesn't use the registry, and its
audit payload has no `columns` field. (The first "backward compat" test may already
pass since it matches current hardcoded behavior — that's fine, it exists to catch a
regression once Step 3 lands, not because it must fail now.)

- [ ] **Step 3: Rewrite the route to use the registry**

Replace the header/row-building logic in `src/app/api/admin/export/route.ts`. The full
new file:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/admin-export.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/export/route.ts __tests__/admin-export.test.ts
git commit -m "$(cat <<'EOF'
Support column selection on the FR-21 CSV export via ?cols=

Missing/unrecognized cols falls back to the original 10 columns, so every
existing export link keeps producing identical output. Selected columns are
now recorded in the export's audit log entry.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ColumnPicker` component

**Files:**
- Create: `src/components/ColumnPicker.tsx`

**Interfaces:**
- Consumes: `EXPORT_COLUMNS` from `lib/export/columns.ts` (Task 1).
- Produces: `ColumnPicker` component with props
  `{ selectedKeys: string[]; onChange: (keys: string[]) => void }`. Task 4 renders it
  and owns the `selectedKeys` state + localStorage sync.

There is no jsdom test environment configured in this repo (`vitest.config.ts` sets
`environment: 'node'`, and `jsdom` is not an installed dependency — `@testing-library/react`
is present but unused for actual component rendering anywhere in this codebase today).
Adding one is out of scope for this feature. Verify this component by browser inspection
in Task 4's step, not an automated render test.

- [ ] **Step 1: Write the component**

```typescript
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { EXPORT_COLUMNS } from '@lib/export/columns';
import { Button } from './ui/button';

interface ColumnPickerProps {
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}

export function ColumnPicker({ selectedKeys, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const toggleKey = (key: string) => {
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter((k) => k !== key));
    } else {
      onChange([...selectedKeys, key]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="border-border-default text-text-primary hover:bg-surface-hover font-semibold gap-1.5"
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        Columns ({selectedKeys.length})
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border-default bg-surface-bg shadow-lg p-3 space-y-1.5 max-h-80 overflow-y-auto"
        >
          {EXPORT_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 text-xs text-text-primary cursor-pointer hover:bg-surface-hover rounded-lg px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={selectedKeys.includes(col.key)}
                onChange={() => toggleKey(col.key)}
                className="rounded border-border-default text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ColumnPicker.tsx
git commit -m "$(cat <<'EOF'
Add ColumnPicker component for FR-21 export column selection

No new dependency: a self-contained dropdown panel, since this repo has no
Radix Popover installed. Verified visually in the next task once it's wired
into AdminDashboardMatrix.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire into `AdminDashboardMatrix`

**Files:**
- Modify: `src/components/AdminDashboardMatrix.tsx:1-18` (imports/state), `:131-151` (`handleExport`), `:283-292` (render)

**Interfaces:**
- Consumes: `ColumnPicker` (Task 3), `DEFAULT_EXPORT_COLUMN_KEYS` (Task 1), the route's
  `cols` param (Task 2).
- Produces: nothing later tasks depend on — this is the last task in this plan.

- [ ] **Step 1: Add the import and persisted selection state**

In `src/components/AdminDashboardMatrix.tsx`, add to the imports (near line 6):

```typescript
import { ColumnPicker } from './ColumnPicker';
import { DEFAULT_EXPORT_COLUMN_KEYS } from '@lib/export/columns';
```

Add state near the other `useState` calls (after `const [isExporting, setIsExporting] = useState(false);`, line 18):

```typescript
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_EXPORT_COLUMN_KEYS);

  // Restore the admin's last column selection for this browser. Falls back silently to
  // the default 10 on any storage error (private browsing, cleared site data, etc) --
  // this is a convenience, never something the export depends on to function.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('intern-docs:admin-export-columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) {
          setSelectedColumns(parsed);
        }
      }
    } catch {
      // Ignore -- default selection stands.
    }
  }, []);

  const handleColumnsChange = (keys: string[]) => {
    setSelectedColumns(keys);
    try {
      window.localStorage.setItem('intern-docs:admin-export-columns', JSON.stringify(keys));
    } catch {
      // Ignore -- selection still works for this session, just won't persist.
    }
  };
```

This needs `useEffect` added to the React import (line 3): change
`import React, { useState, useMemo } from 'react';` to
`import React, { useState, useMemo, useEffect } from 'react';`.

- [ ] **Step 2: Include `cols` in the export fetch**

In `handleExport` (`src/components/AdminDashboardMatrix.tsx:136`), change the fetch URL:

```typescript
      const colsQuery = selectedColumns.length > 0 ? `&cols=${selectedColumns.join(',')}` : '';
      const res = await fetch(`/api/admin/export?req=${filterReq}&state=${filterState}&appr=${filterApprover}&school=${encodeURIComponent(filterSchool)}&batch=${encodeURIComponent(filterBatch)}${colsQuery}`);
```

- [ ] **Step 3: Render the picker next to the Export button**

In the JSX around the Export button (`src/components/AdminDashboardMatrix.tsx:283-292`),
add the picker immediately before it:

```typescript
        <ColumnPicker selectedKeys={selectedColumns} onChange={handleColumnsChange} />
        <Button
          onClick={handleExport}
          disabled={isExporting}
          variant="outline"
          className="border-brand-primary text-brand-primary hover:bg-brand-primary/5 hover:border-brand-primary hover:text-brand-primary font-semibold gap-1.5"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </Button>
```

- [ ] **Step 4: Verify in the browser**

Start the dev server, navigate to `/admin` (the dashboard route rendering
`AdminDashboardMatrix`), confirm:
- The "Columns (10)" button appears next to Export CSV.
- Clicking it opens a checklist of all 14 columns, the original 10 pre-checked.
- Unchecking a column and clicking Export CSV produces a CSV missing that column
  (open the downloaded file to confirm).
- Reloading the page and reopening the picker shows the same (persisted) selection.
- Clicking outside the picker, or pressing Escape, closes it.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/AdminDashboardMatrix.tsx
git commit -m "$(cat <<'EOF'
Wire column picker into the admin CSV export

Selection persists per-browser via localStorage; falls back to the default
10 columns on any storage error.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** 14-column universe ✓ (Task 1), popover-style picker without a new
  dependency ✓ (Task 3), persistence ✓ (Task 4), toggle-only fixed order ✓ (registry
  order is always used for rendering, regardless of check/query order — asserted
  explicitly in Task 2's second test).
- **Type consistency:** `ExportColumn`, `EXPORT_COLUMNS`, `DEFAULT_EXPORT_COLUMN_KEYS`
  names are identical across Tasks 1, 2, 3.
- **No placeholders:** every step has literal code, not a description of code.
- **Known gap, explicitly out of scope:** no automated render test for `ColumnPicker`
  itself, since this repo has no jsdom/component-test infrastructure. Verified by
  browser inspection in Task 4 instead — noted rather than silently skipped.
