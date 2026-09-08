# Inline PDF Preview in Approver Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an approver preview a submission's document (PDF or image) directly inside the queue table row, without opening the existing full-screen review modal, while keeping that modal available as an explicit "expand full screen" option.

**Architecture:** Extract the passive file-rendering logic already inside `DocumentViewerModal.tsx` (the "Left Canvas: Document Previewer" block — loading/error/PDF-iframe/image states) into a standalone `DocumentPreview` component. `DocumentViewerModal` keeps using it exactly as before (pure refactor, no behavior change). `ApproverQueue.tsx` then reuses the same component inline: a new toggle icon per row expands an accordion panel below that row containing `DocumentPreview`, with a small control to open the same submission in the existing full modal (which still has the approve/return/reassign sidebar).

**Tech Stack:** React 19 client components (`'use client'`), Next.js 16 App Router.

**Spec:** Scoped in chat during brainstorming on 2026-09-08 (bounded extension of the existing `ApproverQueue`/`DocumentViewerModal` review flow — no separate spec file). Key decisions carried into this plan:
- Expand-in-row panel, not a split-pane layout, not just a faster modal.
- Triggered by a new toggle icon per row (not click-anywhere-on-row).
- Accordion behavior: only one row's preview open at a time.
- Handles both PDF (iframe) and image (`<img>`) submissions in the same inline panel.
- The existing modal stays, reachable via an "expand full screen" control inside the inline panel — it is not removed.

## Global Constraints

- No behavior change to the existing `DocumentViewerModal` review flow (approve/return/reassign) — this plan only touches how the passive preview renders and where it can appear.
- The signed-URL fetch (`onGetDownloadUrlAction`, which is audit-logged server-side per FR-17) must only fire when a row's preview is actually opened, not for every row on page load.
- This repo has no jsdom/component-test infrastructure (`vitest.config.ts` sets `environment: 'node'`; `@testing-library/react` is installed but unused for rendering anywhere today). Adding one is out of scope. Both tasks are verified by browser inspection instead of automated render tests — noted explicitly, not silently skipped.

---

## Task 1: Extract `DocumentPreview` from `DocumentViewerModal`

**Files:**
- Create: `src/components/DocumentPreview.tsx`
- Modify: `src/components/DocumentViewerModal.tsx:1-19` (imports), `:98-119` (remove now-relocated `isImage`/`handleDownloadClick`), `:220-265` (replace with `<DocumentPreview />`)

**Interfaces:**
- Produces: `DocumentPreview` component —
  `{ fileUrl: string | null; isLoadingFile?: boolean; error?: string | null; title: string; onDownload?: () => void; downloadFileName?: string; className?: string }` —
  and a named export `isImageFileUrl(fileUrl: string | null): boolean`. Task 2 imports
  both by these exact names.

- [ ] **Step 1: Write `DocumentPreview.tsx`**

This is a direct extraction of `DocumentViewerModal.tsx`'s existing "Left Canvas:
Document Previewer" block (current lines 220-265) plus the `isImage` detection (current
lines 98-103) and `handleDownloadClick` (current lines 105-119) it depends on. No logic
changes — same JSX, same classes, same behavior, just parameterized as a standalone
component instead of inlined in the modal.

