# Review State Core Implementation Plan (C3)

> **For agentic workers:** execute task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the durable, event-sourced review state: reviews, immutable rounds, comments, anchors, re-anchoring, deterministic outcomes and store recovery.

**Architecture:** A single-writer JSONL event log per review is the source of truth. Events fold into an in-memory `ReviewState`; an atomically replaced `snapshot.json` is only a cache. Anchors and outcomes are pure functions over snapshots. No HTTP, daemon, reviewer jobs, CLI, UI or DSH in this plan.

**Tech Stack:** Node 22 built-ins, TypeScript strict, ESM, Vitest. No runtime dependencies.

**Spec:** `docs/design.md` sections 5.6, 6, 8, 9.3; decisions D2/D3/D6.

## Global Constraints

- Core imports Node built-ins only; no `@deepseek-ai/*`, React or HTTP.
- Round snapshots and round numbers are immutable; comments are never physically deleted.
- Every event line has `v`, `id`, `reviewId`, `type`, `at`, `data`; append is `O_APPEND` + `fsync`.
- Reads must recover a torn final JSONL line with a warning; a corrupt non-tail line is a hard typed error with the line number.
- One writer per store: a lock file with pid/createdAt; stale locks are rejected unless explicitly broken by a separate API.
- All ids are opaque, sortable, prefixed: `rev_`, `rnd_`, `cmt_`, `evt_`, `snap_`, `anc_`.
- Timestamps are injected through `now()`; ids through `newId()` so tests are deterministic.
- No secrets in events; caller supplies actor names only.

## File Structure

- `packages/core/src/review/types.ts` — domain and event types.
- `packages/core/src/review/ids.ts` — ULID-like prefixed ids, clock.
- `packages/core/src/review/events.ts` — event construction/validation.
- `packages/core/src/review/fold.ts` — pure event fold into `ReviewState`.
- `packages/core/src/review/store.ts` — `ReviewStore` JSONL, cache, lock, recovery.
- `packages/core/src/review/anchors.ts` — capture and re-anchor.
- `packages/core/src/review/outcomes.ts` — deterministic outcome rules.
- `packages/core/src/review/lifecycle.ts` — command-level operations over the store.
- `packages/core/test/review/*.test.ts` — unit/integration tests.
- Re-export from `packages/core/src/index.ts`.

## Interfaces

```ts
type ReviewId = string; type RoundNo = number; type CommentId = string;
type Actor = { name: string; kind: 'human' | 'agent' | 'system' };
type Side = 'old' | 'new';

interface Anchor {
  id: string; round: RoundNo; path: string; side: Side;
  lineStart: number; lineEnd: number; quote: string;
  contextBefore: string[]; contextAfter: string[]; hunkHeader: string;
  contentHash: string; state: 'active' | 'ambiguous' | 'outdated';
  previous?: { round: RoundNo; path: string; lineStart: number; lineEnd: number };
}

interface Comment {
  id: CommentId; reviewId: ReviewId; createdAt: string; author: Actor;
  body: string; suggestion?: { original: string; replacement: string };
  state: 'open' | 'resolved' | 'dismissed'; replies: Reply[];
  anchors: Anchor[]; outcomes: Outcome[];
}

interface Outcome {
  round: RoundNo; status: 'applied' | 'addressed' | 'unchanged' | 'outdated' | 'moved';
  confidence: 'high' | 'medium' | 'low';
}

interface Round {
  no: RoundNo; snapshotId: string; createdAt: string;
  baseSha: string; headSha: string | null; path: string;
}

interface ReviewState {
  id: ReviewId; title: string; repoRoot: string; status: 'open' | 'closed';
  createdAt: string; rounds: Round[]; comments: Comment[]; version: number;
}
```

`ReviewStore` API:

```ts
open(root: string, opts?: { now?: () => Date; newId?: (prefix: string) => string }): Promise<ReviewStore>
append(reviewId: ReviewId, event: ReviewEvent): Promise<void>
load(reviewId: ReviewId): Promise<ReviewState>
list(): Promise<ReviewSummary[]>
close(): Promise<void>
```

`ReviewLifecycle` API:

```ts
create(input: CreateReviewInput): Promise<ReviewState>
addRound(reviewId: ReviewId, snapshot: Snapshot, actor: Actor): Promise<Round>
addComment(reviewId: ReviewId, input: AddCommentInput, actor: Actor): Promise<Comment>
reply(reviewId: ReviewId, commentId: string, body: string, actor: Actor): Promise<Comment>
setCommentState(reviewId: ReviewId, commentId: string, state: 'open' | 'resolved' | 'dismissed', actor: Actor): Promise<Comment>
refresh(reviewId: ReviewId, snapshot: Snapshot, actor: Actor): Promise<{ round: Round; comments: Comment[] }>
```

## Task 1: Domain types, ids and event schema

**Files:** create `review/types.ts`, `review/ids.ts`, `review/events.ts`; test `test/review/events.test.ts`.

- [ ] Write failing tests for prefixed sortable ids (`rev_...`), deterministic clock injection, event construction with `v:1` and unique `evt_` id, and rejection of unknown event types/empty actor.
- [ ] Implement `createId(prefix, now, random?)` with Crockford base32 time + randomness; `createEvent` with required fields; `isReviewEvent` validator; exported event union.
- [ ] Run focused test RED then GREEN; run `pnpm typecheck`; commit.

## Task 2: JSONL store, fold and recovery

**Files:** create `review/store.ts`, `review/fold.ts`; test `test/review/store.test.ts`.

- [ ] Write failing tests: append+load round-trip, monotonically increasing `version`, snapshot cache written atomically, torn final line recovered with warning, corrupt middle line rejected with line number, two open stores conflict via lock, stale lock message.
- [ ] Implement `append` with `open(...,'a')`, single write, `fsync`; `load` tail-repair; `fold` for `review/created`, `round/created`, `comment/added`, `comment/replied`, `comment/state`, `comment/anchor`, `suggestion/applied`, `review/closed`; `snapshot.json` temp+rename; lock file with pid.
- [ ] Run RED/GREEN, `pnpm typecheck`, commit.

## Task 3: Review aggregate and comment lifecycle

**Files:** create `review/lifecycle.ts`; modify `fold.ts`; test `test/review/lifecycle.test.ts`.

- [ ] Write failing tests: create review, add two immutable rounds, reject duplicate round number, add comment with anchor, reply, resolve/dismiss/reopen, comment never disappears, close review, list summaries.
- [ ] Implement lifecycle methods on top of `ReviewStore`; validate round order and comment ownership; no delete event.
- [ ] RED/GREEN, typecheck, commit.

## Task 4: Anchor capture and re-anchor

**Files:** create `review/anchors.ts`; test `test/review/anchors.test.ts`.

- [ ] Write failing tests: capture exact quote/context/hash; re-anchor unchanged line; follow rename; map through insertion/deletion using hunks; ±40 window; ambiguous equal candidates; missing quote → outdated; previous anchor history retained.
- [ ] Implement `captureAnchor(snapshot, input)` and `reanchor(previous, nextSnapshot)`; normalize CRLF, trim trailing spaces for matching but retain original quote.
- [ ] RED/GREEN, typecheck, commit.

## Task 5: Deterministic outcomes

**Files:** create `review/outcomes.ts`; test `test/review/outcomes.test.ts`.

- [ ] Write failing tests for `applied` (suggestion exact), `addressed` (quote changed/anchor moved with changed content), `unchanged`, `outdated` (file/quote gone), `moved` (position only), confidence values, and no false `addressed` for unchanged content.
- [ ] Implement pure `deriveOutcome(previous, nextAnchor, nextSnapshot, suggestion?)`.
- [ ] RED/GREEN, typecheck, commit.

## Task 6: Refresh integration, exports and docs

**Files:** modify `review/lifecycle.ts`, `index.ts`, `README.md`; test `test/review/integration.test.ts`.

- [ ] Write failing integration test: create review with snapshot r1, add comments, create r2 with rename/insertion, `refresh` produces round 2, re-anchored comments, outcomes, preserves comment ids/body/history, replay from JSONL equals cache.
- [ ] Implement `refresh` wiring reanchor+outcomes; add public exports; add a short README section "Review state (C3)".
- [ ] Run full `pnpm format:write`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify`; commit.

## Verification

- `pnpm verify` green, all new tests pass.
- A replayed store from events matches the cached state.
- A torn tail recovers; a middle corruption fails with line number.
- No HTTP/UI/DSH imports in core.
