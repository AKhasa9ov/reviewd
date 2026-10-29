# R3 — Shard Jobs and Deterministic Aggregation

> **For agentic workers:** TDD each task; keep protocol v1 compatible by adding optional shard fields.

**Goal:** Execute the R2 `ReviewPlan` as bounded worker jobs, then aggregate their reports into one coverage-complete round without a second model call.

**Spec:** `docs/plans/2026-10-28-review-quality-roadmap-v2.md` §Wave 3.

## Delivered contracts

- Core: `agent/shard` event, `AgentShardState`, incremental coverage, `aggregateShardReports`.
- Server: one job per `ReviewShard`; each job carries a shard-scoped snapshot, manifest slice, prompt, and optional `shardId`/`shardIndex`/`shardCount`/`effort`/`moduleId` wire fields.
- Reports: shard findings/questions are namespaced as `shardId:localId`; findings validate against the shard snapshot only.
- Finalization: report/fail handlers call an idempotent group finalizer when every shard job is terminal. Missing shards become `failed`, never silently reviewed.
- Lazy file API: `GET /api/reviews/:id/snapshot/:round/file?path=...&side=new|old`, relative-path validation, 5000-line / 1 MiB caps.
- Snapshot v2 path filter: `buildSnapshot({ paths })` produces the shard bundle without re-listing the whole range.

## Tasks

| Task | Deliverable | Evidence |
|---|---|---|
| R3.1 | Shard report state, fold, aggregator | `packages/core/test/review/aggregate.test.ts`, `fold.test.ts` |
| R3.2 | Shard jobs and prompts | `packages/server/test/daemon/large-review.test.ts`, `prompt.test.ts` |
| R3.3 | Namespacing and final aggregation | `packages/server/test/daemon/shards.test.ts` |
| R3.4 | Lazy per-file retrieval | large-review lazy retrieval assertion |
| R3.5 | Full gates | `pnpm verify` |

## Gate

The 882-file fixture is split into bounded shards, every path is covered exactly once, and final coverage is `done` with 882 `deep-reviewed` files. A failed shard makes the round `partial` with an explicit `shard-failed` reason.
