# Review Quality v2 — updated program plan after 2026 research

> **For agentic workers:** This is a sequencing plan, not yet an execution plan.
> R1 is execution-ready at the change level; R2–R6 get their own bite-sized
> implementation plans after the preceding change is verified. Do not start code
> from this document without an approved design amendment.

**Goal:** Make review coverage honest and complete for large PRs, then improve
precision and cost without handing the whole diff to one agent.

**Architecture:** reviewd owns the full manifest, deterministic tiering, shard
plan, coverage ledger, aggregation, and terminal status. The harness owns the
agent, model, tools, and concrete execution limits. The worker contract carries
portable intent (`effort`, shard, manifest), never model-specific token policy.

**Tech Stack:** pnpm, TypeScript strict, Node 22, ESM, Vitest, Playwright,
reviewd/SSE, existing `packages/core`, `packages/server`, `packages/dsh`,
`packages/worker`.

**Spec:** [docs/design.md](../design.md),
[docs/designs/2026-10-28-cross-harness-hooks.md](../designs/2026-10-28-cross-harness-hooks.md),
[research report](../../../harness-tests/gsd-type/research-report-pr-review-agents-2026-10-28.md).

## 1. What changed after research

The previous direction (tiered + module-aware + shards + dynamic budget +
real-time) is still right. The research changes the order and adds non-negotiables:

1. **Coverage correctness comes before scale.** A review that silently drops files
   is worse than a review that says `partial`. Every changed file must appear in a
   full manifest and carry an explicit coverage status.
2. **Precision is the dominant failure mode.** CRA-only PR had 45.20% merge vs
   68.37% human-only; 60.2% of closed CRA-only PR were in the 0–30% signal band.
   More comments are not better.
3. **Small review units beat one giant prompt.** Google: ~100 lines is reasonable,
   1,000 is usually too large. OpenCodeReview uses file-level units and bounded
   tools; its 2.17× SEM-F1 result is benchmark-specific, not a universal claim.
4. **The review unit needs repository context through curated, read-only tools.**
   Not free-form bash, not the whole repository in the prompt.
5. **The critic must be independent and evidence-bound.** Naive reviewer–critic was
   worse than a single reviewer (F1 0.457); explicit evidence disagreement reached
   0.533.
6. **Streaming and adaptive budgets are unproven product hypotheses.** Bounded
   loops are supported; a specific dynamic-budget formula is not. Ship them behind
   measurement, not as assumptions.

## 2. Change map

| Change | Outcome | Depends on | Primary gate |
|---|---|---|---|
| **R1** | Full manifest + coverage ledger + `partial` + protocol v1; no silent file omission | design amendment | 882-file fixture: every file accounted for; terminal `partial`/`done` is truthful |
| **R2** | Deterministic module-aware tier planner; deep/light/manifest policy | R1 | plan fixture across source/tests/docs/generated |
| **R3** | Daemon-planned shard jobs + deterministic aggregator + lazy per-file retrieval | R2 | same 882-file range reviewed by all deep/light shards; coverage union complete |
| **R4** | Precision gate: evidence validation, dedupe, rank, comment cap, deterministic pre-filter | R3 | noisy fixture: no unsupported findings; top-N only; no regression in high-value findings |
| **R5** | Portable effort budget + incremental findings/progress/coverage | R3, R4 | findings visible before final report; budget exhaustion yields `deferred`/`partial`, not omission |
| **R6** | Independent diff-only reflector + local evaluation harness | R4, R5 | local eval shows precision gain without unacceptable recall loss; documented go/no-go |

C2–C6 (MCP, CLI, DSH shared worker, Codex, Claude/Pi) remain the cross-harness
track. **C2 must not freeze protocol v0:** R1 ships protocol v1 first. C2/C3 can
run in parallel with R2–R4 after R1. C4 should consume R3/R5 rather than rebuild
the old single-job path.

## 3. Sequence

### Wave 0 — design amendment (no code)

Update the design decisions that the research invalidates:

- `docs/designs/2026-10-28-cross-harness-hooks.md` §15: replace
  "large PR is harness responsibility; reviewd does not cut diff" with
  "reviewd owns manifest/coverage/shard plan; harness owns execution and effort
  mapping."
- `docs/design.md` §7.3: separate manifest from render budget; never drop a file
  from the manifest.
- `docs/design.md` §9.1: one job per review/round becomes a job group with shard
  jobs and a deterministic aggregator.
- `docs/design.md` §9.2/§9.3: prompt per shard; report includes coverage and
  shard provenance.
- `docs/design.md` §9.4: streaming findings/progress; terminal `partial`.
- Add ADR-style decisions for `partial`, coverage statuses, and the analysis /
  publish security boundary.

**Gate:** design review with the human. No code before approval.

