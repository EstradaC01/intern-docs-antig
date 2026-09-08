# Bulk Export of Approved Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an intern download all of their `APPROVED` submissions' signed outputs as one zip, on demand, before `retention-sweep.ts` permanently deletes them 30 days after approval.

**Architecture:** A new route (`GET /api/intern/export-approved`) resolves the calling intern's session, fetches every `APPROVED` submission's latest signed output, verifies each one's SHA-256 (reusing the existing verification logic from `getSubmissionSignedDownloadUrl`, extracted into a shared helper), zips the verified bytes with `JSZip`, and streams the result straight back — nothing is written to Storage or any other table as a side effect of building the zip. One `BULK_EXPORT_APPROVED_DOCS` audit entry per request. A button on the intern's dashboard triggers it via the same fetch-blob-download pattern the admin CSV export already uses.

**Tech Stack:** Next.js 16 App Router route handler (Node runtime), `jszip` (new dependency), Supabase Storage, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-bulk-export-approved-documents-design.md` — read it alongside this plan; the sections below assume its decisions (self-service only, signed-output-only, no server-side persistence, buffered `JSZip` over streaming `archiver`) without re-litigating them.

## Global Constraints

- No `internId` parameter anywhere in this feature — every read is scoped to the session's own `user.id`, so there is no cross-intern access surface to defend (per the spec's Architecture section).
- Nothing the zip-building process touches gets written to Storage or persisted as a new copy of personal data (per the spec's Non-goals).
- One file failing hash verification must not fail the whole export — it's skipped, noted in a `_skipped.txt` manifest inside the zip, and the rest of the files are still returned (per the spec's Error handling section).
- One `BULK_EXPORT_APPROVED_DOCS` audit entry per request, additive to (not a replacement for) FR-17's per-download logging intent (per the spec's Audit logging section).

---

## Task 1: Extract and export `downloadAndVerifyFile`

**Files:**
- Modify: `lib/data/submissions.ts:1357-1399` (extract), `:1334-1452` (`getSubmissionSignedDownloadUrl`'s use of the extracted logic)

**Interfaces:**
- Produces: `export async function downloadAndVerifyFile(filePath: string, expectedHash: string, submissionId: string): Promise<{ buffer: Buffer; hash: string }>`.
  Throws (after logging `TAMPER_ALERT_HASH_MISMATCH`) if the computed hash doesn't match
  `expectedHash`. Task 2 imports this by this exact name and signature.

This is a pure refactor — `getSubmissionSignedDownloadUrl`'s existing behavior must be
byte-for-byte unchanged. It's already covered by `__tests__/adversarial.test.ts` and
`__tests__/audit-coverage.test.ts` (both reference `TAMPER_ALERT_HASH_MISMATCH` /
`getSubmissionSignedDownloadUrl` today) — this task's correctness check is that those
keep passing, not a new test file.

- [ ] **Step 1: Confirm the existing safety net**

Run: `npx vitest run __tests__/adversarial.test.ts __tests__/audit-coverage.test.ts`
Expected: PASS. (Baseline before touching the code — if either is already broken, stop
and investigate before proceeding; this task must not be the thing that makes them fail
later with no way to tell whether it was pre-existing.)

- [ ] **Step 2: Extract the helper**

In `lib/data/submissions.ts`, add this new exported function directly above
`getSubmissionSignedDownloadUrl` (before current line 1330's docstring comment):

```typescript
/**
 * Downloads a file from the `submissions` bucket (authenticated user client, falling
 * back to the admin client) and verifies its SHA-256 against the recorded hash. Logs
 * TAMPER_ALERT_HASH_MISMATCH and throws on mismatch. Shared by every caller that needs
 * verified file bytes -- single-document signed-URL issuance
 * (getSubmissionSignedDownloadUrl below) and the bulk approved-documents export.
 */
export async function downloadAndVerifyFile(
  filePath: string,
  expectedHash: string,
  submissionId: string
): Promise<{ buffer: Buffer; hash: string }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  let fileBlob: Blob | null = null;
  const { data: userBlob, error: userDownloadErr } = await supabase.storage
    .from('submissions')
    .download(filePath);

  if (userBlob) {
    fileBlob = userBlob;
  } else {
    const { data: adminBlob, error: adminErr } = await adminClient.storage
      .from('submissions')
      .download(filePath);

    if (adminBlob) {
      fileBlob = adminBlob;
    } else {
      throw new Error(`Failed to fetch file from storage: ${userDownloadErr?.message || adminErr?.message || 'Object not found'}`);
    }
  }

  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const hashMatches = actualHash.toLowerCase() === expectedHash.toLowerCase();
  if (!hashMatches) {
    const reqHeaders = await headers();
    const ip = reqHeaders.get('x-forwarded-for') || 'unknown';

    await adminClient.from('audit_log').insert({
      actor_id: null,
      action: 'TAMPER_ALERT_HASH_MISMATCH',
      target_id: submissionId,
      target_type: 'submissions',
      source_ip: ip,
    });

    throw new Error('Integrity Warning: Document SHA-256 hash does not match recorded approval checksum.');
  }

  return { buffer: fileBuffer, hash: actualHash };
}
```

- [ ] **Step 3: Replace the inline logic in `getSubmissionSignedDownloadUrl`**

Replace current lines 1357-1399 (from `const supabase = await createClient();` through
the closing of the hash-mismatch `if` block) with:

```typescript
  const { hash: actualHash } = await downloadAndVerifyFile(filePathToDownload, expectedHash, submissionId);

  const supabase = await createClient();
  const adminClient = createAdminClient();

