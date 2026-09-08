# Post-Launch Changes

Running log of decisions made after the Week 8 handover (see `08-implementation-plan.md`),
for whoever picks this up next. Newest entries first.

## 2026-09-08 — Fixed three FR-19 digest defects

Found in `lib/jobs/daily-digest.ts` via an internal defect report (bugs #1-3 below map to
its numbering):

1. **Admin escalation fired at the wrong threshold.** PRD FR-19 says the admin is copied
   on anything past **5 working days**, flat. The code computed `waitingDays > sla + 5`,
   so with the default `sla = 2` the real threshold was 7, not 5 -- items sat 2 extra
   working days with no admin visibility. Fixed to `waitingDays > 5`, independent of the
   step's own SLA.

2. **The SLA clock reset on unrelated edits.** `waitingDays` was measured from
   `submissions.updated_at`, which bumps on *any* write to the row -- confirmed this
   happens on `reassignSubmissionStep()` (`lib/data/submissions.ts`), which updates
   `current_holder_id` but not `current_step`. A stalled item that got reassigned
   silently dropped out of the digest and restarted its wait. Root-cause fix: added a
   dedicated `current_step_entered_at` column (`20240101000023_add_current_step_entered_at.sql`,
   backfilled from `updated_at` for existing rows) that is set only at the three places
   that actually change `current_step` -- initial submit, resubmit-after-return, and
   step-advance on approval (`lib/data/submissions.ts:554,572,757,982`) -- and left
   untouched by reassignment or any other metadata-only write. The digest now reads
   `current_step_entered_at` (falling back to `created_at` for any row where it's null).

3. **Escalation was skipped by the dedup guard.** `if (sentToday.has(sub.id)) continue;`
   sat above the admin-escalation check, so once an item's daily approver reminder had
   gone out, its admin escalation for that same day was silently dropped too. "Max 1
   reminder per item per day" was meant to throttle the approver digest, not suppress
   admin escalation. Reordered so the escalation check runs first and the dedup guard
   only gates the approver-reminder/notification-insert block below it.

Covered by `__tests__/daily-digest.test.ts` (5 tests) -- verified each one actually fails
against the pre-fix code before restoring the fix, not just that it passes now.

**Note for whoever deploys this:** the `current_step_entered_at` backfill uses
`updated_at` as a best-effort baseline, which will be wrong for any currently-IN_REVIEW
submission that was reassigned or otherwise edited after entering its current step --
same inaccuracy the pre-fix code had for those rows, not a regression. It self-corrects
the next time each submission's step advances.

## 2026-08-28 — Shrunk the composited signature stamp

`createRequirement()` hardcoded every new requirement's `signature_config` to a
160x60pt stamp (`lib/data/requirements.ts`) -- with no UI to override it, every
requirement ever created through the admin form got exactly that box. Composited onto
an actual document it visibly dwarfed the 8pt printed-name/date text beneath it,
especially on a 2-step document with two stamps side by side. Shrunk the default to
90x34pt (same ~2.65:1 aspect ratio), and shrunk `compositeSignedPdf`'s own code-level
fallback (used only when a requirement has no `signature_config` at all) from 140pt/120pt
down to 90pt/75pt (single-/multi-signatory) to match.

`20240101000020_shrink_signature_stamp_default.sql` backfills existing requirements
still carrying the old 160x60 default so this applies without needing every requirement
manually re-saved -- scoped to rows matching that exact old value, so anything already
different is left alone.

## 2026-08-28 — Printed name profile (replaces email on approved documents)

FR-11's acceptance criteria (`docs/prd-intern-docflow.md`) requires the composited
signature block on an approved document to show "the approver's printed name" alongside
the signature image, step number, and date. Until now that slot was filled with
`dbUser.email` -- no name concept existed anywhere in the schema, the invite flow, or
`accept-invite`.

Added `full_name TEXT` to `public.users`
(`20240101000018_add_user_full_name.sql`, nullable -- no existing account has ever had a
chance to set it) and a `ProfileForm` component wired into a "My Profile" page for every
role (`/intern/profile`, `/approver/profile`, `/admin/profile`, `/system-admin/profile`,
all backed by `getOwnProfile`/`updateOwnProfile` in `lib/data/users.ts`). No new RLS was
needed -- "Users can update own row" (migration 0) already covers `full_name`, and the
self-role-escalation trigger (migration 12) only guards the `role` column.

Two enforcement points, deliberately mirroring how signature enrollment already works:

- **New accounts**: `accept-invite` now collects Full Name alongside the password, so
  it's set once at activation instead of nagging later.
- **Existing accounts** (already activated before this shipped, so no name on file):
  `approveSubmissionSigned` (`lib/data/submissions.ts`) now throws `Profile Incomplete`
  if `full_name` is empty, using the exact same gate pattern as the pre-existing
  `Signature Required` check right above it. Both the approver queue and the admin Final
  Approval page show an amber banner + direct link the moment a signature *or* a name is
  missing -- the goal was to never let someone hit the raw error message as their first
  signal, same reasoning as the existing "Signature Required" banner on `/approver`.

Compositing (`lib/data/submissions.ts`, both the current-step and prior-step signatory
blocks) now reads `full_name` first and falls back to `email`, never a generic label, for
anyone who approved a step before this feature existed. RoleSidebar's footer and the
intern header now also show `full_name` in place of email wherever it's set, and the
intern header text now links to `/intern/profile` -- a natural side benefit of building
the profile page, even though FR-11 only requires the name on *approved documents*, not
in the UI generally.

Deliberately out of scope: every other place `email` is displayed instead of a name (the
admin dashboard, approver queue's intern column, CSV export, System Admin's user table)
still shows email -- FR-11 only asked for approver/admin identity on the signed PDF, and
touching every user-facing email string in the app is a much larger, separate decision.

## 2026-08-28 — Reverted an in-progress "profile / printed full name" feature

A concurrent, unfinished pass (uncommitted, no doc entry of its own) had added a
`full_name` column and profile pages (`/admin/profile`, `/approver/profile`,
`/intern/profile`, `/system-admin/profile` + `ProfileForm.tsx`) so an approver's printed
name -- not just their email -- shows on the composited signature block, and had wired it
in as a hard gate: `approveSubmissionSigned` in `lib/data/submissions.ts` threw "Profile
Incomplete" if `full_name` was unset, `accept-invite` collected it at account setup, and
every role layout linked to a profile page and showed the name in the sidebar. Removed by
request: the new migration (`20240101000018_add_user_full_name.sql`), all four profile
pages, `ProfileForm.tsx`, and every reference to `full_name` / the approval-blocking guard
across `lib/data/{submissions,users}.ts`, all four `layout.tsx` files, `accept-invite`,
`admin/final-approval`, and `approver/page.tsx`. Confirmed via a read-only query that the
`full_name` column was never applied to the live database, so there was no DB state to
clean up. If printed names come back later, note the acceptance criteria this was solving
for: FR-11 wants the signature block to show a name, not just an email.

## 2026-08-28 — Retention & Deletions scoped to System Admin; two dead routing templates removed

**Retention & Deletions** was reachable from both `/admin/retention` (cohort Admin
Console) and `/system-admin/retention` (System Admin Console) -- the latter is the
fuller of the two (purge audit log, manual sweep trigger, active/purged counts), the
former a stripped-down read-only table. Deleted `/admin/retention` and its sidebar entry
in `src/app/admin/layout.tsx` rather than adding a role gate in front of it, since
keeping two views of the same RA 10173 retention data around was the actual problem, not
just who could see it. A `system_admin` user reaches the full page via the existing
"System Admin Console ↗" link in the cohort console's sidebar.

**Routing templates**: removed "Two-Step Lead & Admin Review" (seeded id
`00000000-0000-0000-0000-000000000002` in `20240101000002_...sql`) and "2-Step Approval"
(created later through the admin UI, so no fixed id) via
`20240101000017_remove_lead_admin_and_2step_approval_templates.sql`. One requirement
("test2", a QA-only requirement with a single already-approved test submission) was
still pointed at "2-Step Approval"; the migration reassigns it to `routing_template_id =
NULL` rather than picking a replacement template on the admin's behalf -- null is an
already-supported state (`lib/data/submissions.ts` falls back to a single default-approver
step when a requirement has no routing template), and several other requirements already
run that way. Deletions are logged to `audit_log` as `DELETE_ROUTING_TEMPLATE`. The
migration matches by name as well as id, since "2-Step Approval" only ever existed as
live data, never as a seeded row with a stable id.

Left standing, on purpose: "Single Supervisor Review" and "2-Step Supervisor & Admin
Review" (id `2296cf82-...`), which the admin confirmed should stay.

Also removed the Admin Console's standalone "Signature Settings" page (`/admin/signature`)
and its sidebar entry -- it was a second, identical way to do what the "My Signature"
modal on `/admin/final-approval` (`AdminSignatureOverlay`) already does: both wrapped the
exact same `SignaturePad` + `enrollSignature` call. Kept the modal, since it's contextual
(shown right where signing happens) rather than a permanent nav item for something one
click away. The approver role doesn't have this duplication -- its `/approver/signature`
page is the *only* place to enroll a signature, linked from a banner on the queue -- so
this was specifically an admin-side redundancy, not an app-wide pattern.

## 2026-08-28 — Hybrid data freshness (background auto-refresh + refresh-on-focus)

Added two reusable client components -- `AutoRefresh` and `RefreshOnFocus`
(`src/components/`) -- that call only `router.refresh()`. No client-side Supabase
queries or Realtime subscriptions anywhere in this: `router.refresh()` re-runs the
current route's Server Components against the database (through the same RLS-scoped
server-side data functions the initial render used) and merges the result into the
existing React tree without a full page reload or loss of client component state (open
modals, in-progress form input, etc. survive a refresh).

