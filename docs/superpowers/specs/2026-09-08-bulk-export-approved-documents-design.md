# Bulk export of an intern's approved documents before the 30-day delete

Status: approved by user 2026-09-08, ready for implementation planning.

## Purpose

Interns currently have no way to retrieve their approved documents as a batch. Each
document can only be downloaded one at a time via `getSubmissionSignedDownloadUrl()`
(`lib/data/submissions.ts:1334`), and the `deletionWarning` email
(`lib/email/templates.ts:32`) just says "log in and download it" with no bulk path. Once
`retention-sweep.ts` purges a submission's files 30 days after approval, they are gone
permanently (`purgeSubmissionFiles`, `lib/jobs/retention-sweep.ts:44-91`). This feature
gives interns a one-click way to get everything they're entitled to keep before that
deadline, without creating a new copy of personal data that itself needs a retention
policy.

## Scope

- **Who:** the intern, for their own documents only. No admin-on-behalf-of-intern path,
  no approver path. (Decided explicitly — a broader access model was considered and
  rejected to keep the RLS story identical to viewing one's own submissions today.)
- **What:** every submission in `APPROVED` state belonging to that intern. Only the
  signed/composited output (`approvals.signed_pdf_url`) goes in the zip — not the
  original uploaded version, which is superseded by the signed output as the record of
  approval.
- **When:** available at any time while the documents still exist (i.e., before
  `retention-sweep.ts` purges them), not gated to a specific window before deletion.
  Surfaced proactively via the dashboard button at all times and reinforced via the
  existing 14/7/1-day warning emails.

## Non-goals

- No persistence of the generated zip anywhere server-side. Every request rebuilds it
  from the same signed-output files the single-document download path already serves.
  This is a deliberate compliance choice: persisting a second copy of DTR-covered
  personal data would need its own expiry/cleanup logic added to `retention-sweep.ts`
  and its own RLS policy — a second retention-tracked surface this feature explicitly
  avoids creating.
- No streaming/chunked zip generation (see Approach below) — out of scope unless a
  future intern's approved-document count turns out to exceed what buffering in memory
  can handle.
- No changes to the admin-escalation or approver-reminder logic (FR-19) — unrelated to
  this feature.

## Architecture

New route: `GET /api/intern/export-approved`.

1. **Auth.** `createClient()` session check (existing pattern used across the app's
   route handlers). The route only ever acts on `user.id` from the session — there is no
   `internId` parameter, so there is no cross-intern access surface to defend.
2. **Query.** Fetch `submissions` where `intern_id = user.id AND state = 'APPROVED'`,
   joined to `requirements(name)` and the most recent non-deleted `approvals` row for
   each (`signed_pdf_url`, `file_hash`).
3. **Fetch + verify.** For each submission, download the signed-output bytes from
   Storage and verify the SHA-256 hash against the recorded `file_hash` — reusing the
   same defensive check `getSubmissionSignedDownloadUrl` performs
   (`lib/data/submissions.ts:1360-1399`), factored out into a shared helper rather than
   copy-pasted.
4. **Zip.** Add each verified file to a `JSZip` instance as
   `<sanitized-requirement-name>.pdf`, de-duplicating names if two requirements
   coincidentally produce the same sanitized name (append ` (2)`, ` (3)`, etc.).
5. **Respond.** Generate the zip buffer (`zip.generateAsync({ type: 'nodebuffer' })`) and
   return it as `application/zip` with
   `Content-Disposition: attachment; filename="<intern-email-or-id>_approved_documents_<YYYY-MM-DD>.zip"`.
   Nothing is written to Storage or any other table as a side effect of building the
   zip itself (the audit log entry below is the only write).

### Why buffered JSZip over streaming (`archiver`)

Approach considered and rejected: `archiver`, a true streaming zip writer, piped into a
Node `Response` stream. Rejected because (a) it's a Node-stream library that's awkward
to bridge into a Next.js App Router `Response` (needs a `ReadableStream` adapter and
forces the Node.js runtime rather than edge), and (b) the realistic per-intern document
count is bounded by the requirement checklist size — tens of documents, not thousands —
so buffering the whole zip in memory is safe within serverless memory/time limits.
Streaming is the right call if that assumption ever breaks; it isn't needed today.

Approach considered and rejected: client-side zipping, where the server issues a batch
of individually-signed URLs and the browser fetches and zips them with JSZip in the
browser. Rejected because it multiplies audit-log entries (one per file instead of one
bulk event), adds a client bundle dependency, and moves trust/complexity to the browser
for no benefit at this scale.

## Error handling

- **Zero approved documents:** `404` with a clear message. The dashboard button is
  disabled/hidden in this state so a click reaching an empty-result 404 should be rare,
  but the API must handle being hit directly regardless.
- **One file's hash fails verification:** log the same `TAMPER_ALERT_HASH_MISMATCH`
  audit action the single-download path uses, skip that file, and continue with the
  rest — an intern should not lose access to N-1 good documents because one is corrupt.
  The response is still a valid zip; a small manifest text file inside it
  (`_skipped.txt`) lists any requirement name that was skipped and why, so the intern
  isn't silently missing a file with no explanation.
- **Total failure** (e.g. Storage unreachable for the whole request): `500`, nothing
  partial returned — no zip is better than a zip that looks complete but silently
  dropped everything.

## Audit logging

One `BULK_EXPORT_APPROVED_DOCS` entry per request via the existing `audit_log` table:
`actor_id` = the intern, `target_type: 'users'`, `target_id` = the intern's own id,
`payload: { submission_ids: [...], count, skipped: [...] }`. This mirrors the existing
`EXPORT_DASHBOARD_CSV` pattern (`src/app/api/admin/export/route.ts:85-92`). This is
additive to, not a replacement for, FR-17/FR-24's per-download logging intent: it is one
bulk action, not N individual downloads, so it gets one bulk-shaped entry rather than N
`DOWNLOAD_DOCUMENT` rows.

## UI

- **Intern dashboard:** a "Download all approved documents" button, enabled once the
  intern has at least one `APPROVED` submission, disabled or hidden otherwise. Exact
  placement within the intern's existing checklist UI is an implementation-time decision
  (find the right component during planning), not a new page.
- **`deletionWarning` email** (`lib/email/templates.ts:32`): update the copy from the
  generic "log in and download it" to a line naming the bulk-download capability
  directly, so the 14/7/1-day warnings actively point at the feature that solves the
  problem they're warning about.

## Testing

New `__tests__/export-approved.test.ts`, mocked in the same style as
`__tests__/retention-sweep.test.ts` and `__tests__/daily-digest.test.ts`:

1. Happy path: multiple `APPROVED` submissions → zip contains one correctly-named entry
   per requirement.
2. Zero approved documents → `404`.
3. One submission's hash fails verification → that file is skipped, the rest are
   included, `_skipped.txt` lists it, `TAMPER_ALERT_HASH_MISMATCH` is logged.
4. Audit log entry shape: `BULK_EXPORT_APPROVED_DOCS` written with the correct
   `submission_ids`/`count`/`skipped` payload.
5. Access control: a request for an intern who has no session, or whose session belongs
   to a different intern, cannot retrieve another intern's documents (there is no
   `internId` param to attempt this through, but the test documents that the route is
   session-scoped by construction).

## Open questions

None outstanding — all decisions above were made explicitly during brainstorming on
2026-09-08.