```

(The function still needs its own local `supabase`/`adminClient` afterward for the
signed-URL generation and audit-log steps further down, which are unchanged — only the
download+hash-verify block is replaced by the single call above.)

- [ ] **Step 4: Run the safety-net tests again**

Run: `npx vitest run __tests__/adversarial.test.ts __tests__/audit-coverage.test.ts`
Expected: PASS, identical to Step 1's baseline.

- [ ] **Step 5: Run the full suite, typecheck, and coverage**

Run: `npx vitest run && npx tsc --noEmit && npm run coverage`
Expected: PASS. Check the coverage report doesn't drop `lib/data/submissions.ts` below
the 70% threshold configured in `vitest.config.ts` (extracting a function without adding
callers to it yet should not reduce coverage, since the extracted code is exercised via
the same existing `getSubmissionSignedDownloadUrl` call paths).

- [ ] **Step 6: Commit**

```bash
git add lib/data/submissions.ts
git commit -m "$(cat <<'EOF'
Extract downloadAndVerifyFile from getSubmissionSignedDownloadUrl

Pure refactor, no behavior change -- makes the SHA-256 download-and-verify
step reusable for the upcoming bulk approved-documents export, which needs
the verified bytes themselves rather than a signed URL.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Data layer + API route

**Files:**
- Create: `lib/data/bulk-export.ts`
- Create: `src/app/api/intern/export-approved/route.ts`
- Test: `__tests__/export-approved.test.ts`
- Modify: `package.json` (add `jszip` dependency)

**Interfaces:**
- Consumes: `downloadAndVerifyFile` from `lib/data/submissions.ts` (Task 1).
- Produces: `getApprovedDocumentsForExport(): Promise<{ files: { requirementName: string; buffer: Buffer }[]; skipped: { requirementName: string; reason: string }[] }>`
  in `lib/data/bulk-export.ts`, consumed only by the route in this same task.
  `GET` handler at `src/app/api/intern/export-approved/route.ts`. Task 3 (UI) calls this
  route by its exact path, `GET /api/intern/export-approved`.

- [ ] **Step 1: Install `jszip`**

```bash
npm install jszip
```

- [ ] **Step 2: Write the failing tests**

Create `__tests__/export-approved.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import JSZip from 'jszip';

type Row = Record<string, unknown>;

let submissionRows: Row[] = [];
let mockUser: { id: string; email: string } | null = { id: 'intern-1', email: 'intern@example.com' };
const storageFiles: Record<string, Buffer> = {};

function hashOf(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* eslint-disable @typescript-eslint/no-unused-vars */
const auditInsert = vi.fn(async (_row: Row) => ({ error: null }));

function makeStorageBucket() {
  return {
    download: async (path: string) => {
      const buf = storageFiles[path];
      if (!buf) return { data: null, error: new Error('not found') };
      return {
        data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
        error: null,
      };
    },
  };
}

vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => (mockUser ? { data: { user: mockUser }, error: null } : { data: { user: null }, error: new Error('no session') }) },
    storage: { from: () => makeStorageBucket() },
  }),
}));

vi.mock('../lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'submissions') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: submissionRows, error: null }) }) }) };
      }
      if (table === 'audit_log') {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected admin table in test: ${table}`);
    },
    storage: { from: () => makeStorageBucket() },
  }),
}));

import { GET } from '../src/app/api/intern/export-approved/route';

beforeEach(() => {
  vi.clearAllMocks();
  submissionRows = [];
  mockUser = { id: 'intern-1', email: 'intern@example.com' };
  for (const k of Object.keys(storageFiles)) delete storageFiles[k];
});

function approvedSubmission(id: string, reqName: string, filePath: string, buf: Buffer, hash?: string) {
  storageFiles[filePath] = buf;
  return {
    id,
    requirements: { name: reqName },
    approvals: [{ step: 1, created_at: '2026-01-01T00:00:00Z', signed_pdf_url: filePath, file_hash: hash ?? hashOf(buf) }],
  };
}