- **Background auto-refresh** (interval-based polling): approver queue (`/approver`)
  every 15s, admin completion dashboard (`/admin/dashboard`) every 30s, intern checklist
  (`/intern`) every 60s -- shortest interval where staleness is costliest (an approver
  not seeing a new submission), longest where it's least (an intern's own status view).
  Pauses while the tab is hidden (`visibilitychange`) so a backgrounded tab doesn't keep
  polling the server; resumes when it's visible again.
- **Refresh on window focus** (global): `RefreshOnFocus` is mounted once in the root
  `layout.tsx`, so every route gets it automatically without opting in -- covers Audit
  Log, Requirement Setup, Signature Settings, User Management, everything. Listens to
  both `focus` and `visibilitychange`, since browsers don't reliably fire `focus` for
  switching back to a tab within the same window; `visibilitychange` catches that case.

Not addressed, deliberately out of scope for this pass: nothing coordinates the two
mechanisms against each other (a page with both can fire two `router.refresh()` calls
in quick succession right after regaining focus -- harmless, just a little redundant),
and there's no per-user or per-page way to disable polling if it turns out 15s on the
approver queue is too chatty at pilot scale. Revisit once there are real usage numbers,
per the caching/performance phase already flagged as coming next.

## 2026-08-28 — Signature background removal

