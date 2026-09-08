# Brand Palette Compliance Audit — Handoff

**Date:** 2026-09-08. **Status:** Fixed. All 167 findings addressed (see Resolution section at the end); this doc is kept as the historical record of the audit and the decisions made while fixing it.

## Why this exists

User asked to check every screen against the logo's color palette. A 7-way parallel audit (one agent per app area, each reading its assigned pages/components and grepping for raw Tailwind color-shade classes / hex literals not routed through the design system's tokens) found **167 findings across 7 areas: 2 HIGH, 35 MEDIUM, 130 LOW.** No fixes have been applied yet — the user asked for a handoff instead of an immediate fix pass.

## Ground truth: the token system

Defined in `src/app/globals.css`, documented in `docs/07-design-system.md` §1.

```
Brand (the logo's own colors):
  --brand-primary #1B3251 (navy)         -> Tailwind: brand-primary
  --brand-primary-hover #112136          -> brand-primary-hover
  --brand-accent #C9400A (rust/orange)   -> brand-accent
  --brand-accent-on-dark #FF8A50         -> brand-accent-on-dark (use wherever background is brand-primary)
  --brand-muted #EEF2F6                  -> brand-muted

Status/semantic (intentionally NOT navy/orange -- red/green/amber/blue carry real meaning):
  --status-not-started #94A3B8   --status-draft #64748B      --status-submitted #3B82F6
  --status-in-review #F59E0B     --status-returned #EF4444   --status-approved #22C55E
  --status-overdue #DC2626       --status-deleted #9CA3AF

Neutral UI chrome:
  --surface-bg #FFFFFF      --surface-muted #F8FAFC     --surface-hover #F1F5F9
  --surface-elevated #FFFFFF  --border-default #E2E8F0   --border-strong #CBD5E1
  --text-primary #0F172A    --text-muted #334155
```

**Severity rubric used throughout:**
- **HIGH** — a primary/CTA/brand-identity element uses an off-brand hue instead of `brand-primary`/`brand-accent`. A genuine "this doesn't match the logo" violation.
- **MEDIUM** — neutral UI chrome (borders, dividers, muted text, backgrounds) uses a raw Tailwind gray instead of the matching `surface-*`/`border-*`/`text-muted` token. Not a wrong-color problem, just untokenized.
- **LOW** — a status/feedback color is the *correct* hue for its meaning (red=danger, green=success, amber=warning, blue=info) but bypasses the matching `--status-*` token. Real drift, not a brand violation.

## Open design decisions — resolve these before fixing the LOW bucket

The LOW findings can't all be fixed by a pure find-and-replace, because the design system itself has gaps these findings exposed:

1. **No readable-text shade paired with each status token.** Every `--status-*` token is one hex, used for dots/pill-backgrounds (`bg-status-approved/10`, `border-status-approved/30`). Nothing defines what color the *text* should be over that tint. `StatusBadge.tsx` already has this gap (documented, exempted from this audit) — but the same unresolved gap repeats, previously unflagged, in: `InternChecklist.tsx:405`, `SignaturePad.tsx:270`, `AdminSignatureOverlay.tsx:71`, `system-admin/page.tsx:73`, `admin/submissions/[id]/page.tsx:121,141`, `UserManagementTable.tsx:193`, `AdminUsersTable.tsx:85`. **Decision needed:** define e.g. `--status-approved-text`, `--status-in-review-text`, etc. (or a formula, like "the 700/800 shade of the same hue") before touching these sites, so all ~10 instances land on one consistent answer instead of ten independent judgment calls.
2. **No text-on-dark-muted token.** `src/app/intern/layout.tsx:46,55` uses raw `text-slate-300` for secondary text inside the sticky navy (`bg-brand-primary`) header — everything else in that header uses the `white/N%` opacity pattern (`bg-white/10`, `border-white/15`). Either add a `--text-on-dark-muted` token or standardize on `text-white/70`.
3. **Role-differentiation colors have no token at all.** `UserManagementTable.tsx:320,322,324,325` colors role pills (system_admin=purple, admin=blue, approver=amber, intern=slate) — purple isn't in the token set anywhere, and blue/amber are borrowed from the status palette to mean something that isn't a status. **Decision needed:** either these should be neutral (no color-coding by role) or the design system needs a dedicated role-badge token set, separate from `--status-*`.
4. **The shared primitives are the actual root cause for most of the 130 LOW findings.** `src/components/ui/button.tsx:13-14` (`destructive`/`success` variants) and `src/components/ui/input.tsx:11` (`aria-invalid` state) use raw `rose-600`/`emerald-600`/`rose-400` — every consumer app-wide inherits this. **Fixing these 2 files first, before touching call sites, is likely the highest-leverage single change**: it doesn't eliminate the other findings (most components don't use `Button`'s destructive/success variant for these specific banners, they hand-roll `<div>` alerts), but it fixes the propagation source and should probably be step 1 of any fix pass.