describe('GET /api/intern/export-approved', () => {
  it('returns a zip with one entry per approved document', async () => {
    submissionRows = [
      approvedSubmission('sub-1', 'DTR', 'sub-1/signed.pdf', Buffer.from('pdf-bytes-1')),
      approvedSubmission('sub-2', 'Waiver', 'sub-2/signed.pdf', Buffer.from('pdf-bytes-2')),
    ];

    const res = await GET();

    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['DTR.pdf', 'Waiver.pdf']);
  });

  it('returns 404 when there are no approved documents', async () => {
    submissionRows = [];
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('skips a file that fails hash verification, keeps the rest, and notes it in _skipped.txt', async () => {
    submissionRows = [
      approvedSubmission('sub-1', 'DTR', 'sub-1/signed.pdf', Buffer.from('good-bytes')),
      approvedSubmission('sub-2', 'Waiver', 'sub-2/signed.pdf', Buffer.from('tampered-bytes'), 'f'.repeat(64)),
    ];

    const res = await GET();

    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['DTR.pdf', '_skipped.txt']);
    const manifest = await zip.files['_skipped.txt'].async('string');
    expect(manifest).toContain('Waiver');

    const tamperEntry = auditInsert.mock.calls.map((c) => c[0] as Row).find((r) => r.action === 'TAMPER_ALERT_HASH_MISMATCH');
    expect(tamperEntry).toBeDefined();
  });

  it('logs one BULK_EXPORT_APPROVED_DOCS audit entry with the file count', async () => {
    submissionRows = [approvedSubmission('sub-1', 'DTR', 'sub-1/signed.pdf', Buffer.from('bytes'))];

    await GET();

    const entry = auditInsert.mock.calls.map((c) => c[0] as Row).find((r) => r.action === 'BULK_EXPORT_APPROVED_DOCS');
    expect(entry).toBeDefined();
    expect((entry!.payload as Row).count).toBe(1);
  });

  it('returns 401 when there is no session', async () => {
    mockUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run __tests__/export-approved.test.ts`
Expected: FAIL — `lib/data/bulk-export.ts` and
`src/app/api/intern/export-approved/route.ts` don't exist yet.

- [ ] **Step 4: Write the data layer**

Create `lib/data/bulk-export.ts`:

```typescript
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
    // @ts-expect-error nested field mapping
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
```

- [ ] **Step 5: Write the route**

Create `src/app/api/intern/export-approved/route.ts`:

```typescript
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

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${(user.email || user.id).replace(/[^a-zA-Z0-9._-]/g, '_')}_approved_documents_${new Date().toISOString().split('T')[0]}.zip"`,
    },
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run __tests__/export-approved.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/data/bulk-export.ts src/app/api/intern/export-approved/route.ts __tests__/export-approved.test.ts
git commit -m "$(cat <<'EOF'
Add bulk export of an intern's approved documents

New GET /api/intern/export-approved: session-scoped only (no internId param),
zips each APPROVED submission's verified signed output with JSZip, nothing
persisted server-side. A hash-mismatch on one file skips that file (noted in
a _skipped.txt manifest inside the zip) rather than failing the whole export.
One BULK_EXPORT_APPROVED_DOCS audit entry per request.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Dashboard button

**Files:**
- Modify: `src/components/InternChecklist.tsx:1-11` (imports unaffected, no new import needed), `:48-66` (state), `:233-245` (header JSX)

**Interfaces:**
- Consumes: `GET /api/intern/export-approved` (Task 2), by fetch — no prop threading
  from `src/app/intern/page.tsx` needed, same as `AdminDashboardMatrix.handleExport`'s
  pattern of hitting its route directly.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add export state and handler**

In `src/components/InternChecklist.tsx`, add near the existing state
(`:48-54`, after `const [downloadError, setDownloadError] = useState<string | null>(null);`):

```typescript
  const [isExportingApproved, setIsExportingApproved] = useState(false);
  const [exportApprovedError, setExportApprovedError] = useState<string | null>(null);
```

Add the handler near the other handlers (after the component's other `handle*`
functions, or directly before the `return (`):

```typescript
  const handleExportApproved = async () => {
    setIsExportingApproved(true);
    setExportApprovedError(null);
    try {
      const res = await fetch('/api/intern/export-approved');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approved_documents_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setExportApprovedError(msg);
    } finally {
      setIsExportingApproved(false);
    }
  };

  const hasApprovedDocuments = items.some((i) => i.state === 'APPROVED' || i.state === 'COMPLETED');
```

- [ ] **Step 2: Add the button and its error banner to the header**

In the "Header Profile Summary" block (`src/components/InternChecklist.tsx:233-245`),
add the button next to `ProgressBar`:

```typescript
      {/* Header Profile Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-bg p-6 rounded-xl border border-border-default shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Internship Document Checklist</h2>
          <p className="text-sm text-text-muted mt-1">
            {internEmail ? `Logged in as ${internEmail}` : 'Track your required submission progress.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasApprovedDocuments && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportApproved}
              disabled={isExportingApproved}
              className="border-brand-primary text-brand-primary hover:bg-brand-primary/5 font-semibold"
            >
              {isExportingApproved ? 'Preparing…' : 'Download all approved documents'}
            </Button>
          )}
          <ProgressBar
            completed={items.filter((i) => i.state === 'APPROVED' || i.state === 'COMPLETED').length}
            total={items.length}
          />
        </div>
      </div>
      {exportApprovedError && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 p-3.5 text-xs text-rose-800 border border-rose-200">
          <span>{exportApprovedError}</span>
          <button
            type="button"
            onClick={() => setExportApprovedError(null)}
            aria-label="Dismiss error"
            className="shrink-0 p-0.5 rounded text-rose-600 hover:text-rose-800"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
```

(`XIcon` is already imported at the top of this file for the existing `downloadError`
banner — no new import needed.)

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/InternChecklist.tsx`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Start the dev server, sign in as an intern with at least one `APPROVED` submission:
- The "Download all approved documents" button appears next to the progress bar.
- Clicking it downloads a `.zip` file; open it and confirm it contains a PDF per
  approved requirement.
- Sign in as an intern with zero approved submissions: confirm the button does not
  render at all.
- (Optional, harder to trigger) confirm the error banner appears and is dismissible if
  the fetch fails.

- [ ] **Step 5: Commit**

```bash
git add src/components/InternChecklist.tsx
git commit -m "$(cat <<'EOF'
Add "Download all approved documents" button to the intern dashboard

Enabled once the intern has at least one APPROVED submission. Same
fetch-blob-download pattern the admin CSV export already uses.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Point the deletion-warning email at it

**Files:**
- Modify: `lib/email/templates.ts:32-36`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent copy change).
- Produces: nothing later tasks depend on — this is the last task in this plan.

- [ ] **Step 1: Update the template**

In `lib/email/templates.ts`, replace the `deletionWarning` template:

```typescript
  deletionWarning: (reqName: string, daysRemaining: number) => `
    <p><strong>Warning: Data Retention Policy</strong></p>
    <p>Your document for <strong>${reqName}</strong> is scheduled for permanent deletion in ${daysRemaining} days according to the retention policy.</p>
    <p>Log in to the InternDocs portal and use "Download all approved documents" on your dashboard to save a copy before the deadline.</p>
  `,
```

(Only the third `<p>` line changes — from the generic "log in and download it" to
naming the specific button added in Task 3.)

- [ ] **Step 2: Check for an existing test on this template's exact copy**

Run: `grep -rn "deletionWarning" __tests__/`
If any test asserts the old exact string ("log in and download it"), update that
assertion to match the new copy. (As of this plan's writing, no such test exists --
`deletionWarning` is only referenced from `lib/jobs/retention-sweep.ts` itself -- but
this step protects against that having changed by the time this task is executed.)

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/email/templates.ts
git commit -m "$(cat <<'EOF'
Point the deletion-warning email at the new bulk-download button

Replaces the generic "log in and download it" line with a direct mention of
the "Download all approved documents" button, so the 14/7/1-day warnings
point at the feature that solves the problem they're warning about.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** self-service-only scope ✓ (Task 2, no `internId` param anywhere),
  signed-output-only ✓ (Task 2 reads `approvals.signed_pdf_url` exclusively), no
  server-side persistence ✓ (Task 2's route builds and returns the zip in one request,
  writes nothing but the audit entry), buffered `JSZip` ✓ (Task 2), hash-mismatch skip
  with manifest ✓ (Task 2, tested explicitly), one bulk audit entry ✓ (Task 2, tested),
  dashboard button + email update ✓ (Tasks 3, 4).
- **Type consistency:** `downloadAndVerifyFile`'s return shape (`{ buffer: Buffer; hash: string }`)
  from Task 1 is consumed correctly in both Task 1's own caller
  (`getSubmissionSignedDownloadUrl`, destructuring `{ hash: actualHash }`) and Task 2's
  `getApprovedDocumentsForExport` (destructuring `{ buffer }`).
- **No placeholders:** every step has literal code, not a description of code.
- **Known gap, explicitly out of scope:** no automated test for the `InternChecklist`
  button itself (Task 3), since this repo has no jsdom/component-test infrastructure —
  same gap noted in the other three plans from this brainstorming session. Verified by
  browser inspection instead.