Added a "remove background" option to signature upload (not canvas drawing, which is
already transparent). Deliberately **not** an ML-based background remover (e.g. remove.bg):
a signature is a bounded, well-defined case (dark ink on light paper), and a general
subject-segmentation service would mean sending signature images -- personal data under
RA 10173 -- to a third party, plus a heavy model dependency that doesn't fit Vercel's
serverless functions well.

Instead, `removeWhiteBackground` in `lib/data/signatures.ts` does a deterministic,
local, per-pixel luminance-to-alpha mapping via `sharp`: near-white pixels become
transparent, dark pixels (ink) stay opaque, with a smooth falloff at the edges rather
than a hard cutout. It only ever makes a pixel *more* transparent than it already was
(`Math.min(existingAlpha, luminanceDerivedAlpha)`), so it's safe to run on an
already-transparent PNG without undoing that transparency. Known limitation, surfaced in
the UI copy rather than hidden: it won't do anything sensible on a signature photographed
against a patterned or dark surface -- that's out of scope for this approach by design.

Wired in as an opt-in checkbox (default on) in `SignaturePad.tsx`, sent as a
`remove_background` form field only from the upload path (never from canvas). Because
removal needs an alpha channel, a JPEG upload that requests it gets promoted to PNG
first -- a side effect worth knowing about: this is *also* now the fix for JPEG's
previously-documented "stamps with an opaque background" limitation, whenever the user
opts in.