```typescript
'use client';

import React from 'react';
import { AlertTriangle, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DocumentPreviewProps {
  fileUrl: string | null;
  isLoadingFile?: boolean;
  error?: string | null;
  title: string;
  onDownload?: () => void;
  downloadFileName?: string;
  className?: string;
}

export function isImageFileUrl(fileUrl: string | null): boolean {
  return Boolean(
    fileUrl &&
      (/\.(jpeg|jpg|png|webp|gif)(\?|$)/i.test(fileUrl) ||
        fileUrl.includes('image/') ||
        fileUrl.includes('image%2F'))
  );
}

const DEFAULT_CLASS_NAME =
  'flex-1 h-full min-h-[360px] bg-slate-100 p-1 sm:p-2 overflow-hidden flex items-center justify-center relative';

export function DocumentPreview({
  fileUrl,
  isLoadingFile = false,
  error = null,
  title,
  onDownload,
  downloadFileName,
  className = DEFAULT_CLASS_NAME,
}: DocumentPreviewProps) {
  const isImage = isImageFileUrl(fileUrl);

  const handleDownloadClick = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (fileUrl) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = downloadFileName || 'document.pdf';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className={className}>
      {isLoadingFile ? (
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          <span className="text-xs font-medium">Generating secure document preview…</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="max-w-md p-6 bg-surface-bg rounded-xl border border-rose-200 text-center space-y-3"
        >
          <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
          <h4 className="text-sm font-bold text-rose-900">Preview Unavailable</h4>
          <p className="text-xs text-rose-700">{error}</p>
          {fileUrl && (
            <Button size="sm" onClick={handleDownloadClick} className="mt-2 gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download File Instead
            </Button>
          )}
        </div>
      ) : fileUrl ? (
        isImage ? (
          <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl}
              alt={title}
              className="max-h-full max-w-full object-contain rounded shadow-xs bg-white"
            />
          </div>
        ) : (
          <iframe
            src={fileUrl}
            title={title}
            className="w-full h-full rounded-lg border border-border-default bg-white shadow-xs"
          />
        )
      ) : (
        <div className="text-xs text-text-muted text-center p-6">
          No document file available to preview.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire `DocumentViewerModal` to use it**

In `src/components/DocumentViewerModal.tsx`:

1. Add the import (near the other component imports, `:15-18`):
   ```typescript
   import { DocumentPreview } from './DocumentPreview';
   ```

2. Delete the now-relocated `isImage` computation (current lines 98-103) and
   `handleDownloadClick` function (current lines 105-119) — both moved into
   `DocumentPreview` verbatim in Step 1.

3. Replace the entire "Left Canvas: Document Previewer" `<div>` (current lines 222-265,
   from `<div className="flex-1 h-full min-h-[360px] bg-slate-100 p-1 sm:p-2 overflow-hidden flex items-center justify-center relative">` down to its closing `</div>`) with:

   ```typescript
          <DocumentPreview
            fileUrl={fileUrl}
            isLoadingFile={isLoadingFile}
            error={error}
            title={title}
            onDownload={onDownload}
            downloadFileName={downloadFileName}
          />
   ```

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/DocumentPreview.tsx src/components/DocumentViewerModal.tsx`
Expected: no errors. (This catches leftover references to the deleted `isImage`/
`handleDownloadClick` if Step 2 missed one.)

- [ ] **Step 4: Verify no regression in the browser**

Start the dev server, sign in as an approver, open the queue, click "View" on a PDF
submission and confirm the modal renders identically to before (iframe preview,
approve/return/reassign sidebar all present and working). Repeat on an image-type
submission if one exists in the seed data, confirming the `<img>` path still renders.
Confirm the loading spinner shows briefly and the "Preview Unavailable" + "Download File
Instead" path still works if you can trigger an error state (e.g. temporarily break the
signed URL, or trust the code-level equivalence from Steps 1-2 if not easily
triggerable).

- [ ] **Step 5: Commit**

