# Review Service and Reviewer Contract Implementation Plan (C4)

> **For agentic workers:** execute with TDD; checks are batched at the end per the user's directive.

**Goal:** Add the application-level `ReviewService`, feedback package, reviewer contract, report validation, fake/command reviewer backends and review event stream — still without HTTP, daemon, UI or DSH.

**Architecture:** `ReviewServiceImpl` is the only application interface. It composes `ReviewLifecycle` (C3), an injected snapshot factory and an injected clock/id source. Transports later map requests to it. Reviewer backends implement one `ReviewerBackend` interface and produce a validated `ReviewerReport`; the service persists findings and feedback as events.

**Tech Stack:** Node 22 built-ins, TypeScript strict, ESM, Vitest. No runtime deps.

**Spec:** `docs/design.md` sections 5.6, 9.1–9.5, 10.1, 12 (JSON contract); decisions D4/D5/D9.

## Global Constraints

- No `node:http`, React, Cordis, DSH or UI imports in core.
- All mutations take `CallContext { actor, requestId? }`; same `requestId` returns the same result and appends once.
- Typed `ReviewError { code, message, details? }`; codes at minimum `not-found`, `validation`, `conflict`, `agent-busy`, `stale-review`, `internal`.
- Feedback markdown is deterministic: stable section/line order, UTF-8, ≤100 KiB, no secrets.
- Reviewer output validation is dependency-free; invalid items are rejected individually and recorded, not fatal for the whole report.
- Reviewer backends never write the repo; `command` backend is opt-in and argv-only unless `allowShell`.
- Existing C3 store/replay/lock behavior is unchanged.

## File Structure

- `packages/core/src/service/types.ts` — service inputs/views/errors, submit/feedback types.
- `packages/core/src/service/service.ts` — `ReviewServiceImpl`.
- `packages/core/src/service/feedback.ts` — deterministic markdown+JSON package.
- `packages/core/src/reviewer/types.ts` — job/report/sink/backend interfaces.
- `packages/core/src/reviewer/validate.ts` — report validator.
- `packages/core/src/reviewer/fake.ts` — deterministic fake backend.
- `packages/core/src/reviewer/command.ts` — argv command backend.
- `packages/core/test/service/*.test.ts`, `packages/core/test/reviewer/*.test.ts`.
- `packages/core/src/index.ts` — exports.
- `README.md` — C4 section.

## Interfaces

```ts
interface CallContext { actor: Actor; requestId?: string }

interface ServiceCreateInput {
  repoRoot: string; title: string; scope: DiffScope;
  reviewer?: { backend: 'fake' | 'command' | 'none'; command?: string[] };
}

interface ReviewView { review: ReviewState; latestSnapshot: Snapshot | null; report: AgentReport | null }
interface CommentView { comment: Comment }
interface SubmitInput { verdict: 'approve' | 'request-changes' | 'comment'; summary?: string; includeResolved?: boolean }
interface SubmissionView { reviewId: string; round: number; verdict: string; feedback: FeedbackPackage; deliveryKey: string }
interface FeedbackPackage { markdown: string; json: FeedbackJson; deliveryKey: string }

interface ReviewServiceImplDeps {
  lifecycle: ReviewLifecycle;
  store: ReviewStore;
  snapshots: { build(input: { repoRoot: string; scope: DiffScope }): Promise<Snapshot> };
  now?: () => Date;
  newId?: (prefix: IdPrefix) => string;
}
```

## Task 1: Service create/get/list/snapshot/comments

- [ ] Failing tests: create review builds r1 snapshot and returns view; list/get; snapshot round lookup; add/reply/state with `CallContext`; request-id idempotency returns the same comment; unknown review/round/comment are typed `ReviewError`.
- [ ] Implement `ReviewServiceImpl` methods plus `events(reviewId, after)` returning events from the store with a stable `seq` (add `seq` to `ReviewEvent` at append time; backfill older events as line numbers on read).
- [ ] RED/GREEN and commit.

## Task 2: Submit and feedback package

- [ ] Failing tests: submit appends `review/submitted` exactly once, approved closes review, request-changes keeps it open, feedback includes open human comments, blocker/major findings, applied suggestions marked "do not reapply", questions, resolved summary; deterministic markdown; 100 KiB cap truncates with a link; `deliveryKey = reviewId:round:submissionId`.
- [ ] Implement `review/submitted` event + fold, `SubmitInput`, feedback builder and submit service method.
- [ ] RED/GREEN and commit.

## Task 3: Reviewer contract, validation, fake and command backends

- [ ] Failing tests: report schema validation accepts a full valid report; rejects duplicate ids/bad enums/out-of-bounds lines/oversized text per item; partially valid report keeps valid findings and reports rejected ones; fake backend deterministic; command backend argv invocation with `{promptFile}`/`{repo}`/`{outputFile}`, timeout, nonzero exit, dirty-worktree detection (git status before/after using injected `runGit`).
- [ ] Implement `ReviewerBackend.run(job, sink, signal)`, `FindingSink`, `ReviewerReport`, `AgentReport`, `validateReport`, `FakeReviewer`, `CommandReviewer`.
- [ ] RED/GREEN and commit.

## Task 4: Reviewer orchestration and events

- [ ] Failing tests: `runReviewer(reviewId, ctx)` uses the configured backend, persists findings/report events, returns the report, is idempotent by `requestId`, rejects when a reviewer is already running (`agent-busy`), marks failed reports; `none` backend records a skipped report.
- [ ] Implement runner and event types `agent/started`, `agent/finding`, `agent/report`, `agent/failed`; fold report into `ReviewView.report`.
- [ ] RED/GREEN and commit.

## Task 5: Docs, exports and verification

- [ ] Add README "Review service and reviewer contract (C4)" with a usage snippet and JSON contract.
- [ ] Export all public C4 types/classes; static test forbids transport imports.
- [ ] Run `pnpm format:write`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify`; commit.

## Verification

- Full suite green; C3 tests untouched.
- Idempotency test proves one event per request id.
- Feedback markdown snapshot is stable.
- Reviewer validation rejects individual bad items without dropping the report.