The client mirrors the exact same formula in `SignaturePad.tsx` via a `<canvas>`
pixel loop, purely so the dropzone preview (and the confirm-dialog preview, which now
reuses it instead of building a separate one) shows the *actual* result before saving --
it is not a security or correctness boundary; the server-side `sharp` pass is what
actually gets persisted regardless of what the client computed. Covered by
`__tests__/signature-background-removal.test.ts`.

## 2026-08-28 — HR bug reports + intern grouping feature

### Bug: intern document upload failing with "new row violates row-level security policy"

Root cause suspected to be migration drift: `uploadSubmission` / `resubmitSubmission` in
`lib/data/submissions.ts` uploaded via the user-context Supabase client only, with no
fallback -- the *only* two storage upload call sites in the codebase without one (compare
`enrollSignature` in `lib/data/signatures.ts`, which already had this fallback). Fixed by
adding the same service-role fallback. Also added migration
`20240101000015_reassert_submissions_upload_policy.sql` to re-assert the intended INSERT
policy directly, since the unqualified RLS error is consistent with the production
Supabase project never having received migrations `20240101000005` through `20240101000013`
(the InternDocs project was created 2026-08-20; deploy work before this only touched env
vars, never `supabase db push`). **Action item:** confirm someone has actually run
`supabase db push` against the production project — if not, migrations 000005–000016 are
still only local and several earlier RLS fixes (submissions reads, signature storage, the
DELETE-policy fix in 000011, self-role-escalation prevention in 000012) may not be live either.

### Bug: invite link pointed at localhost in production

Same root cause as the sign-out bug fixed the day before (`39ae18b`): `lib/data/auth.ts`
built the accept-invite redirect from `NEXT_PUBLIC_SITE_URL`, a build-time-inlined env var
that was never set. Fixed the same way — derive the origin from the incoming request's
`host`/`x-forwarded-proto` headers instead of an env var. `NEXT_PUBLIC_SITE_URL` is no
longer read anywhere in the app after this change.

### Bug: signature enrollment only accepted PNG

Approvers/admins with a JPG-only scan of their signature had no way to enroll it. Expanded
`SignaturePad.tsx`, `lib/data/signatures.ts`, and `lib/pdf/composite.ts` to accept and
correctly composite either PNG or JPEG (extension-aware storage path, `embedPng` vs
`embedJpg` picked from the stored file's extension). Migration
`20240101000014_expand_signature_formats.sql` lifts the Supabase Storage bucket-level MIME
allowlist, which is enforced independently of the RLS policies on `storage.objects`. Note:
JPEG has no alpha channel, so a JPEG signature stamps with an opaque background rather than
a transparent one — the enrollment UI copy calls this out but does not block JPEG uploads.

Follow-up same day: also added WebP and SVG. Neither is embeddable by `pdf-lib` directly
(it only supports `embedPng`/`embedJpg`), and SVG is a text/XML format the FR-6 magic-byte
validator (`detectMagicBytes`) was never designed to cover, so both get **rasterized to PNG
server-side at enrollment time** (`rasterizeToPng` in `lib/data/signatures.ts`, via the new
`sharp` dependency) before anything is stored — the `signatures` bucket, its RLS/mime
policies, and `lib/pdf/composite.ts` never see a raw WebP or SVG byte, so no further
migration was needed beyond `000014`. Two things worth knowing if you touch this code:
- SVG detection (`isLikelySvg`) is a fast-path text sniff only, not a security boundary —
  the real gate is `sharp`/librsvg rasterization itself, which never executes `<script>` or
  fetches remote resources and throws on anything that isn't valid SVG.
- `rasterizeToPng` caps `limitInputPixels` at 20M and resizes to at most
  `MAX_SIGNATURE_RASTER_DIMENSION` (800px) so a tiny SVG that declares an absurd
  `width`/`height` ("SVG bomb") either gets rejected outright (past the pixel limit) or
  clamped down, never decoded at full declared size. Covered by
  `__tests__/signature-format-expansion.test.ts`.

### Feature: intern groups (school + batch)

New scope beyond the PRD's MVP boundary ("one cohort at a time", `prd-intern-docflow.md`
§"MVP boundary"). Implemented as two plain nullable columns (`school`, `batch`) on
`public.users` (migration `20240101000016_intern_groups.sql`) rather than a separate groups
table/entity — there's no requirement to manage a fixed catalog of schools or batches, only
to tag and filter by them.

