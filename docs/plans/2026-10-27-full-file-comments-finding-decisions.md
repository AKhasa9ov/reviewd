# Full-file comments, finding decisions and light-theme polish

> Execute with TDD. Each task starts with a failing test and ends with a focused commit.

**Goal:** Comment on any line of a file (including Base lines outside the diff), triage agent findings with accept/dismiss plus a note, soften the light theme, and fix the invisible primary button in the DSH panel.

**Architecture:** Full-file comments reuse the existing `Comment`/`captureAnchor` model; the server already accepts anchors on full snapshot lines. Finding decisions are a new append-only event on `ReviewState`, exposed through one service/API command and consumed by feedback. UI controls live in `packages/ui`; the plugin fix is isolated in `packages/dsh/client.js`.

**Tech Stack:** TypeScript, React 18, plain CSS tokens, Vitest + Testing Library, Playwright + axe-core, Node 22.

**Spec:** `docs/design.md` sections 6, 10 and 15; this plan captures the decisions agreed on 2026-10-27.

## Global Constraints

- Review stays open-only for mutations; no new comment endpoint.
- Comments on Base lines must persist and survive round refresh through `reanchor`.
- Finding decisions are immutable events; latest decision wins, scoped to `(round, findingId)`.
- Every text pair keeps WCAG AA (4.5:1), UI boundaries ≥3:1.
- No `--dsw-alias-*` tokens in the standalone UI; plugin uses them.
- DSH GUI on port 3099 is not restarted.

---

### Task 1: DSH primary button contrast

**Files:**
- Modify: `packages/dsh/client.js`
- Test: `packages/dsh/test/client.test.ts` (create)

**Interfaces:**
- Consumes: DSH theme tokens.
- Produces: `.cr-button.primary` inherits `--dsw-alias-label-primary-foreground`.

- [x] Write a test that reads `client.js`, extracts the `.cr-button.primary` rule and asserts `color:var(--dsw-alias-label-primary-foreground)` and no `color:#fff`.
- [x] Run `pnpm vitest run packages/dsh/test/client.test.ts`; expect FAIL.
- [x] Change the CSS rule.
- [x] Re-run; expect PASS.

### Task 2: Softer light theme

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Test: `packages/ui/test/tokens.test.ts`
- Test: `tests/e2e/a11y.spec.ts` (computed background)

**Interfaces:**
- Produces: light tokens `bg=#f4f6f8`, `surface=#fbfcfd`, `surface-raised=#eaeef2`, `border=#7d8590`.

- [x] Update token test expectations and add an assertion that light `bg` is not `#ffffff`.
- [x] Run `pnpm vitest run packages/ui/test/tokens.test.ts`; expect FAIL.
- [x] Update the four tokens, keeping all contrast assertions green.
- [x] Add an e2e assertion in light theme that `body` background is `rgb(244, 246, 248)`.

### Task 3: Finding decision domain and API

**Files:**
- Modify: `packages/core/src/review/types.ts`, `events.ts`, `fold.ts`, `store.ts`, `lifecycle.ts`
- Modify: `packages/core/src/service/types.ts`, `service.ts`, `packages/core/src/index.ts`
- Modify: `packages/server/src/daemon/routes.ts`
- Modify: `packages/ui/src/api/types.ts`, `client.ts`
- Test: `packages/core/test/review/decisions.test.ts`, `packages/core/test/service/decisions.test.ts`, `packages/server/test/daemon/routes.test.ts`, `packages/ui/test/api-client.test.ts`

**Interfaces:**
- Produces:
  - `type FindingDecisionState = 'accepted' | 'dismissed'`
  - `interface FindingDecision { findingId; round; state; note?; by: Actor; at }`
  - `ReviewState.findingDecisions?: FindingDecision[]`
  - `decideFinding(id, findingId, input: {state; note?}, ctx): Promise<FindingDecisionView>`
  - `POST /api/reviews/:id/findings/:findingId/decision`
  - `ApiClient.decideFinding(id, findingId, state, note?)`

Rules:
- Only the latest round's report is decidable.
- Finding must exist in that report.
- `note` is trimmed; empty becomes absent; reject >4000 characters.
- Latest decision per `(round, findingId)` wins; the event log remains append-only.

- [x] Write a fold/replay test: decision event updates state and survives reload.
- [x] Write lifecycle tests: accept, dismiss with note, unknown finding, report from older round, closed review.
- [x] Write service and route tests for success and validation errors.
- [x] Run the focused tests; expect FAIL because the types/route do not exist.
- [x] Implement types, event map/guard, fold case, store guard, lifecycle method, service method, route and client method.
- [x] Re-run the focused tests; expect PASS.

### Task 4: Finding decisions in feedback

**Files:**
- Modify: `packages/core/src/service/feedback.ts`, `packages/core/src/service/types.ts`
- Test: `packages/core/test/service/feedback.test.ts`

