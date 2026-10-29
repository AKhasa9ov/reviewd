# R4 — In-place Reviewer Retry and Structured Report Output

> **For agentic workers:** keep the snapshot and round immutable; retry is an event-sourced
> state transition, not a new review or round.

**Goal:** Let a failed or coverage-partial worker reviewer finish the same review/round/snapshot
without discarding completed shard work, and give the DSH reviewer a typed final-report tool so
minor JSON shape variation does not turn a good review into `invalid-output`.

**Spec:** `docs/plans/2026-10-28-review-quality-roadmap-v2.md` §Wave 3 and the R3 shard contracts.

## Delivered contracts

- `POST /api/reviews/:id/agent/retry` accepts a review whose latest agent is `failed` or
  `partial`, has no queued/leased jobs, and belongs to the latest round.
- The daemon rebuilds `ReviewPlan` from `latestSnapshot.manifest`, computes completed shard ids
  from persisted `agent.shards`, and queues jobs only for shards without a durable report.
- `agent/retry` preserves findings, shard reports and completed coverage; it resets only target
  shard coverage `failed|pending → pending`, clears the error/job id/start time and returns the
  agent to `queued`.
- The finalizer ignores a stale failed job when a newer report exists for the same shard.
- A daemon restart is supported: in-memory jobs disappear, reconciliation marks the agent failed,
  and retry reconstructs the plan from the durable snapshot.
- If no shard needs work, the daemon aggregates the already-persisted reports immediately.
- If requeueing a shard bundle fails, the daemon cancels partial jobs and leaves a durable
  `retry-enqueue-failed` state so the user can retry again instead of being stuck in `queued`.
- Legacy v1 snapshots retain the one-job retry path.
- The DSH worker registers a scoped `review_report` tool on the reviewer agent only. It captures
  a typed final report, normalizes a missing `schemaVersion`, and falls back to the existing
  fenced-JSON parser when the harness has no scoped tool registry.
- The prompt requests the tool first and names the fenced-JSON fallback explicitly.

## Tasks and evidence

| Task | Deliverable | Evidence |
|---|---|---|
| R4.1 | `agent/retry` event and fold semantics | `packages/core/test/review/fold.test.ts` |
| R4.2 | Retry route, target-shard enqueue, finalizer guard | `packages/server/test/daemon/shards.test.ts` |
| R4.3 | Retry after daemon restart | `packages/server/test/daemon/shards.test.ts` |
| R4.4 | UI retry action and client method | `packages/ui/test/client.test.ts`, `packages/ui/test/reviewer-retry.test.tsx` |
| R4.5 | Scoped `review_report` tool and fallback | `packages/dsh/test/report-tool.test.ts`, `packages/dsh/test/worker.test.ts` |
| R4.6 | Prompt contract | `packages/server/test/daemon/prompt.test.ts` |
| R4.7 | Full gates | `pnpm verify` |

## Gate

`pnpm verify` passes: build, Prettier check, ESLint, TypeScript, 69 test files / 738 tests, and the
final build. The retry integration test verifies that a completed shard report survives, only the
unfinished shard is leased again, and final coverage is `done` with every path deep-reviewed.

## Non-goals and limits

- Retry is exposed only for the DSH worker backend; command-reviewer retry still requires a new
  round because its jobs are not owned by this daemon's in-memory queue.
- A single file whose rendered shard still exceeds the hard prompt limit can remain truncated
  inside its own shard; hunk splitting is a separate change.
- The typed tool improves generation but does not replace server-side report validation.
- The tool schema is restricted to DSH's supported JSON Schema keywords; numeric validation
  keywords such as `minimum` are intentionally omitted.