Scope decisions made with the user before building:
- **Visibility/filter only, no access restriction.** Every admin and approver still sees
  every intern regardless of group; this is not a new RLS dimension. If Makerspace later
  wants approvers scoped to specific schools/batches, that's a bigger follow-up change
  (new RLS policies + an approver-to-group assignment model) — not done here.
- **Set at invite time.** `AdminInviteForm` grows optional School/Batch fields, shown only
  when inviting an intern, with `<datalist>` autocomplete against already-used values (see
  `getInternGroupOptions` in `lib/data/users.ts`) to keep spelling consistent across the
  cohort. Also editable afterward inline from System Admin → Users
  (`UserManagementTable`) via the new `updateUserGroup` in `lib/data/users.ts`.
- **Filter surfaces:** the admin completion dashboard (`AdminDashboardMatrix`), the CSV
  export (`/api/admin/export`, now with School/Batch columns), the System Admin users table,
  and the approver review queue (`ApproverQueue`) all got School/Batch filter dropdowns.
  The regular Admin's Users page (`admin/users`) only has the invite form (no user list),
  so it gained the invite-time fields but no filter UI.

### Fix: retention sweep now deletes signed outputs and superseded versions (FR-22)

**Flagged for extra review per `AGENTS.md` — this changes the 30-day deletion job.**

Found during a full PRD re-verification (2026-09-04). FR-22 requires the job to permanently
delete "the stored files — **submitted versions and signed outputs**". The implementation
selected exactly one file per submission:

```js
const activeVersion = sub.submission_versions?.find(v => !v.is_superseded) || sub.submission_versions?.[0];
```

and removed only that object. Two categories of bytes were therefore never deleted:

- **Signed PDFs** (`approvals.signed_pdf_url`, written to the same `submissions` bucket in
  `approveSubmissionSigned`) — the artefacts that actually carry an approver's signature image.
- **Superseded versions** — every file produced by the return/resubmit loop.

The submission was still set to `PURGED` and audit-logged as `RETENTION_PURGE_EXECUTED`, so
the audit trail asserted a deletion that had not fully happened. Since DTRs are personal data
under RA 10173 and the 30-day deletion is a non-negotiable constraint, this was treated as the
highest-priority open item.

What changed:

- New `purgeSubmissionFiles()` helper in `lib/jobs/retention-sweep.ts` collects **every**
  undeleted version plus **every** undeleted signed output and removes them in one call.
- Migration `20240101000021_track_signed_output_deletion.sql` adds `approvals.deleted_at`,
  the per-approval counterpart of `submission_versions.deleted_at` (migration `...000010`).
  It serves two purposes: idempotency (so the job does not re-attempt removal of
  already-deleted signed outputs every day), and FR-23's requirement that an administrator
  can still see "the deletion timestamp" after the document is gone. The attestation fields
  (`approver_id`, `step`, `file_hash`, `created_at`) are untouched and no client role has an
  UPDATE policy on `public.approvals`, so FR-23's immutability guarantee is unaffected.
- The sweep now also visits already-`PURGED` submissions, purely to sweep up bytes left
  behind by the old implementation. No state transition is attempted for those (they are
  already terminal); the audit entry carries `leftover_sweep: true` to distinguish it.