### Wave 1 — R1: honest coverage foundation

R1 does **not** claim to review all 882 files. It makes the limitation explicit and
creates the data model that R2/R3 will fill.

#### Task R1.1: Manifest and coverage types

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/review/types.ts`
- Modify: `packages/core/src/reviewer/types.ts`
- Test: `packages/core/test/snapshot.test.ts`
- Create: `packages/core/test/review/coverage.test.ts`

**Interfaces:**
- `CoverageStatus = 'pending' | 'deep-reviewed' | 'light-reviewed' | 'manifest-only' | 'skipped' | 'deferred' | 'failed'`
- `ManifestFile` with `path`, `oldPath?`, `status`, `binary`, `ignored`, `oversized`, `added`, `deleted`, `hunkCount`, `patchBytes`, `contentBytes?`, `reason?`.
- `ReviewManifest` with `schemaVersion: 1`, `scope`, `files`, `totals`, `warnings`.
- `ReviewCoverage` with per-file status/reason/shardId and totals.
- `AgentStatus` gains `partial`.
- `ReviewState.agent` gains `coverage?: ReviewCoverage`.

**Steps:**
1. Add failing tests for a 600-file fixture: manifest includes all 600, including
   files beyond the old 500-file cap and files with no hunks.
2. Add failing test: legacy snapshot v1 can be read, but a synthesized manifest
   carries `legacy-truncated` warning.
3. Implement types and pure helpers; do not change snapshot generation yet.
4. Run `pnpm vitest run packages/core/test/snapshot.test.ts`.
5. Commit.

**Verify:**
`pnpm vitest run packages/core/test/snapshot.test.ts packages/core/test/review/coverage.test.ts`
Expected: new tests fail before implementation, pass after.

**Done:** types compile; manifest/coverage tests pass; no behavior change yet.

#### Task R1.2: Snapshot produces a full manifest, bounded render data

**Files:**
- Modify: `packages/core/src/diff/snapshot.ts`
- Modify: `packages/core/src/git/scope.ts` only if raw listing needs a helper
- Test: `packages/core/test/snapshot.test.ts`
- Create: `packages/server/test/daemon/snapshot-api.test.ts`

**Steps:**
1. Add a failing fixture with 882 changed paths, a 2 MiB total diff, and files
   beyond 500. Assert `snapshot.manifest.files.length === 882`; assert render
   `files` may be capped but no manifest file is missing.
2. Add a failing test for a 6 MiB single file: manifest has the file with
   `reason: 'per-file-cap'`; no synthetic placeholder is counted as reviewed.
3. Apply the recorded decision: `Snapshot.schemaVersion: 2` adds
   `manifest: ReviewManifest`; `Snapshot.files` stays the bounded render subset
   for backward-compatible consumers. Legacy v1 snapshots synthesize a manifest
   with a `legacy-truncated` warning.
4. Implement manifest collection from `git diff --raw`/`--numstat`; keep
   `Snapshot.files` as the render subset.
5. Keep per-file content caps, but stop using `maxFiles` to remove files from the
   manifest. The old `maxFiles` may remain only as a render/UI budget.
6. Persist the manifest with the snapshot; include it in the job bundle.
7. Run tests.

**Verify:**
`pnpm vitest run packages/core/test/snapshot.test.ts packages/server/test/daemon/snapshot-api.test.ts`
Expected: 882/882 manifest; no file lost; render truncation is explicit.

**Done:** every changed file is represented; render truncation has a reason; no
silent omission.

#### Task R1.3: Coverage gate, events, API, UI status

**Files:**
- Modify: `packages/core/src/review/events.ts` / reducer
- Modify: `packages/core/src/service/service.ts`
- Modify: `packages/server/src/daemon/routes.ts`
- Modify: `packages/server/src/daemon/jobs.ts`
- Modify: `packages/web/src/**` review detail status
- Test: `packages/core/test/review-coverage.test.ts`
- Create: `packages/server/test/daemon/coverage.test.ts`
- Create: `packages/web/test/review-coverage.test.tsx`

**Interfaces:**
- Event `agent/coverage` with `{ reviewId, round, coverage }`.
- `AgentState.status` may become `partial`; terminal gate:
  - `done` only if all deep/light shards succeeded and no `pending`, `skipped`,
    `deferred`, or `failed` remains, except policy-approved `manifest-only`.
  - `partial` when any deep/light work failed/deferred or any file is unresolved.
- API `GET /api/reviews/:id` includes `agent.coverage`; SSE emits `agent/coverage`.

**Steps:**
1. Add failing tests for four terminal cases: complete, deferred, failed shard,
   policy-excluded binary.
2. Implement coverage reducer and gate; never infer `done` from a report alone.
3. Add `agent/coverage` append + SSE sync; add a compact coverage badge in UI.
4. Add a test that a report with findings but incomplete coverage becomes
   `partial`, not `done`.
5. Commit.

**Verify:**
`pnpm vitest run packages/core/test/review/coverage.test.ts packages/server/test/daemon/coverage.test.ts`
`pnpm test:e2e --grep "coverage|partial"`
Expected: all four terminal cases pass; UI shows `partial`.

**Done:** a review cannot be `done` with silent gaps; the API/UI explain why.

#### Task R1.4: Protocol v1 and worker compatibility

**Files:**
- Modify: `packages/worker/src/protocol.ts`
- Modify: `packages/worker/src/loop.ts`
- Modify: `packages/server/src/daemon/jobs.ts`
- Modify: `packages/server/src/daemon/routes.ts`
- Modify: `packages/dsh/src/worker.ts` only for bundle compatibility
- Test: `packages/worker/test/protocol.test.ts`
- Create: `packages/server/test/daemon/jobs-protocol.test.ts`

**Interfaces:**
- `protocolVersion: 1` and `promptVersion: 1` on job/bundle.
- `JobBundle.manifest?: ReviewManifest`; no model/token fields.
- Worker rejects unsupported versions with actionable `protocol-mismatch`.
- v0 worker remains readable during migration; v1 is required for new adapters.

**Steps:**
1. Add failing tests for v1 round-trip and v0 mismatch.
2. Add fields to server payload and worker types; validate before run.
3. Add a compatibility warning path for v0 only.
4. Run worker/server tests.
5. Commit.

**Verify:**
`pnpm vitest run packages/worker/test packages/server/test/daemon/jobs-protocol.test.ts`
Expected: v1 accepted; mismatch is non-retryable and actionable.

**Done:** protocol v1 is explicit before C2/MCP freezes the contract.

#### Task R1.5: 882-file regression fixture and docs

**Files:**
- Create: `packages/core/test/helpers/large-review-fixture.ts`
- Create: `packages/core/test/fixtures/large-review/`
- Create: `packages/server/test/daemon/large-review.test.ts`
- Modify: `docs/designs/2026-10-28-cross-harness-hooks.md` (amendment)
- Modify: `docs/design.md` (sections above)
- Modify: `docs/dsh.md` / `packages/dsh/README.md` if worker behavior changes

**Steps:**
1. Generate a deterministic fixture with 882 paths, mixed source/tests/docs/
   generated/binary, and >2 MiB total diff.
2. Assert manifest count, no silent omissions, terminal `partial`, and explicit
   reasons for every non-reviewed file.
3. Add a test that re-running after R2/R3 will be able to replace `partial` with
   complete coverage.
4. Update docs with the new coverage contract and `partial` semantics.
5. Commit.

**Verify:**
`pnpm verify`
Expected: build, format, lint, typecheck, tests, final build pass.

**Done:** R1 has a reproducible large-review gate and user-facing explanation.

### Wave 2 — R2: deterministic tiering

R2 is a pure planner; no agent, no model.

- Build `ModuleMap` from workspace manifests and path conventions.
- Classify file kind: source, test, docs, config, migration, generated, binary,
  instructions (`AGENTS.md`, `CLAUDE.md`, `.dsh/**`).
- Apply policy:
  - deep: source, config/security/migrations, public API, instructions;
  - deep tests only when the corresponding module source changed;
  - deep docs only user-facing/API/CLI/DSH docs;
  - light: remaining tests/docs;
  - manifest-only: binary/generated/lockfiles.
- Emit `ReviewPlan { shards[], coveragePlan, riskFlags }`; no LLM.
- Gate: fixture with `src/`, `ui-tests/`, `e2e/`, `docs/`, generated files gets
  expected tiers; plan is deterministic across runs.
- R2 does not yet execute shards; it can mark `pending` and keep `partial`.

### Wave 3 — R3: shard jobs and aggregator

This is the change that actually reviews the whole range.

- Job model: `kind: 'review' | 'verify'`, `shardId`, `shardIndex`, `shardCount`,
  `groupId`, `effort`.
- reviewd creates one job per shard from `ReviewPlan`; shards are bounded by
  patch bytes, file count, and module coherence; large files split by hunks with
  overlap.
- Each shard job gets only its shard prompt and manifest slice; repository context
  is available through read-only tools or the repo cwd, not a giant prompt.
- Per-shard report/findings use namespaced IDs (`shardId:localId`); reviewd
  validates and stores them.
- Deterministic aggregator: merge findings, dedupe, compute coverage union, set
  `done`/`partial`; no extra model call required.
- Lazy per-file retrieval API: `GET /api/reviews/:id/snapshot/:round/file?path=...`
  with path validation and range caps; never send the whole 16 MiB diff.
- Gate: same 882-file fixture; every deep/light file belongs to at least one
  shard; no shard prompt exceeds the configured bound; coverage union is complete;
  findings can exist for `src/`, `ui-tests/`, and `e2e/`.

### Wave 4 — R4: precision gate

- Validate evidence: file exists, line range is valid, quoted code appears in the
  diff/file; otherwise mark `unanchored` or reject.
- Deduplicate across shards by file/line/title; rank by severity, confidence, and
  evidence quality.
- Cap findings per review (configurable; start small and measure); suppress nits
  when a deterministic linter covers the same rule.
- Route deterministic lint/type/test/security findings separately; do not ask the
  LLM to re-derive them.
- Gate: noisy fixture with 50 low-value comments becomes a ranked top-N list; no
  unsupported finding survives; high-value findings are not lost.

### Wave 5 — R5: effort budget and incremental updates

- Add portable `effort: 'light' | 'standard' | 'deep'` and `budgetHint` (files,
  patch bytes, risk flags) to the job; harness maps them to its own tool/time/model
  limits. No token limits in the worker contract.
- Per-shard cap + global review cap; one escalation on partial/low confidence;
  exhausted budget marks remaining files `deferred` and terminal status `partial`.
- Add optional `onFinding`/`onProgress` to the runner contract and worker loop;
  post findings as they are accepted.
- DSH reviewer gets a `review_emit_finding` tool or an equivalent sink; posts
  incremental findings; final report remains canonical.
- Events: `agent/finding` (already exists), `agent/progress`, `agent/coverage`,
  `agent/shard`; UI live report with `partial`.
- Gate: finding visible before `agent/report`; budget exhaustion never silently
  drops files; batch fallback still works.

**Research caveat:** streaming and adaptive budget are product hypotheses. Ship
behind a flag and compare time-to-first-useful-finding, acceptance, trust, tokens,
and latency. Do not claim improvement without local evidence.

### Wave 6 — R6: independent reflector and local eval

- Add a diff-only, filter-only reflector job (separate information boundary; no
  new findings). It may remove a finding only with explicit evidence; fail-open on
  parse error.
- Do not use same-context self-critique as the only filter.
- Build a local eval set from real PRs, including clean PRs and known bugs;
  measure precision/recall, comments acted on, false-positive cost, coverage,
  latency, and tokens.
- Gate: local eval shows a precision gain without unacceptable recall loss; if not,
  keep deterministic filtering only.

## 4. Cross-harness track

| Change | Can start after | Notes |
|---|---|---|
| C2 MCP | R1 protocol v1 | Tools expose job, coverage, shard, finding; session jobs opt-in |
| C3 CLI/skills | C2 (or R1 for worker commands) | Same handlers; skills use tool names, not SDK |
| C4 DSH shared worker | R1; full value after R3/R5 | DSH live disposable profile only; never `web` profile |
| C5 Codex skeleton | C1, C3 | Fake executable conformance; no live claim |
| C6 Claude/Pi | C5 | Fake conformance; no live claim |

C2 must include `review_job_next`, `review_job_finding`, `review_job_report`,
`review_job_fail` and a read-only coverage view. Do not expose session job tools
by default.

## 5. Success criteria for the whole plan

- **Coverage:** on the 882-file range every changed file has a status; no silent
  omission; `partial` is truthful; after R3 deep/light files are actually reviewed.
- **Precision:** no unsupported finding; comment volume is capped and ranked; local
  acceptance does not regress.
- **Cost:** per-shard prompt stays within its bound; the 16 MiB diff is never sent
  in one prompt; budget exhaustion is explicit.
- **Security:** reviewer is read-only; no shell/network; no publish credentials in
  analysis; instruction files are protected and human-reviewed.
- **Compatibility:** protocol v1 is versioned; DSH old path still works until C4;
  C2–C6 adapters do not import reviewd internals.
- **Verification:** `pnpm verify`, e2e, DSH disposable live gate, and local eval
  report all pass before ship.
- **Current review:** after R3, re-run `rev_01M61HHH261Y9ASTS8TVJFY7GZ` and compare
  coverage plus findings in `src/`, `ui-tests/`, and `e2e/`. Treat the existing
  findings as partial until then.

## 6. Explicit non-goals for R1–R6

- Auto-fix or auto-merge.
- GitHub/GitLab comment publishing (separate publisher boundary later).
- Multi-agent swarm / five-agent debate.
- Incremental commit-by-commit review (separate change after R5).
- Claiming vendor-benchmark superiority.
- Replacing human approval.

## 7. Approval

Recommended first step: approve **R1** and the design amendment in Wave 0. R1 is
the smallest change that removes the false confidence of the current large-review
path; R2/R3 then make coverage complete. Do not start with dynamic budget or
streaming — those are R5 experiments, not the foundation.