```bash
git add src/components/DocumentPreview.tsx src/components/DocumentViewerModal.tsx
git commit -m "$(cat <<'EOF'
Extract DocumentPreview from DocumentViewerModal

Pure extraction, no behavior change -- makes the passive PDF/image preview
reusable outside the full review modal, for the upcoming inline queue preview.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Expand-in-row preview in `ApproverQueue`

**Files:**
- Modify: `src/components/ApproverQueue.tsx:1-12` (imports), `:92-115` (state), `:420-534` (row rendering)

**Interfaces:**
- Consumes: `DocumentPreview` from Task 1 (`src/components/DocumentPreview.tsx`).
- Produces: nothing later tasks depend on — this is the last task in this plan.

- [ ] **Step 1: Add the import**

In `src/components/ApproverQueue.tsx`, add near the other component imports (`:5-7`):

```typescript
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DocumentPreview } from './DocumentPreview';
```

- [ ] **Step 2: Add expand state and the toggle handler**

Add near the existing viewer-overlay state (`src/components/ApproverQueue.tsx:104-110`,
right after `const [activeHasSig, setActiveHasSig] = useState(hasSignature);`):

```typescript
  // Inline expand-in-row preview state (accordion -- one row at a time).
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [isExpandedLoading, setIsExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);
```

Add the toggle handler near `openViewerModal` (`src/components/ApproverQueue.tsx:164-186`,
directly after it):

```typescript
  const toggleExpandRow = async (sub: ApproverQueueItem) => {
    if (expandedSubmissionId === sub.id) {
      setExpandedSubmissionId(null);
      setExpandedUrl(null);
      setExpandedError(null);
      return;
    }

    setExpandedSubmissionId(sub.id);
    setExpandedUrl(null);
    setExpandedError(null);
    setIsExpandedLoading(true);

    try {
      const res = await onGetDownloadUrlAction(sub.id);
      if (res.error) throw new Error(res.error);
      if (res.signedUrl) {
        setExpandedUrl(res.signedUrl);
      } else {
        throw new Error('No document preview link available');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load document preview';
      setExpandedError(msg);
    } finally {
      setIsExpandedLoading(false);
    }
  };
```

This mirrors `openViewerModal`'s fetch pattern exactly, so the fetch (and its
server-side FR-17 audit log entry) only fires when a row is actually expanded — never
for the whole visible page at once.

- [ ] **Step 3: Add the toggle icon and the expanded panel row**

In the row-rendering loop (`src/components/ApproverQueue.tsx:420-534`), two changes:

1. Add a toggle button as the first action in the Actions cell, immediately before the
   existing "View" button (before `src/components/ApproverQueue.tsx:461`):

   ```typescript
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleExpandRow(sub)}
                          title={expandedSubmissionId === sub.id ? 'Collapse preview' : 'Expand preview'}
                          aria-expanded={expandedSubmissionId === sub.id}
                          className="text-text-muted hover:text-text-primary px-1.5"
                        >
                          {expandedSubmissionId === sub.id ? (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </Button>
   ```

2. Change the `return (<tr>...</tr>);` at the end of the `.map()` callback
   (`src/components/ApproverQueue.tsx:426-533`) to return a `React.Fragment` containing
   the existing `<tr>` plus a conditional second `<tr>` for the expanded panel:

   ```typescript
                  return (
                    <React.Fragment key={sub.id}>
                      <tr className="hover:bg-surface-hover transition-colors align-top">
                        {/* ...unchanged row content from the existing <tr key={sub.id}> body... */}
                      </tr>
                      {expandedSubmissionId === sub.id && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-surface-muted/40 border-t border-border-default">
                            <div className="space-y-2">
                              <DocumentPreview
                                fileUrl={expandedUrl}
                                isLoadingFile={isExpandedLoading}
                                error={expandedError}
                                title={sub.requirements?.name || 'Requirement Document'}
                                className="w-full h-[420px] bg-slate-100 p-1 sm:p-2 overflow-hidden flex items-center justify-center relative rounded-lg"
                              />
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openViewerModal(sub)}
                                  className="text-brand-primary/80 hover:text-brand-primary hover:underline font-medium text-xs"
                                >
                                  Expand full screen
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
   ```

   (Remove the `key={sub.id}` from the inner `<tr>` — it moves to the `React.Fragment`
   wrapping both rows, since a `key` must be on the outermost element returned per
   array-index iteration, and a `<React.Fragment>` used as a map's direct child return
   value must have the `key` for React's reconciliation to treat each pair of rows as
   one unit.)

- [ ] **Step 4: Run typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/ApproverQueue.tsx`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Start the dev server, sign in as an approver with at least 2 pending submissions in the
queue:
- Click the chevron on one row: it expands below that row, shows the loading spinner
  briefly, then the PDF (or image) preview.
- Click the chevron on a second row while the first is still expanded: the first
  collapses, the second expands (accordion behavior — only one open at a time).
- Click the chevron on the open row again: it collapses.
- Click "Expand full screen" inside an open panel: the existing full modal opens with
  the same document and the approve/return/reassign sidebar, unchanged from before this
  feature.
- Confirm the Approve/Return/Reassign buttons in the row's Actions cell still work
  exactly as before (this feature doesn't touch them).

- [ ] **Step 6: Commit**

```bash
git add src/components/ApproverQueue.tsx
git commit -m "$(cat <<'EOF'
Add expand-in-row inline document preview to the approver queue

Accordion behavior (one row open at a time), fetches the signed preview URL
only when a row is actually expanded. "Expand full screen" opens the existing
review modal for the same submission.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** expand-in-row (not split-pane/modal-only) ✓, new toggle icon per
  row ✓, accordion ✓, both PDF and image handled by the shared `DocumentPreview` ✓,
  modal preserved as "expand full screen" ✓ (all Task 2). Extraction with no behavior
  change ✓ (Task 1).
- **Type consistency:** `DocumentPreviewProps` field names (`fileUrl`, `isLoadingFile`,
  `error`, `title`, `onDownload`, `downloadFileName`, `className`) are used identically
  in both Task 1 (modal) and Task 2 (inline panel) call sites.
- **No placeholders:** every step has literal code, including the exact JSX to insert
  and remove, not a description of the change.
- **Known gap, explicitly out of scope:** no automated render/interaction test for
  either component, since this repo has no jsdom/component-test infrastructure.
  Verified by browser inspection in Task 1 Step 4 and Task 2 Step 5 instead.
