# Full-file inline flow, scroll containment and inline finding notes

> Execute with TDD. Do not commit: the worktree already holds the reviewed CRUD change and the user wants one final commit after a green full verification.

**Goal:** Make commenting in the full-file dialog behave like the diff (per-line action, `c`, inline composer and thread), stop scroll chaining from the dialog to the page, and move finding-decision notes from a modal into the finding card.

**Architecture:** The full-file dialog already owns selection and the composer surface. ReviewDetail gains a small ref-based controller so `c` targets the open dialog instead of a hidden diff composer. Finding decisions become an inline form owned by `FindingDecisionControls`; the modal component is removed and ReviewDetail calls the API directly with per-finding pending/error state.

**Tech Stack:** TypeScript strict, React 18, plain CSS tokens, Vitest + Testing Library, Playwright + axe-core, Node 22.

**Spec:** `docs/design.md` sections on comments, findings and dialogs; this plan captures the 2026-10-28 decisions.

## Global Constraints

- Do not commit. Leave changes in the worktree for the controller's single final commit.
- Do not modify or restart the DSH GUI on port 3099.
- No new API endpoints; reuse `client.addComment` and `client.decideFinding`.
- Finding note is optional, trimmed, max 4000 characters; latest decision wins; closed reviews and praise hide actions.
- Full file must keep working at 320px without horizontal page overflow; Current/Base, ranges and keyboard selection must not regress.
- One implementer per task. Do not dispatch further subagents.

---

## Task 1: Contain scroll chaining in the full-file dialog

**Files:**
- Modify: `tests/e2e/fixture-server.mjs`
- Modify: `tests/e2e/review.spec.ts`
- Modify: `packages/ui/src/styles.css`
- Test: `tests/e2e/review.spec.ts`

**Interfaces:**
- Produces: `.cr-dialog-body` and `.cr-dialog` use `overscroll-behavior: contain`; the full-file dialog body scrolls independently of the page.
- Test fixture adds `src/long.ts` with at least 120 lines in the feature commit so the dialog body overflows.

**Rules:**
- Wheel up at the dialog body's top and wheel down at its bottom must not change `window.scrollY`.
- The dialog body itself must still scroll.

- [ ] Add the long fixture file and a failing Playwright test that opens its full file, puts the pointer over `.cr-dialog-body`, and asserts wheel at the top/bottom leaves `window.scrollY` unchanged while `scrollTop` changes.
- [ ] Run `pnpm exec playwright test tests/e2e/review.spec.ts -g "scroll"`; expect FAIL before the CSS change. Record the failure in the report.
- [ ] Add `overscroll-behavior: contain` to the dialog scroll containers in `packages/ui/src/styles.css`.
- [ ] Re-run the focused test; expect PASS. Run `pnpm verify`.

## Task 2: Full-file commenting works like the diff

**Files:**
- Modify: `packages/ui/src/review/FullFileDialog.tsx`
- Modify: `packages/ui/src/review/DiffViewer.tsx`
- Modify: `packages/ui/src/review/ReviewDetail.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/full-file-dialog.test.tsx`
- Test: `packages/web/test/review-detail.test.tsx`
- Test: `tests/e2e/review.spec.ts`

**Interfaces:**
- `FullFileDialog` gains a per-line comment button with accessible name `Comment on line N`.
- `FullFileDialog` accepts an optional controller ref with `{ commentAtSelection(): void }`; ReviewDetail's `openComposerAtSelection()` calls it when the full-file dialog is open.
- The controller falls back to the current anchor line when no selection exists and does nothing in read-only mode.
- The full-file composer still uses `surface: 'full'`; the diff composer must not render behind the dialog.

**Rules:**
- Clicking a line's `+` selects that line and opens the full-file composer for it.
- Pressing `c` with the full-file dialog open opens exactly one composer, inside the dialog.
- Posting keeps the dialog open and the new comment appears inline after refresh.
- Current/Base, range selection, Enter and Escape keep their current behavior.
- 320px viewport must not overflow horizontally.

- [ ] Add a failing unit test: clicking `Comment on line 2` calls `onOpenComposer('new', 2, 2)`.
- [ ] Add a failing web test: open the full file, select line 2, press `c`, assert the composer form is inside the dialog and no `.cr-inline-composer` exists; post and assert the dialog stays open.
- [ ] Run the focused tests; expect FAIL.
- [ ] Implement the per-line button, controller ref and `c` routing; add CSS for the action column.
- [ ] Re-run focused tests; expect PASS. Add/extend one Playwright test covering the per-line action and `c` end to end.
- [ ] Run `pnpm verify` and the focused Playwright tests.

## Task 3: Inline finding decision notes

**Files:**
- Modify: `packages/ui/src/review/FindingDecisionControls.tsx`
- Delete: `packages/ui/src/review/FindingDecisionDialog.tsx`
- Modify: `packages/ui/src/review/DiffViewer.tsx`
- Modify: `packages/ui/src/review/ReportPanel.tsx`
- Modify: `packages/ui/src/review/ReviewDetail.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/finding-decisions.test.tsx` (create)
- Test: `packages/web/test/review-detail.test.tsx`

**Interfaces:**
- `FindingDecisionControls` receives `finding`, `decision?`, `readOnly?`, `pending?`, `error?`, `onDecide(finding, state, note): Promise<boolean>`.
- Clicking Accept/Dismiss expands an inline form with the note textarea and `Accept finding`/`Dismiss finding` + `Cancel`; it never opens a dialog.
- `ReviewDetail` owns `decidingFindingId` and a per-finding error, calls `client.decideFinding`, reloads on success and passes pending/error to both the inline finding and the report panel.

**Rules:**
- Accept/Dismiss submit the chosen state and trimmed note; empty note is omitted.
- `onDecide` resolves `true` on success (form closes) and `false` on failure (form stays with an alert).
- Latest decision still wins; a persisted decision shows its badge and note; clicking the same action edits the note.
- Praise without a decision renders nothing; closed/read-only reviews show decisions but no actions.
- Note textarea keeps `maxLength={4000}`.

- [ ] Create `packages/ui/test/finding-decisions.test.tsx` with failing tests for expand, submit note, cancel, persisted note, praise, read-only and error.
- [ ] Update the web test to expect an inline form instead of the `Accept finding` dialog.
- [ ] Run focused tests; expect FAIL.
- [ ] Implement the inline form, thread pending/error through DiffViewer and ReportPanel, remove the modal and wire ReviewDetail directly.
- [ ] Re-run focused tests; expect PASS. Run `pnpm verify` and the full Playwright suite.

## Verification

- `pnpm verify` exit 0.
- `pnpm test:e2e` full suite green, including a11y/visual.
- Manual smoke on `http://192.168.1.25:3100`: open review, edit/save title, delete a throwaway review and confirm it leaves the list.