## HIGH (2) — fix these regardless of what else gets deferred

| # | File | Line | Issue | Fix |
|---|---|---|---|---|
| 1 | `src/components/AdminInviteModal.tsx` | 64–73 | The **"Invite Intern" trigger button** on `/admin/users` — the page's single primary action — is a hand-rolled `<button>` (not the shared `Button` component, itself a separate violation of `07-design-system.md` §8's enforcement rule) styled `border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900`, with `text-amber-600` icon at line 69. Verified directly in source — the only off-brand primary CTA found anywhere in the app. | Replace with `<Button>` using `bg-brand-primary text-white hover:bg-brand-primary-hover` (or an outlined `border-brand-accent/40 bg-brand-muted text-brand-primary` treatment if a lighter CTA is wanted); icon to `text-brand-accent` or `text-white` to match. |

## MEDIUM (35) — neutral chrome drift

Grouped by file. All follow the same fix pattern: `slate-*`/`gray-*`/`zinc-*` → `border-default`/`border-strong`/`text-muted`/`surface-muted`/`surface-hover`/`surface-bg`.

### Auth
| File | Line | Raw value | Token |
|---|---|---|---|
| `(auth)/reset-password/page.tsx` | 271 | `hover:bg-slate-50` | `hover:bg-surface-hover` |
| `(auth)/accept-invite/page.tsx` | 228 | `hover:bg-slate-50` | `hover:bg-surface-hover` |
| `LoginForm.tsx` | 96, 122 | `placeholder:text-slate-400` | `placeholder:text-text-muted` (note: reads darker than slate-400 — no lighter placeholder token exists yet, flag as a follow-up if the contrast change is unwanted) |
| `LoginForm.tsx` | 133 | `text-slate-400` | `text-text-muted` |
| `LoginForm.tsx` | 162 | `border-slate-300` | `border-border-strong` |
| `RegisterForm.tsx` | 142, 160, 181, 218, 256, 275, 294, 309 | `placeholder:text-slate-400` | `placeholder:text-text-muted` |
| `RegisterForm.tsx` | 186, 223 | `text-slate-400` | `text-text-muted` |
| `RegisterForm.tsx` | 361 | `bg-slate-50 border-slate-200` | `bg-surface-muted border-border-default` |
| `ForgotPasswordForm.tsx` | 182 | `hover:bg-slate-50` | `hover:bg-surface-hover` |

### Intern
| File | Line | Raw value | Token |
|---|---|---|---|
| `intern/layout.tsx` | 46, 55 | `text-slate-300` (on navy header) | see Open Decision #2 above |
| `InternChecklist.tsx` | 474 | `text-slate-600` | `text-text-muted` |
| `InternChecklist.tsx` | 477 | `text-slate-700 bg-slate-50 border-slate-200` | `text-text-muted bg-surface-muted border-border-default` |

### Approver
| File | Line | Raw value | Token |
|---|---|---|---|
| `ApproverQueue.tsx` | 55 | `border-l-slate-300` (on-track row edge, neutral not status) | `border-l-border-default` |
| `ApproverQueue.tsx` | 507 | `text-slate-500` | `text-text-muted` |
| `DocumentViewerModal.tsx` | 522 | `bg-slate-950/70` (modal scrim) | e.g. `bg-text-primary/70` |
| `DocumentPreview.tsx` | 27 | `bg-slate-100` (default preview background) | `bg-surface-muted` |

### Admin core
| File | Line | Raw value | Token |
|---|---|---|---|
| `AdminRequirementManager.tsx` | 160 | `text-slate-700 bg-slate-100` | `text-text-muted bg-surface-muted` |
| `AdminRequirementManager.tsx` | 184 | `text-slate-700 bg-white` | `text-text-muted bg-surface-bg` |
| `AdminRoutingTemplateManager.tsx` | 116 | `text-slate-700 bg-slate-200/60` | `text-text-muted bg-surface-hover` |

