# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The project is pre-1.0; minor
versions may contain breaking changes.

## [Unreleased]

### Changed

- The DSH bundle defaults to embedded mode and serves the review SPA under the
  `/code-review` base path. The embedded SPA authenticates with the DSH session and has no
  review-token form or browser-visible daemon token; external mode (`embedded: false`)
  keeps the daemon-origin UI and token login. Install and upgrade with
  `dsh plugin --profile web add @dsh-code-review/dsh@latest`.

### Fixed

- Review appends are serialized per review; the derived cache is best-effort and rebuilt when missing, and GC uses `closedAt` and preserves referenced snapshots.
- The Files changed tab counts every path from the complete snapshot manifest, matching the file
  panel and lazy diff loader for bounded snapshots instead of showing only the retained diff count.
- Pending deliveries survive a daemon restart (atomic `deliveries.json`), and SSE/long-poll replay stored events with a daemon-wide cursor.
- DSH proxy requires DSH authentication, forwards attribution/idempotency headers, and the reviewer is restricted to read-only tools with a bounded unified diff and correct worktree.
- Health now probes store writability and git availability; command reviewers get a minimal environment and bounded output; reviewed repo mounts default to read-only.
- Diff lines use tinted, contrast-checked surfaces; selection is blue, and reviewer findings appear as severity pins on their exact lines and as per-file risk badges.
- Dragging across diff lines selects a comment range without triggering native text selection or scrolling the page mid-drag.

### Added

- Host reviewer workers can run shards in parallel: `workerConcurrency` starts that many
  independent worker loops (default 3, clamped to 1–8), each with its own registration,
  heartbeat and reviewer agent. Shard reports are merged in plan order so completion order
  cannot reshuffle the aggregate summary or findings.
- In-place reviewer retry: a failed or coverage-partial worker reviewer can rerun only the
  shards that have no durable report, in the same review, round and snapshot. Completed shard
  findings and coverage are preserved; the daemon rebuilds the plan from the snapshot after a
  restart and leaves a retryable failed state if requeueing itself fails.
- The DSH reviewer gets a scoped `review_report` tool with a typed JSON schema for its final
  report. The worker accepts the captured tool call, normalizes a missing `schemaVersion`, and
  still falls back to the fenced-JSON parser for older harnesses and command reviewers.
- Fat DSH package `@dsh-code-review/dsh`: one installable Cordis bundle now ships the Host,
  reviewer worker and review daemon/SPA, so embedded mode (the default) needs no separate
  server. It starts `reviewd` in-process on an ephemeral loopback port and serves the full
  review UI at `/code-review` on the DSH origin. `/code-review` and `/api/code-review` use
  DSH session auth through `connection.requestRejection`; the daemon bearer stays Host-only
  and never reaches the browser. `embedded: false` keeps the external daemon path and its
  32+ character token requirement. The package declares the DSH bundle/client signals, MIT
  license, root README and files manifest for registry submission.
- Repository settings at `/settings` with daemon-persisted, path-validated checkouts and default target branches (`/api/settings/repositories`).
- Merge-request review setup: source and target branch pickers, all merge-base commits or an inclusive commit set (`commits` scope), plus `GET /api/repos/commits`.
- Docker multi-stage image and Compose stack: Node 22 slim, non-root, read-only root,
  `/data` volume, healthcheck and graceful SIGTERM.
- Operations guide for TLS/reverse proxy, token rotation, backup/restore, retention,
  upgrades, logs and failure recovery.
- OSS project surface: contributing guide, security policy, changelog, package metadata
  and CI jobs for browser/accessibility and Docker builds.
- Top-level quickstart, screenshots, security model, limitations and a local demo script.

## [0.1.0] - unreleased

### Added

- `@dsh-code-review/core`: safe git runner, unified-diff parser, immutable diff snapshots
  for range/worktree/commit scopes, anchors, rounds, deterministic outcomes, versioned
  event store and review lifecycle.
- `ReviewServiceImpl`, feedback package and reviewer contract with `harness-worker`,
  `command` and `none` backends; deterministic fake reviewer for tests.
- `reviewd`: authenticated HTTP/SSE/long-poll daemon, review REST routes, worker leases,
  delivery queue, GC, static SPA serving and the remote `review` CLI.
- Standalone review UI with review list, diff tree, line comments, suggestions, rounds,
  submit/refresh, keyboard navigation, light/dark themes and axe-tested accessibility.
- DSH Cordis bundle: sidebar panel, `review_*` tools, `/review` command, reviewer worker
  and feedback delivery into the initiating session.