**Interfaces:**
- Consumes: `ReviewState.findingDecisions`.
- Produces: actionable findings include accepted decisions and notes; dismissed findings are excluded from tasks and, when a note exists, listed once in a compact “Dismissed by human” section. Feedback JSON gains optional `decision`/`note` on findings and a `dismissedFindings` array.

Rules:
- No decision keeps the existing blocker/major rule.
- Accepted includes any severity except praise.
- Dismissed excludes from `findings`.
- Latest decision per finding wins; decisions from another round are ignored.

- [x] Write failing tests for accepted note, accepted minor, dismissed exclusion, dismissed note, stale-round decision, no-decision default.
- [x] Run focused test; expect FAIL.
- [x] Implement the filtering and markdown section.
- [x] Re-run; expect PASS.

### Task 5: Finding decision UI

**Files:**
- Create: `packages/ui/src/review/FindingDecisionControls.tsx`
- Create: `packages/ui/src/review/FindingDecisionDialog.tsx`
- Modify: `packages/ui/src/review/InlineFinding` in `DiffViewer.tsx`
- Modify: `packages/ui/src/review/ReportPanel.tsx`, `ReviewDetail.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/finding-decisions.test.tsx`, `packages/web/test/review-detail.test.tsx`

**Interfaces:**
- `FindingDecisionControls` receives `finding`, `decision?`, `onDecide(finding, state)`, `readOnly`, `pending`.
- `FindingDecisionDialog` receives `target`, `decision?`, `onSubmit(state, note)`, `onClose`, `pending`, `error`.
- `ReviewDetail` owns the dialog and calls `client.decideFinding`, then reloads.

Rules:
- Actions appear on latest-round findings only and not for praise.
- The note is optional; the dialog explains that it goes to the agent with the next feedback.
- A decided finding shows a badge, its note and the opposite action; clicking the current action edits the note.
- Closed reviews hide actions.

- [x] Write failing UI tests for accept dialog, note submission, dismiss badge, editing a note, read-only and praise.
- [x] Run; expect FAIL.
- [x] Implement controls/dialog and wire Report and inline findings.
- [x] Re-run; expect PASS.

### Task 6: Full-file comments and ranges

**Files:**
- Modify: `packages/ui/src/review/FullFileDialog.tsx`
- Modify: `packages/ui/src/review/DiffViewer.tsx`, `ReviewDetail.tsx`
- Modify: `packages/ui/src/review/CommentThread.tsx` (optional `showJump`)
- Modify: `packages/ui/src/review/model.ts` (line-in-diff helper / latest decision helper)
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/full-file-dialog.test.tsx`, `packages/web/test/review-detail.test.tsx`, `packages/core/test/review/anchors.test.ts` (edge coverage)

**Interfaces:**
- `FullFileDialog` receives `comments`, `round`, `activeCommentId`, `composer`, `readOnly`, `renderComposer`, `onOpenComposer`, `onReply`, `onCommentState`, `onCommentJump`, `onCommentFocus`.
- `ComposerState` gains `surface: 'diff' | 'full'`.
- `openComposer(..., surface = 'diff')`.
- Full-file selection: click selects, Shift+click extends, roving tabindex + Arrow/Shift+Arrow/Enter.

Rules:
- Both Current and Base are commentable, including lines outside hunks.
- Existing comments render inline for the selected round and side; all comments are shown regardless of the fix filter.
- Posting from the modal keeps it open and refreshes comments.
- Switching versions resets selection and closes an incompatible composer.
- Jump from Conversation for an anchor outside the diff opens Full file at that side/line.
- No page horizontal scroll at 320px.

- [x] Write failing dialog tests: comment outside hunk on Base, existing comment inline, range selection + composer, version switch reset.
- [x] Run; expect FAIL.
- [x] Implement selection, comment rendering and composer reuse.
- [x] Wire fallback jump and parent composer surface.
- [x] Re-run; expect PASS.

### Task 7: E2E, docs and verification

**Files:**
- Modify: `tests/e2e/review.spec.ts`, `tests/e2e/a11y.spec.ts`, fixture if needed
- Modify: `docs/design.md`, `docs/daemon.md`, `README.md` feedback schema note
- Test: full `pnpm verify`, Playwright, live smoke

- [x] Add e2e: Base full-file comment outside diff, inline display, range, light background.
- [x] Add axe scans for the updated dialog in dark/light/320.
- [x] Update docs.
- [x] Run `pnpm verify`; then Playwright; fix regressions.
- [x] Restart `reviewd` on 3100 only and run live smoke.
- [x] Commit.

## Verification

- `pnpm verify` exit 0.
- Playwright full suite green, including axe dark/light/320.
- A Base comment outside the diff is created, rendered in Full file and survives a round refresh.
- A finding can be accepted with a note and the next feedback includes both; a dismissed finding is not actionable.
- Light page background is `#f4f6f8`; DSH primary button text is visible in dark and light.