### Admin ops
| File | Line | Raw value | Token |
|---|---|---|---|
| `AdminUsersTable.tsx` | 75 | `bg-slate-100 text-slate-700` | `bg-surface-muted text-text-muted` |
| `AuditLogTable.tsx` | 137 | `bg-slate-100 text-slate-700 border-slate-200` (fallback badge) | `bg-surface-muted text-text-muted border-border-default` |
| `AuditLogTable.tsx` | 236, 348 | `text-slate-700 bg-slate-100 border-slate-200` (version chip) | same |
| `AuditLogTable.tsx` | 237, 351, 457 | `text-slate-500 bg-slate-50 border-slate-200` (state chip) | `text-text-muted bg-surface-muted border-border-default` |
| `UserManagementTable.tsx` | 184 | `bg-slate-100 text-slate-700` | `bg-surface-muted text-text-muted` |
| `UserManagementTable.tsx` | 320 | `bg-purple-100 text-purple-800` (system_admin role pill) | see Open Decision #3 above |
| `UserManagementTable.tsx` | 325 | `bg-slate-100 text-slate-700` (intern role pill) | `bg-surface-muted text-text-muted` |

### Shared
| File | Line | Raw value | Token |
|---|---|---|---|
| `SubmissionTimelineModal.tsx` | 108 | `border-slate-200` | `border-border-default` |
| `SubmissionTimelineModal.tsx` | 111 | `bg-slate-300` (timeline dot) | `bg-border-strong` |
| `SubmissionTimelineModal.tsx` | 120 | `text-slate-500` | `text-text-muted` |

## LOW (130) — correct hue, untokenized

Full per-file breakdown. Fix pattern: raw shade → matching `--status-*` token, once Open Decisions #1 and #4 above are resolved.

### Auth (24 total, 6 MEDIUM already listed above, 18 LOW)
`(auth)/reset-password/page.tsx:209,240` · `(auth)/accept-invite/page.tsx:199` · `LoginForm.tsx:23,49,59,72` · `RegisterForm.tsx:123,132(+7 repeats: 149,168,205,245,262,285,300),347,354` · `ForgotPasswordForm.tsx:72,96,122` · `AcceptInviteForm.tsx:193`

All are `rose-*`/`amber-*`/`emerald-*` alert/banner/badge patterns (error, warning, success). Map: rose→`status-returned`, amber→`status-in-review`, emerald→`status-approved`.

### Intern (31 total, 2 MEDIUM already listed, 29 LOW)
`InternChecklist.tsx` is the single largest concentration in the whole audit — lines 249, 256, 291, 297, 405, 449, 487, 488, 489, 494, 500, 503, 504, 509, 513, 522, 523, 526, 527, 534, 546, 548, 549, 550, 582 (25 findings: download/export error banners, the APPROVED attestation banner block, the RETURNED feedback box, and the three-tier deletion-countdown banner all use raw emerald/red/amber throughout). Plus `PrintedNameForm.tsx:52,57`.

### Approver (34 total, 4 MEDIUM already listed, 30 LOW)
`approver/page.tsx:89,91,95,96` (missing-signature banner) · `ApproverQueue.tsx:42,43,50,53,361,368,567,590,638,673,678,688,720,770,795` (wait-time SLA tone, row edge accents, error banners, approve/return dialog warnings) · `DocumentViewerModal.tsx:294,295,296,299,307,309,312,330,336,345,347,490` (return-comment box, no-signature warning, error banners) · `DocumentPreview.tsx:66,68,69,70` (preview-unavailable state) · `SignaturePad.tsx:270,325,331,362` · `AdminSignatureOverlay.tsx:45,60,71(x2)`.

