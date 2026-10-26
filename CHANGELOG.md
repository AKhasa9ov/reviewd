# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The project is pre-1.0; minor
versions may contain breaking changes.

## [Unreleased]

### Fixed

- Review appends are serialized per review; the derived cache is best-effort and rebuilt when missing, and GC uses `closedAt` and preserves referenced snapshots.
- Pending deliveries survive a daemon restart (atomic `deliveries.json`), and SSE/long-poll replay stored events with a daemon-wide cursor.
- DSH proxy requires DSH authentication, forwards attribution/idempotency headers, and the reviewer is restricted to read-only tools with a bounded unified diff and correct worktree.
- Health now probes store writability and git availability; command reviewers get a minimal environment and bounded output; reviewed repo mounts default to read-only.

### Added

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
