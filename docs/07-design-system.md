# InternDocs — Design System

Built on Tailwind CSS + shadcn/ui. This file defines tokens and component rules.

## 1. Brand tokens

**Decision (2026-08-27):** the product identity is the InternDocs name, not the Makerspace org logo. The Makerspace mark (`public/makerspace-brand.png`) is retired from the UI — it does not appear anywhere in the app shell. Brand presence is now a code-drawn wordmark + mark (`src/components/Logo.tsx`, exports `Logo`, `LogoMark`, `Wordmark`) built from these same hex values, which were originally extracted from the Makerspace logo and are kept because they independently pass WCAG AA. Every screen that showed a logo (login, `RoleSidebar`, `intern/layout.tsx`, `accept-invite`) now renders `Logo`/`LogoMark` instead of an "ID" placeholder or the Makerspace raster.

Contrast ratios verified against white (#FFFFFF): primary #1B3251 = 10.07:1, accent #C9400A = 4.88:1, both pass WCAG AA.

**Found 2026-08-28, by the first Playwright/axe CI run (docs/09-project-audit.md):** those two ratios were each checked against white independently, but `--brand-accent` is also used as *text* directly on `--brand-primary` (the login page's dark hero panel, `Wordmark`'s "Docs" when `onDark`) — a combination nobody had checked. `#C9400A` on `#1B3251` is only 2.6:1, failing WCAG 1.4.3's 3:1 floor even for large bold text. Added `--brand-accent-on-dark: #FF8A50` (5.55:1 on `--brand-primary`) for exactly that combination; `--brand-accent` itself is unchanged and still correct against light backgrounds. Lesson for future tokens: verify every *pairing* a color is actually used in, not just against white.

```css
:root {
  --brand-primary: #1B3251;
  --brand-primary-hover: #112136;
  --brand-accent: #C9400A;
  --brand-accent-on-dark: #FF8A50; /* text-brand-accent's replacement wherever the background is --brand-primary */
  --brand-muted: #EEF2F6;        /* light primary tint — active nav/tab backgrounds */

  --status-not-started: #94A3B8;
  --status-draft: #64748B;
  --status-submitted: #3B82F6;
  --status-in-review: #F59E0B;
  --status-returned: #EF4444;
  --status-approved: #22C55E;
  --status-overdue: #DC2626;
  --status-deleted: #9CA3AF;

  /* Readable text over a status tint (e.g. bg-status-approved at 10% opacity, border at 30%) --
     the 700/800 shade of the same hue. Added 2026-09-08 (docs/18-brand-palette-audit-handoff.md)
     once the audit found the same "what color is the label" gap repeating at ~10 call sites
     beyond StatusBadge.tsx's already-documented one. */
  --status-not-started-text: #334155;
  --status-draft-text: #334155;
  --status-submitted-text: #1D4ED8;
  --status-in-review-text: #92400E;
  --status-returned-text: #B91C1C;
  --status-approved-text: #15803D;
  --status-overdue-text: #991B1B;
  --status-deleted-text: #475569;

  /* Role-differentiation badges (UserManagementTable, AdminUsersTable) -- a separate namespace
     from --status-*, which carries workflow-state meaning, not role identity. `intern` reuses
     --surface-muted/--text-muted directly (unprivileged default, no color-coding). */
  --role-system-admin-bg: #F3E8FF;
  --role-system-admin-text: #6B21A8;
  --role-admin-bg: #DBEAFE;
  --role-admin-text: #1E40AF;
  --role-approver-bg: #FEF3C7;
  --role-approver-text: #92400E;

  --surface-bg: #FFFFFF;
  --surface-muted: #F8FAFC;
  --surface-hover: #F1F5F9;      /* row/item hover state — do not reach for raw slate-50/100 */
  --surface-elevated: #FFFFFF;   /* raised panels (modals, sticky table headers) over surface-muted */
  --border-default: #E2E8F0;
  --border-strong: #CBD5E1;
  --text-primary: #0F172A;
  --text-muted: #334155;         /* 7.01:1 on white — WCAG AA pass */
}
```

**Status:** Brand tokens are confirmed and applied in `src/app/globals.css`. `--brand-muted` was referenced by `RoleSidebar`'s active-nav state before it existed as a token (a silent no-op bug); it's now defined, and the active nav item also gets a 3px `--brand-accent` left border so the accent color has real presence in the app shell, not just on the login page.

Secondary text on a `--brand-primary` background (not tinted, the solid navy itself) uses the `text-white/70` opacity pattern rather than a dedicated token — matches the `bg-white/10`/`border-white/15` convention already used for chrome on that same background (see `intern/layout.tsx`'s sticky header).

Any color introduced for a status/feedback purpose (warnings, success confirmations, danger banners) should reuse the `--status-*` tokens above rather than inventing a new Tailwind shade inline — several components had drifted into ad hoc `emerald-950`/`amber-900`/`rose-800`-style one-offs; new work should not add to that list.

## 2. Typography

- System font stack, no custom font loading (keeps performance and load time predictable on 10 Mbps connections per NFR performance)
- Scale: 12 / 14 / 16 / 18 / 24 / 32 px
- Body text: 16px minimum, 4.5:1 contrast minimum
- Status labels: always paired with a color and an icon or text label, never color alone (accessibility — color-blind users must be able to read status)

## 3. Spacing

4px base unit. Use Tailwind's default scale (`p-1` through `p-16`). Do not introduce a second spacing system.

## 4. Status badge component

One component, `StatusBadge`, used everywhere a submission state is shown (checklist, queue, dashboard, timeline). Never re-implement status display ad hoc in a different component — this is how status stays legible at a glance across all three surfaces.

Props: `state` (one of the 8 Appendix A states relevant to display), renders color token + label + icon.

## 5. Confirmation dialog component

One component, `ConfirmAction`, used for every state-changing action: approve, return, reassign, role change, deletion-adjacent actions. Takes a plain-language description of what will happen and requires an explicit confirm click. Never wire a destructive or state-changing action directly to a single click without this component.

## 6. Signature canvas component

- Primary mode: draw with pointer/touch
- Fallback mode: upload PNG, toggled clearly, not hidden in a menu — this is the accessibility requirement for anyone who cannot draw with a pointer
- Never renders another user's signature; only the owner's own enrollment/settings view ever mounts this component in read mode

## 7. Layout

- Breakpoints: mobile 360px minimum, tablet 768px, desktop 1024px+
- Approver and admin surfaces are designed primarily for desktop/tablet (PRD assumption: approvers act on desktop or tablet) but must not break below 360px
- No horizontal scroll at any supported width

## 8. Components sourced from shadcn/ui

Use shadcn/ui primitives for: buttons, form fields, dialogs, tables, tabs, toasts, dropdown menus. Do not hand-roll a component shadcn/ui already provides. Custom components (StatusBadge, ConfirmAction, signature canvas, requirement checklist card) are the exceptions because they encode domain rules shadcn/ui has no opinion on.

**Enforcement note (2026-08-27):** several surfaces (`InternChecklist`, `ApproverQueue`, `AdminDashboardMatrix`, `RoleSidebar`, auth pages) had drifted into raw `<button className="...">` elements with hand-copied Tailwind instead of `src/components/ui/button.tsx`. These have been migrated to `Button`, using `variant`/`size` to express hierarchy instead of one-off classes — e.g. in `ApproverQueue`'s row actions, `ghost` for View/Timeline/Reassign, an outline tinted with `--status-returned` for Return, and `success` (solid) for the row's actual primary action, Approve. Any new action button should start from `Button`; reach for a bespoke `<button>` only when the shared component genuinely can't express the case, and prefer overriding `className` (merged via `cn`/`tailwind-merge`) over duplicating its base styles.

## 9. Motion

Minimal. Use it only to communicate state change (a status badge transitioning color) or loading. No decorative animation. Respect `prefers-reduced-motion`.