### Admin core (13 total, 3 MEDIUM already listed, 10 LOW)
`AdminDashboardMatrix.tsx:191,192,196,197,201,202` (the 3 summary stat cards' icon badges + selection rings — Complete/In Review/Overdue) · `AdminRequirementManager.tsx:194,213,236` · `AdminRoutingTemplateManager.tsx:144`.

### Admin ops (30 total, 2 MEDIUM already listed, 28 LOW)
`admin/audit-log/page.tsx:45` · `admin/submissions/[id]/page.tsx:121,141` · `AdminUsersTable.tsx:85,205,220,225` · `AdminInviteForm.tsx:110,116,117,126,134` · `AuditLogTable.tsx:126,129,132,135,192` (the `getActionBadgeColor()` function — 4 status colors for SUBMIT/APPROVE/RETURN-DENIED-FAILED/PURGE-EXPIRE) · `UserManagementTable.tsx:193,322,324,394,399,460,462`.

*(Note: `AdminInviteModal.tsx:67,69` are the 2 HIGH findings above, not LOW.)*

### System-admin (6 total, 1 MEDIUM already listed, 5 LOW)
`system-admin/page.tsx:50,56,73` · `system-admin/retention/page.tsx:71` · `system-admin/audit-log/page.tsx:38`.

### Shared (9 total, 3 MEDIUM already listed, 6 LOW)
`privacy-notice/page.tsx:125` · `ConfirmAction.tsx:107` · `SubmissionTimelineModal.tsx:84` · `ui/button.tsx:13,14` (the `destructive`/`success` variant *definitions* — see Open Decision #4) · `ui/input.tsx:11` (the `aria-invalid` state — see Open Decision #4).

## Suggested order, if/when this gets picked up

1. Fix the 1 HIGH (`AdminInviteModal.tsx`) — isolated, no dependencies, ships alone.
2. Resolve Open Decisions #1–#3 (needs a design call, not code) — even a rough "here's the formula" answer unblocks the largest chunk of LOW findings.
3. Tokenize `ui/button.tsx` and `ui/input.tsx` (Open Decision #4) — fixes the propagation source; verify nothing visually regresses across the app (destructive/success buttons and invalid-input styling appear everywhere).
4. Sweep the MEDIUM findings (mechanical, low-risk, no design decision needed — the surface-*/border-*/text-muted tokens already exist).
5. Sweep the LOW findings file-by-file, largest first (`InternChecklist.tsx`, `ApproverQueue.tsx`+`DocumentViewerModal.tsx`, `AuditLogTable.tsx`).

Rough sizing: step 1 is trivial. Step 4 touches ~15 files but is pure find-and-replace. Step 5 touches ~20 files, ~130 individual class swaps — mechanical but large diff; consider splitting into 2–3 PRs by area rather than one sweep, matching this repo's existing "small focused commits" convention (see `docs/16-post-launch-changes.md`).

## How this was produced (to reproduce or extend)

Parallel workflow, one agent per area (auth / intern / approver / admin-core / admin-ops / system-admin / shared), each given the token reference above and instructed to grep its assigned files for raw Tailwind color-shade classes (`slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose` + shade number) and raw hex literals, then classify each hit per the severity rubric above. Excluded by design: white/black/transparent/currentColor, un-migrated shadcn default-theme internals (`bg-background`/`text-foreground`/etc.), decorative non-semantic colors, and the already-documented `StatusBadge.tsx` gap.

## Resolution (2026-09-08)

All 167 findings fixed in the order this doc suggested. The three open design decisions were resolved as follows — see `docs/07-design-system.md` §1 for the resulting token list:

1. **Status text tokens (Decision #1).** Added `--status-*-text` alongside every existing `--status-*` token — the 700/800-shade formula the doc proposed (e.g. `--status-approved-text: #15803D` next to `--status-approved: #22C55E`). Every `bg-status-*/10` + `border-status-*/30` pairing now gets its matching `-text` token for the label instead of a raw `emerald-700`/`amber-800`/etc.
2. **Text-on-dark-muted (Decision #2).** Standardized on `text-white/70` (the doc's second option) rather than adding a token — matches the existing `bg-white/10`/`border-white/15` opacity pattern already used elsewhere in `intern/layout.tsx`'s header.
3. **Role-badge tokens (Decision #3).** Added a dedicated `--role-*-bg` / `--role-*-text` pair for `system-admin` (purple), `admin` (blue), and `approver` (amber) — a separate namespace from `--status-*` so a role color is never confused with a workflow-state color. `intern` reuses `surface-muted`/`text-muted` directly (no color-coding, since it's the unprivileged default).
4. **Shared primitives (Decision #4).** `ui/button.tsx`'s `destructive`/`success` variants and `ui/input.tsx`'s `aria-invalid` state now route through `--status-returned`/`--status-approved`, fixing the propagation source before any call site was touched.

The 1 HIGH, all 35 MEDIUM, and all 130 LOW findings were then swept file-by-file per the areas above. `StatusBadge.tsx` remains the one intentionally-excluded exception (pre-existing, separately documented gap). Verified with `tsc --noEmit`, `next build` (production build succeeds, all new token utility classes confirmed present in the compiled CSS), and a live check of the fixed `AdminInviteModal.tsx` CTA and `AdminDashboardMatrix.tsx` stat cards in the browser.