- The `RETENTION_PURGE_EXECUTED` payload gained `version_hashes`, `versions_deleted`, and
  `signed_outputs_deleted`. `file_hash` is retained for continuity with entries written
  before this change.

Transition validation still happens **before** any byte is removed, since deletion cannot be
undone if the transition turns out to be illegal.

Covered by `__tests__/retention-sweep.test.ts` (6 tests), including the "already-purged
submission with leftover bytes" shape the old code produced, and an idempotency case
asserting a fully-deleted submission triggers no storage call at all.

**Note for whoever deploys this:** existing production submissions purged by the old code
still have orphaned signed PDFs and superseded versions in the `submissions` bucket. The
first run of the updated job after this migration will sweep them automatically — no manual
cleanup script is needed — but that first run will delete more objects than a normal day's
run, which is expected.

### Fix: completed FR-24's required event list, and FR-17 download logging

FR-24 enumerates the events the audit log must hold. Three were absent, found in the same
2026-09-04 PRD re-verification as the FR-22 gap above:

| Required event | Before | Now |
|---|---|---|
| login | only `LOGIN_FAILED` was written | `LOGIN_SUCCEEDED` in `login()` (`lib/data/auth.ts`) |
| download | only the tamper path (`TAMPER_ALERT_HASH_MISMATCH`) | `DOWNLOAD_DOCUMENT` in `getSubmissionSignedDownloadUrl()` |
| permission denial | nothing — refused access threw with no trace | `PERMISSION_DENIED` via `logPermissionDenied()` |

The download entry also closes FR-17's "Every download is audit-logged". It is written at
signed-URL issue time, since that is the moment the server authorises access and the only
moment it can observe — the fetch itself goes browser-to-storage and never touches the app.
The payload records the file path, hash, version id, and whether the file was a signed
output or the raw submitted version.

`logPermissionDenied()` (`lib/data/audit.ts`) is applied at all 23 authorisation-refusal
sites across the data layer (`submissions`, `users`, `requirements`, `routing`, `signatures`,
`dashboard`, `auth`, `audit`). It records actor, target, and what was attempted, and it
**never throws**: an audit-write failure must not turn a clean 403 into a 500, and must
never be the reason a denial becomes an allow. It complements — does not replace —
`DENIED_TRANSITION`, which covers illegal state *transitions* rather than refused *access*.

Covered by `__tests__/audit-coverage.test.ts`.

### Fix: CI was red on both lint and typecheck

Discovered while verifying the above. `.github/workflows/ci.yml` runs `npm run lint` and
`npx tsc --noEmit`; both had been failing since commit `5245ed4`, so no branch pushed after
that point was actually being gated:

- **12 type errors in `lib/data/audit.ts`.** `new Map(rows.map(r => [r.id, r]))` over an
  untyped Supabase result infers `Map<any, {}>`, so every `.get()` returned `{}` and each
  property access failed. Fixed by declaring the four lookup row shapes
  (`EnrichedUserRow`, `EnrichedRequirementRow`, `EnrichedVersionRow`,
  `EnrichedSubmissionRow`) and typing the maps. Behaviour is unchanged — this also let
  three `@typescript-eslint/no-explicit-any` suppressions be removed.
- **1 type error in `src/app/admin/audit-log/page.tsx`.** It imported `AuditLogEntry` from
  `@/components/AuditLogTable`, which consumes that type but does not re-export it. Now
  imported from `@lib/data/audit`, matching `src/app/system-admin/audit-log/page.tsx`.
- **1 lint error in `src/app/(auth)/accept-invite/page.tsx`.** `urlParams.get('type') as any`
  was narrowed to the six email OTP types `verifyOtp` accepts, with an unrecognised value
  falling back to `'invite'` instead of being passed through to fail at runtime.

Also fixed the typing of the mocks in `__tests__/retention-sweep.test.ts` added in the FR-22
commit: vitest does not typecheck, so an untyped `vi.fn()` passed the suite while failing
`tsc --noEmit`.
