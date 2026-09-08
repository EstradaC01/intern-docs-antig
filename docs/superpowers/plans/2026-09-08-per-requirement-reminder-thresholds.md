# Per-Requirement Reminder Thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin set an optional per-requirement override for the FR-19 approver-reminder threshold, so a requirement isn't stuck sharing its routing template's `sla_days` with every other requirement on that template.

**Architecture:** Add a nullable `custom_reminder_days` column to `requirements` (null = fall back to the routing template's `sla_days`, unchanged behavior). Thread it through the existing create-requirement form → server action → `createRequirement()` → daily digest's SLA resolution. No new UI surface — it's one more field on the existing "Create Requirement" modal, since `requirements` has no edit UI today (only create + template upload).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres), Zod, Vitest.

**Spec:** This plan was scoped directly in chat during brainstorming on 2026-09-08 (no separate written spec file — classified as a bounded extension of the existing FR-19 digest and requirement-creation flow). Key decisions carried into this plan:
- Overrides the approver-reminder threshold only. The flat 5-working-day admin escalation (fixed in the prior FR-19 bugfix, `lib/jobs/daily-digest.ts`) is untouched.
- Same 1-30 day bounds as `routing_templates.sla_days` (`lib/data/routing.ts:18`).
- Create-only field (empty = null = use template default) — there is no requirement-edit UI to add a "clear" affordance to.
- The digest already reads the *live* template SLA, not the frozen `routing_snapshot` `ApproverQueue.tsx` uses for its on-screen badge — this plan extends that existing live-read pattern with `custom_reminder_days` and does not touch `routing_snapshot` or the queue's SLA badge.

## Global Constraints

- Same 1-30 day bounds as `routing_templates.sla_days` (`lib/data/routing.ts:18`).
- `null` on `custom_reminder_days` must mean "no override" everywhere it's read — never coerce it to a number before storage.
- No changes to the admin-escalation (flat 5-day) logic.
- No changes to `ApproverQueue.tsx`'s SLA badge or `routing_snapshot` freezing.

---

## Task 1: Migration — add `custom_reminder_days` to `requirements`

**Files:**
- Create: `supabase/migrations/20240101000024_add_custom_reminder_days.sql`

**Interfaces:**
- Produces: `requirements.custom_reminder_days` (nullable `INTEGER`, `CHECK` constraint `chk_custom_reminder_days_range` enforcing `NULL OR (custom_reminder_days BETWEEN 1 AND 30)`).

- [ ] **Step 1: Write the migration**

```sql
-- 20240101000024_add_custom_reminder_days.sql
--
-- FR-19: lets an admin override the approver-reminder threshold for one specific
-- requirement, instead of every requirement on a shared routing_template being stuck
-- with that template's sla_days. NULL means "no override -- use the routing template's
-- sla_days", which is every existing row's behavior today, unchanged.
ALTER TABLE public.requirements
ADD COLUMN custom_reminder_days INTEGER;

ALTER TABLE public.requirements
ADD CONSTRAINT chk_custom_reminder_days_range
CHECK (
  custom_reminder_days IS NULL OR
  (custom_reminder_days >= 1 AND custom_reminder_days <= 30)
);
```

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `npx supabase db reset` (or however this project applies migrations locally --
check `docs/14-backup-restore-runbook.md` if `supabase db reset` isn't the right command
for this environment).
Expected: migration `20240101000024_add_custom_reminder_days.sql` applies with no error,
and `\d public.requirements` (or equivalent) shows the new nullable `custom_reminder_days`
column and the `chk_custom_reminder_days_range` constraint.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20240101000024_add_custom_reminder_days.sql
git commit -m "$(cat <<'EOF'
Add nullable custom_reminder_days column to requirements

FR-19: lets an admin override the approver-reminder threshold per requirement
instead of every requirement on a shared routing_template sharing one sla_days.
NULL preserves today's behavior for every existing row.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `requirementSchema` and `createRequirement()` accept the new field

**Files:**
- Modify: `lib/data/requirements.ts:10-21` (schema), `lib/data/requirements.ts:69-83` (insert)
- Test: `__tests__/requirements.test.ts` (new file)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `requirementSchema` accepts an optional `custom_reminder_days: number | null`;
  `createRequirement()` persists it. Later tasks (3, 4) rely on this field name exactly.

- [ ] **Step 1: Write the failing test**

There is no existing `__tests__/requirements.test.ts`. Create it, mocking
`lib/supabase/server` and `lib/supabase/admin` the same way `__tests__/retention-sweep.test.ts`
mocks `lib/supabase/admin` (see that file for the pattern this codebase uses).

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const insertedRows: Row[] = [];
/* eslint-disable @typescript-eslint/no-unused-vars */
const auditInsert = vi.fn(async (_row: Row) => ({ error: null }));

function makeAdminQueryBuilder(table: string) {
  if (table === 'requirements') {
    return {
      insert: (row: Row) => ({
        select: () => ({
          single: async () => {
            const newRow = { id: 'req-new', ...row };
            insertedRows.push(newRow);
            return { data: newRow, error: null };
          },
        }),
      }),
    };
  }
  if (table === 'audit_log') {
    return { insert: auditInsert };
  }
  throw new Error(`Unexpected admin table in test: ${table}`);
}

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeAdminQueryBuilder(table) }),
}));

vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }) };
      }
      throw new Error(`Unexpected user-client table in test: ${table}`);
    },
  }),
}));

// next/headers is already globally mocked in __tests__/setup.ts -- no need to mock it here.

import { createRequirement } from '../lib/data/requirements';

const baseInput = {
  name: 'DTR',
  description: '',
  accepted_types: ['application/pdf'],
  max_size_mb: 20,
  due_date_type: 'relative' as const,
  due_date_value: '30',
  routing_template_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
});

describe('createRequirement — custom_reminder_days', () => {
  it('persists a valid custom_reminder_days override', async () => {
    await createRequirement({ ...baseInput, custom_reminder_days: 4 });
    expect(insertedRows[0].custom_reminder_days).toBe(4);
  });

  it('persists null when no override is given', async () => {
    await createRequirement({ ...baseInput, custom_reminder_days: null });
    expect(insertedRows[0].custom_reminder_days).toBeNull();
  });

  it('rejects a value above the 30-day bound', async () => {
    await expect(createRequirement({ ...baseInput, custom_reminder_days: 31 })).rejects.toThrow();
  });

  it('rejects a value below the 1-day bound', async () => {
    await expect(createRequirement({ ...baseInput, custom_reminder_days: 0 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/requirements.test.ts`
Expected: FAIL — `custom_reminder_days` is not a recognized field on
`requirementSchema` (Zod strips unknown keys silently by default, so the assertion on
`insertedRows[0].custom_reminder_days` fails as `undefined`, and the bounds-rejection
tests fail because nothing rejects yet).

- [ ] **Step 3: Add the field to the schema and the insert**

In `lib/data/requirements.ts`, add to `requirementSchema` (after `routing_template_id`,
`lib/data/requirements.ts:17-20`):

```typescript
  custom_reminder_days: z.number().int().min(1).max(30).nullable().optional(),
```

In `createRequirement()`'s insert call (`lib/data/requirements.ts:69-83`), add:

```typescript
      custom_reminder_days: parsed.custom_reminder_days ?? null,
```

(add it alongside the other `parsed.*` fields in the `.insert({...})` object).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/requirements.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/data/requirements.ts __tests__/requirements.test.ts
git commit -m "$(cat <<'EOF'
Accept custom_reminder_days on requirement creation

FR-19 per-requirement override, 1-30 day bound matching routing_templates.sla_days.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Admin form field

**Files:**
- Modify: `src/components/AdminRequirementManager.tsx:8-16` (type), `:68-112` (state + submit), `:293-318` (form JSX)

**Interfaces:**
- Consumes: `CreateRequirementInput` type (this task adds a field to it); `createRequirement`'s
  behavior from Task 2 (field name `custom_reminder_days`, `number | null`).
- Produces: nothing later tasks depend on — this is a leaf UI task.

- [ ] **Step 1: Add the field to the `CreateRequirementInput` interface**

In `src/components/AdminRequirementManager.tsx:8-16`:

```typescript
export interface CreateRequirementInput {
  name: string;
  description?: string;
  accepted_types: string[];
  max_size_mb: number;
  due_date_type: 'fixed' | 'relative';
  due_date_value: string;
  routing_template_id?: string | null;
  custom_reminder_days: number | null;
}
```

- [ ] **Step 2: Add form state**

Next to the other form state declarations (`src/components/AdminRequirementManager.tsx:74`,
right after `const [routingTemplateId, setRoutingTemplateId] = useState('');`):

```typescript
  const [customReminderDays, setCustomReminderDays] = useState('');
```

(kept as a string, same as `dueDateValue`, so the input can be empty without coercing to `0`.)

- [ ] **Step 3: Pass it through the submit handler**

In `handleReqSubmit` (`src/components/AdminRequirementManager.tsx:94-102`), add to the
`onCreateRequirement({...})` call:

```typescript
        custom_reminder_days: customReminderDays.trim() === '' ? null : Number(customReminderDays),
```

- [ ] **Step 4: Add the input to the form**

In the grid that currently holds Routing Template and Max Size
(`src/components/AdminRequirementManager.tsx:293-318`), add a third field. Change that
`grid-cols-2` to `grid-cols-3` and insert:

```typescript
                <div>
                  <label className="block font-semibold text-text-primary mb-1">
                    Custom Reminder Threshold (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={customReminderDays}
                    onChange={(e) => setCustomReminderDays(e.target.value)}
                    placeholder="Uses template default"
                    className="w-full rounded-xl border border-border-default p-2.5 text-text-primary focus:border-brand-primary outline-none"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    Optional. Overrides the routing template&apos;s SLA for the approver
                    reminder digest only. Leave blank to use the template default.
                  </p>
                </div>
```

- [ ] **Step 5: Reset the field when the modal closes/reopens**

The other form fields aren't explicitly reset on close either (existing behavior), so
match that: no reset logic needed. Confirm this by re-reading
`src/components/AdminRequirementManager.tsx:104-112` (`handleReqSubmit`'s success path) —
it doesn't reset `name`/`description`/etc. either, it just closes the modal and reloads
the page (`window.location.reload()`), which remounts the component with fresh state.
No code change for this step — it's a verification, not an edit.

- [ ] **Step 6: Verify in the browser**

Start the dev server (`preview_start` with the project's dev config, or `npm run dev`),
navigate to `/admin/requirements`, click "+ New Requirement", confirm the new "Custom
Reminder Threshold (days)" field appears between Routing Template and Max Size, accepts
a number, rejects (via the native `min`/`max` + server-side Zod validation surfacing the
error banner) a value outside 1-30, and that submitting with it blank still creates the
requirement successfully with `custom_reminder_days: null`.

- [ ] **Step 7: Commit**

```bash
git add src/components/AdminRequirementManager.tsx
git commit -m "$(cat <<'EOF'
Add custom reminder threshold field to the requirement creation form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Digest reads the override

**Files:**
- Modify: `lib/jobs/daily-digest.ts:27-36` (select), `:66-68` (sla resolution)
- Test: `__tests__/daily-digest.test.ts` (extend the existing file)

**Interfaces:**
- Consumes: `requirements.custom_reminder_days` column from Task 1.
- Produces: nothing later tasks depend on — this is the last task in this plan.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/daily-digest.test.ts`, inside the existing
`describe('runDailyDigest — FR-19 threshold, clock, and dedup', ...)` block (reuse the
file's existing `baseSubmission`, `NOW`, `SIX_WORKING_DAYS_AGO` etc. helpers already
defined there):

```typescript
  it('uses custom_reminder_days as the approver-reminder threshold when set', async () => {
    // 6 working days waited, template sla_days=2 (would normally trigger a reminder),
    // but this requirement's custom_reminder_days=10 means it should NOT be due yet.
    submissionRows = [
      baseSubmission({
        current_step_entered_at: SIX_WORKING_DAYS_AGO,
        updated_at: SIX_WORKING_DAYS_AGO,
        requirements: { id: 'req-1', name: 'DTR', custom_reminder_days: 10, routing_templates: { sla_days: 2 } },
      }),
    ];

    await runDailyDigest();

    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'approver1@example.com')).toBeUndefined();
  });

  it('falls back to the routing template sla_days when custom_reminder_days is null', async () => {
    const fourWorkingDaysAgo = new Date(2026, 0, 8, 9, 0, 0).toISOString();
    submissionRows = [
      baseSubmission({
        current_step_entered_at: fourWorkingDaysAgo,
        updated_at: fourWorkingDaysAgo,
        requirements: { id: 'req-1', name: 'DTR', custom_reminder_days: null, routing_templates: { sla_days: 2 } },
      }),
    ];

    await runDailyDigest();

    // 4 working days > template sla_days(2) -- reminder should fire, same as before this feature.
    expect(sendEmailWithRetry.mock.calls.find((c) => c[0] === 'approver1@example.com')).toBeDefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/daily-digest.test.ts`
Expected: FAIL on the first new test — `custom_reminder_days` isn't read yet, so the
digest uses `sla=2` from the template and sends a reminder at 6 waiting days, but the
test expects it to be suppressed by the 10-day override.

- [ ] **Step 3: Update the digest's SLA resolution**

In `lib/jobs/daily-digest.ts`, add `custom_reminder_days` to the `requirements(...)`
nested select (`lib/jobs/daily-digest.ts:27-36`):

```typescript
      requirements(id, name, custom_reminder_days, routing_templates(sla_days)),
```

Then change the `sla` resolution (`lib/jobs/daily-digest.ts:66-68`):

```typescript
    // Default SLA is 2 days if not specified in routing template. A requirement's own
    // custom_reminder_days, when set, overrides the shared routing_template's sla_days --
    // FR-19's approver-reminder threshold only, not the flat 5-day admin escalation above.
    // @ts-expect-error nested field mapping
    const sla = sub.requirements?.custom_reminder_days ?? sub.requirements?.routing_templates?.sla_days ?? 2;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/daily-digest.test.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/jobs/daily-digest.ts __tests__/daily-digest.test.ts
git commit -m "$(cat <<'EOF'
Digest honors a requirement's custom_reminder_days override

Falls back to the routing template's sla_days when unset, same as before.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** create-form field ✓ (Task 3), storage + bounds ✓ (Task 1, 2),
  digest read with fallback ✓ (Task 4). The explicitly-out-of-scope items (admin
  escalation threshold, `ApproverQueue` badge, `routing_snapshot`) have no task, by design.
- **Type consistency:** `custom_reminder_days: number | null` is consistent across
  Task 2 (schema), Task 3 (`CreateRequirementInput`), and Task 4 (read site).
- **No placeholders:** every step has literal code, not a description of code.
