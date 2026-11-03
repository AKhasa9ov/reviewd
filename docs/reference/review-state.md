# Review state

Review state is owned by `@sir_yami/reviewd-core`. It has no daemon, network, UI or DSH
imports. The daemon and CLI are adapters over this library.

## Store layout

A store root contains:

```text
lock                              single-writer lock (pid + createdAt)
reviews/<reviewId>/events.jsonl   append-only, versioned event log (source of truth)
reviews/<reviewId>/snapshot.json  atomically replaced replay cache
snapshots/<snapshotId>.json       immutable round snapshots
deliveries.json                   durable feedback delivery outbox
stream-cursor.json                durable daemon-wide SSE high-water mark
```

`ReviewStore.open(root)` takes the lock and rejects a live owner. A stale lock must be
removed manually after confirming the owning process is gone. Never point two live daemons
at one store.

## Events and replay

Every mutation appends one JSON event under a per-review mutex, fsyncs it, folds it into the
aggregate and then best-effort replaces `snapshot.json`. Replay is authoritative:

- a torn final JSONL line is truncated on the next append and reported as `torn-tail`;
- corruption before the last line fails with the review id and line number;
- the cache can be rebuilt from `events.jsonl`;
- review and comment deletes are events, not physical removals.

The event log is the audit trail for human comments, agent findings, decisions, resolutions
and rounds.

## Rounds, snapshots and anchors

Rounds are immutable. Each round stores a snapshot by id. `refresh`:

1. builds a new snapshot from the current repository state;
2. re-anchors every comment;
3. records an anchor and a deterministic outcome with confidence;
4. preserves comment ids, bodies, replies and anchor history;
5. queues reviewer verification when configured.

Anchors store the path, side, line or range, a quote and a content hash. Re-anchoring tries:

- the same path and line;
- rename and hunk mapping;
- a ±40-line quoted search;
- suggestion replacement as a fallback.

Outcomes:

| Outcome     | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `applied`   | The suggested replacement is present (or the change was applied).       |
| `addressed` | The quoted code changed enough that the issue is likely addressed.      |
| `unchanged` | The anchored code is still present.                                     |
| `outdated`  | The surrounding code changed and the comment no longer anchors cleanly. |
| `moved`     | The code moved; the new location was recovered.                         |

An outcome is a deterministic signal, not a human verification. Agent claims, reviewer
verification and human decisions are separate.

## Reviews and comments

`ReviewLifecycle` owns review, round, comment and reply mutations, soft states and refresh.
The service exposes:

- create a review with a repository root and scope;
- edit title/reviewer metadata while the review is open;
- change scope (creates a new round);
- add, reply, edit and soft-delete comments;
- accept/dismiss findings;
- submit a verdict and produce feedback;
- resolve or dismiss comments;
- close or soft-delete a review.

Deleting a review soft-deletes it: it disappears from the list and `GET /api/reviews/:id`
returns `404`, while the event log is retained for audit. Deleting an already deleted
review is idempotent.

A closed review keeps `closeVerdict` (`approved` or `closed`), and an approving submission
sets it to `approved` as well. `GET /api/reviews/:id` exposes it, so adapters do not have
to interpret `status: closed` as approval.

## Limits

| Limit                  | Value        |
| ---------------------- | ------------ |
| Diff text              | 2 MiB        |
| Files                  | 500          |
| Lines per file         | 20,000       |
| Content per file       | 1 MiB        |
| Content per snapshot   | 64 MiB       |
| Untracked path listing | 8 MiB        |
| Feedback markdown/JSON | 100 KiB each |

`totals.truncated` is true for diff, file-count, content-budget or untracked-listing
truncation. A file cut by the diff cap remains visible as an `oversized` synthetic entry;
a changed path wholly beyond the cap is recovered as `truncated`/`diff-truncated` with no
content or hash.

## Snapshots and git

Snapshots are built from a local git checkout. Git access is read-only and strips inherited
`GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`, disables external diff/textconv drivers,
and validates paths against the repository root. Symlinks leading outside the repository
are not followed.

A worktree snapshot also runs `git ls-files -u`. Every unmerged path is marked
`conflicted: true` on its `FileDiff` and manifest entry and adds a
`merge-conflict:<path>` snapshot warning. The UI shows a top-level banner and a badge on
each affected file. Range and commit snapshots do not set the flag: conflict markers in a
committed tree are ordinary content, not unresolved state.

Scope kinds:

- `range` — merge base of base/head to head;
- `commits` — an ordered set of commits;
- `worktree` — base against the working tree;
- `commit` — one commit against its first parent.

reviewd records a merge-request boundary; it never merges or rewrites branches.

## Where to look next

- [Architecture](../architecture.md)
- [HTTP API](http-api.md)
- [Worker protocol](worker-protocol.md)
- [Core package](../../packages/core/README.md)
