# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The project is pre-1.0; minor
versions may contain breaking changes.

## [Unreleased]

### Fixed

- **Include resolved comments in the package** now controls the submitted feedback package.
  The checkbox is enabled on follow-up submissions too; clearing it omits resolved comments
  from the feedback markdown and the `resolved` summary, while selecting it includes them.

## [0.2.0] - 2026-11-03

### Changed

- Public documentation is now a task-oriented docs tree with a short landing README,
  feature tour, how-to guides, agent integration guides and reference pages. Internal
  plans, raw design documents and benchmark notes were removed from the public tree;
  Git history retains them.
- The DSH bundle defaults to embedded mode and serves the review SPA under the
  `/code-review` base path. The embedded SPA authenticates with the DSH session and has no
  review-token form or browser-visible daemon token; external mode (`embedded: false`)
  keeps the daemon-origin UI and token login. Install and upgrade with
  `dsh plugin --profile web add @sir_yami/reviewd@latest`.

### Fixed

- `review_status` now returns the latest `verdict` and an `approved` boolean, and a review
  closed as approved keeps `closeVerdict: "approved"` instead of only `status: "closed"`.
  The CLI status line and the review badge use the same distinction.
- API-authored comments and replies are attributed to agents instead of humans. Bearer
  requests default to `agent`, browser-cookie requests default to `human`, and
  `x-review-actor-kind` overrides either default.
- The DSH Host now injects `sessionController`, so submitting feedback wakes the initiating
  session instead of leaving the delivery pending. The delivered prompt explicitly starts a
  fix round for `request-changes` and `comment` submissions; `approve` gets only an approval
  notice because it closes the review.
- Review appends are serialized per review; the derived cache is best-effort and rebuilt when missing, and GC uses `closedAt` and preserves referenced snapshots.
- The Files changed tab counts every path from the complete snapshot manifest, matching the file
  panel and lazy diff loader for bounded snapshots instead of showing only the retained diff count.
- Pending deliveries survive a daemon restart (atomic `deliveries.json`), and SSE/long-poll replay stored events with a daemon-wide cursor.
- DSH proxy requires DSH authentication, forwards attribution/idempotency headers, and the reviewer is restricted to read-only tools with a bounded unified diff and correct worktree.
- Health now probes store writability and git availability; command reviewers get a minimal environment and bounded output; reviewed repo mounts default to read-only.
- Diff lines use tinted, contrast-checked surfaces; selection is blue, and reviewer findings appear as severity pins on their exact lines and as per-file risk badges.
- Dragging across diff lines selects a comment range without triggering native text selection or scrolling the page mid-drag.

### Added

- Worktree snapshots detect unresolved merge conflicts with `git ls-files -u`, expose a
  `conflicted` flag on `FileDiff` and manifest entries, and add a `merge-conflict:<path>`
  warning. The diff shows a top-level **Merge conflicts** banner, a conflict badge on each
  affected file and a `U` tree marker; range and commit reviews are unchanged because
  committed conflict markers are ordinary content.
- The report toolbar filters findings by several severities and categories at once: values
  inside one filter are ORed, the two filters are ANDed, and an empty filter means all.
- Fixer agents have an explicit review path: list open comments with
  `review_comments_list`, answer or report evidence with `review_reply_comment`, and mark
  addressed comments resolved with `review_resolve_comment`. Replies and resolutions are
  attributed to the agent, and accepted findings stop repeating once their transferred
  comment is resolved. The CLI adds `review comments reply <id> --comment <cid> --body`;
  `comments resolve` remains HTTP/DSH-only.
- The report toolbar can select findings with per-card checkboxes, select all findings matching
  the current filter across pages, and accept or dismiss the selection in one confirmed request.
  Accepted/dismissed badges are visible on collapsed cards. Existing decisions and notes are
  preserved, praise is skipped, and partial, stale or active reviewer runs are excluded from the
  UI and the API.
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
- Fat DSH package `@sir_yami/reviewd`: one installable Cordis bundle now ships the Host,
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

## [0.1.1] - 2026-11-02

### Fixed

- `@sir_yami/reviewd-server@0.1.1` pins `@sir_yami/reviewd-core@0.1.0`. The 0.1.0
  server tarball shipped pnpm's `workspace:*` protocol, which npm consumers cannot resolve.

## [0.1.0] - 2026-11-02

### Added

- Public npm packages: `@sir_yami/reviewd` (DSH bundle), `@sir_yami/reviewd-server`
  (daemon and `review` CLI) and `@sir_yami/reviewd-core` (contracts and event store).
- `@sir_yami/reviewd-core`: safe git runner, unified-diff parser, immutable diff snapshots
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
