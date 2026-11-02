# Daemon and CLI contract (C5)

`reviewd` exposes `@dsh-code-review/core` over authenticated HTTP. The daemon and the
`review` CLI are intentionally harness-agnostic: DSH, pi, Claude Code and Codex use the
same bearer-token API and worker lease loop.

## Start

```bash
export CODE_REVIEW_TOKEN="$(openssl rand -hex 32)"
export CODE_REVIEW_STORE=/var/lib/code-review
node packages/server/dist/reviewd.js            # 127.0.0.1:3100
# or
CODE_REVIEW_HOST=0.0.0.0 CODE_REVIEW_PORT=3100 \
  node packages/server/dist/reviewd.js
```

`CODE_REVIEW_TOKEN` is required and must be at least 32 bytes. It is never logged,
echoed in an error, stored in an event or returned by the API. `CODE_REVIEW_STORE` is the
single-writer store root; `lock` rejects a second live daemon. Optional:
`CODE_REVIEW_HOST`, `CODE_REVIEW_PORT`, `CODE_REVIEW_PUBLIC_URL`.

`review serve --store <dir> [--host <h>] [--port <p>] [--public-url <url>]` starts the same
server from the CLI. It prints `reviewd listening on <url>` and shuts down on SIGINT/SIGTERM.
`GET /` serves the built SPA from `packages/web/dist` (override with `CODE_REVIEW_WEB_DIR`); `/review/<id>`, `/new`, `/auth` and `/health` are SPA deep links. If the UI is not built, a small fallback page explains how to build it.

## Authentication

Machine clients send `Authorization: Bearer <token>`. Browsers obtain an HttpOnly
`cr_session` cookie (HMAC-SHA256, SameSite=Strict, 30 days, `Secure` when the public URL is
HTTPS) from `POST /api/auth` with either `{ "token": "..." }` or a browser
`application/x-www-form-urlencoded` form (`token=...`), and clear it with
`POST /api/auth/logout`. `GET /api/health` and `GET /api/version` need no token.
Mutations are rejected when `Origin`/`Sec-Fetch-Site` is cross-origin. There is no CORS.

Rate limits are fixed-window, per peer: 60 mutations/min and 600 reads/min. A limit
response is `429` with `Retry-After`. All errors use:

```json
{ "error": { "code": "conflict", "message": "...", "details": {} } }
```

Codes: `unauthorized`, `forbidden`, `not-found`, `validation`, `conflict`, `stale-review`,
`agent-busy`, `daemon-unavailable`, `rate-limited`, `internal`.

## Endpoints

| Method | Path                                        | Notes                                                                       |
| ------ | ------------------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/health`                               | probes store/git; `200` healthy or `503` degraded                           |
| GET    | `/api/version`                              | daemon and schema versions                                                  |
| POST   | `/api/auth`                                 | body `{token}`; sets cookie                                                 |
| POST   | `/api/auth/logout`                          | clears cookie                                                               |
| GET    | `/api/config/public`                        | public URL, limits, default base                                            |
| GET    | `/api/repos/branches?path=`                 | validates the repo and returns branch names                                 |
| GET    | `/api/repos/commits?path=&base=&head=`      | merge base and commits between two branches, oldest first                   |
| GET    | `/api/settings/repositories`                | saved repositories and default target branches                              |
| PUT    | `/api/settings/repositories`                | validates and persists `{repositories:[{name,path,defaultTarget?}]}`        |
| GET    | `/api/fs/dirs?path=`                        | subdirectories (max 500) with git markers; defaults to the home dir         |
| POST   | `/api/reviews`                              | `{repoRoot,title,scope,reviewer}`; returns `{review,url,warnings}`          |
| GET    | `/api/reviews`                              | `status`, `limit`, `offset`                                                 |
| GET    | `/api/reviews/:id`                          | `{review,latestSnapshot,report}`                                            |
| PATCH  | `/api/reviews/:id`                          | `{title?,reviewer?,scope?}`; scope change appends a round                   |
| DELETE | `/api/reviews/:id`                          | optional `{reason}`; soft-deletes and cancels a reviewer                    |
| GET    | `/api/reviews/:id/snapshot?round=&file=`    | round diff; `file` lazily selects one file                                  |
| POST   | `/api/reviews/:id/comments`                 | body, path, side, lineStart/lineEnd, optional suggestion                    |
| POST   | `/api/reviews/:id/comments/:cid/replies`    | `{body}`                                                                    |
| POST   | `/api/reviews/:id/comments/:cid/resolve`    | agent-only convenience: resolve one comment as `{name, kind:'agent'}`       |
| PATCH  | `/api/reviews/:id/comments/:cid`            | exactly one of `{body}` or `{state: open\|resolved\|dismissed}`             |
| DELETE | `/api/reviews/:id/comments/:cid`            | soft-deletes; replies stay as a tombstone                                   |
| POST   | `/api/reviews/:id/comments/:cid/suggestion` | `{action: accept\|decline\|apply}`                                          |
| POST   | `/api/reviews/:id/findings/:fid/decision`   | `{state: accepted\|dismissed, note?}`; latest report round only             |
| POST   | `/api/reviews/:id/findings/decisions`       | `{state: accepted\|dismissed, findingIds?}`; selected or all remaining      |
| POST   | `/api/reviews/:id/refresh`                  | optional `{scope}`; appends a round                                         |
| POST   | `/api/reviews/:id/submit`                   | `{verdict,summary?,includeResolved?,harness?}`                              |
| POST   | `/api/reviews/:id/close`                    | `{verdict: approved\|closed}`                                               |
| POST   | `/api/reviews/:id/fix-status`               | `{items:[{commentId,status,evidence?}]}`                                    |
| POST   | `/api/reviews/:id/agent/retry`              | reruns only unfinished shards in the latest round; returns the updated view |
| POST   | `/api/reviews/:id/agent/cancel`             | cancels queued/leased jobs                                                  |
| GET    | `/api/reviews/:id/events?after=`            | long-poll (default 25s) or SSE with `Accept`                                |
| GET    | `/api/events?after=`                        | global long-poll/SSE stream                                                 |
| POST   | `/api/workers/register`                     | `{name?,harness?}`; returns worker + lease timings                          |
| POST   | `/api/workers/:id/heartbeat`                | liveness and lease extension                                                |
| GET    | `/api/jobs/next?workerId=&wait=25`          | long-poll; `204` on timeout                                                 |
| POST   | `/api/jobs/:id/findings`                    | `{attemptId,findings[]}`; each validated, returns `{accepted,rejected}`     |
| POST   | `/api/jobs/:id/report`                      | `{attemptId,report}` idempotent by attempt id                               |
| POST   | `/api/jobs/:id/fail`                        | `{attemptId,code,message,retryable}`                                        |
| GET    | `/api/deliveries/pending?harness=dsh`       | reconnect recovery                                                          |
| POST   | `/api/deliveries/:id/ack`                   | `{by}`                                                                      |
| POST   | `/api/deliveries/:id/fail`                  | `{error}`                                                                   |
| POST   | `/api/gc`                                   | `{olderThanDays}`; closed-by-age reviews and unreferenced snapshots         |

### Finding decisions

`POST /api/reviews/:id/findings/:fid/decision` records a human decision
(`{state: "accepted" | "dismissed", note?: string}`) for a finding from the latest reviewer
report. The latest decision for a `(round, findingId)` wins; notes are trimmed and capped at
4000 characters. An accepted finding stays actionable in feedback (including minor/nit), a
dismissed one is excluded and its note is listed under “Отклонено человеком (не повторять)”.
Closed reviews reject decisions. The report must be final: it must belong to the latest round,
the reviewer must be done, and any coverage ledger must be complete. The event is
`finding/decision` and is folded into `review.findingDecisions`.

`POST /api/reviews/:id/findings/decisions` applies one state to the selected findings, or to
every remaining finding when `findingIds` is omitted, in a single request. `findingIds` is a
non-empty array of up to 1000 strings; unknown, praise and already decided findings are skipped.
Findings with an existing decision for that round are left untouched, including their notes. The
response contains the appended `decisions` and the number of `skipped` findings. Validation
matches the per-finding endpoint: the review must be open and have a final report for its latest
round (complete coverage, reviewer not queued, running, failed, skipped or partial).

### Editing and deleting

`PATCH /api/reviews/:id` accepts `{title?, reviewer?, scope?}`. Metadata edits are
rejected on closed reviews. A scope change builds a new snapshot and appends round
N+1, then queues a reviewer job when the review uses the `worker` backend; an
unchanged scope does not create a round. Scope changes are rejected with `409` while
a reviewer is queued or running. The repository path is immutable.

`DELETE /api/reviews/:id` soft-deletes the review: it disappears from `GET /api/reviews`
and `GET /api/reviews/:id` returns `404`, an active or queued reviewer is cancelled, and
the append-only event log is retained for audit. Deleting an already deleted review is
idempotent. Closed reviews may be deleted.

`POST /api/reviews/:id/comments/:cid/resolve` is the DSH fixer path: it writes the same
`comment/state` event as a human PATCH, but attributes the actor as an agent.

`PATCH /api/reviews/:id/comments/:cid` with `{body}` edits the text only; anchors and
suggestions are unchanged. Edits are rejected on closed reviews and on deleted comments.
`DELETE /api/reviews/:id/comments/:cid` soft-deletes the comment: it leaves diffs, feedback, fix signals and
counts, while any replies remain visible under a “Comment deleted” tombstone. Both
review and comment deletes are append-only events; nothing is physically removed.

### Curl example

```bash
curl -sS -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"repoRoot":"/srv/repo","title":"Feature","scope":{"kind":"range","baseRef":"main","headRef":"feature"},"reviewer":{"backend":"worker"}}' \
  http://127.0.0.1:3100/api/reviews
```

### Events

`GET /api/reviews/:id/events` returns `{events, latestSeq}` for a long-poll, or an SSE
stream (`id: <reviewId>:<seq>`, `event: <type>`, `data: <event>`) when
`Accept: text/event-stream` is present. Reconnect with `Last-Event-ID: <reviewId>:<seq>` or
`?after=<seq>`. Review cursors use the per-review event sequence.

The global stream (`GET /api/events`) uses a separate, monotonically increasing
daemon-wide cursor persisted in `stream-cursor.json`. The cursor is reserved before
events are published, so a restart can skip ids but never reuses one; historical events
may be replayed under new ids, which SSE clients must treat idempotently. Its SSE ids are `<reviewId>:<globalSeq>`, and a long-poll returns
`{events:[{reviewId,event,seq}]}`. Reconnect with that global `seq`; do not mix it with a
review cursor. Before replaying, both streams sync the event log for the requested review
(or every review for the global stream), so a client reconnecting after a daemon restart
still receives historical events rather than only new ones. The in-memory buffer keeps the
last 1000 events per review and globally; the event log remains authoritative. Heartbeats
are sent every 15 seconds.

### Jobs and workers

A worker registers, then calls `GET /api/jobs/next?workerId=<id>&wait=25`. A lease lasts
60 seconds and the worker heartbeat every 20 seconds extends it. An expired lease is
requeued for at most two attempts; after that the job is `failed`. `attemptId` is the
idempotency key for findings, report and failure; duplicate posts are no-ops. Every
accepted step appends an `agent/started`, `agent/finding`, `agent/report` or `agent/failed`
review event, so the review audit trail survives a daemon restart even though queue
leases themselves are in memory.

The job bundle contains `prompt`, the read-only snapshot diff, `schema` and `meta`.
Workers should treat it as read-only and send a `validateReport`-compatible report; each incremental finding is validated before it is recorded.
(`schemaVersion: 1`).

The opt-in `command` backend runs an argv array without a shell. It receives only a minimal
environment (`PATH`, `HOME`, `LANG`/`LC_*`, `TMPDIR`/`TMP`/`TEMP` and `REVIEW_*`) plus
explicitly configured overrides; credentials such as `CODE_REVIEW_TOKEN` are not inherited.
Its stdout and output file are both capped by `maxOutputBytes`, and a timeout or cancel
kills the whole process group so child processes cannot outlive the reviewer.

### Deliveries

`submit` creates a delivery with key `reviewId:round:submissionId`. The initiating harness
reads `GET /api/deliveries/pending?harness=dsh`, injects the markdown/JSON feedback into
the originating agent session, then calls `ack` (or `fail`). Pending deliveries are
recoverable after a reconnect; ack/fail are idempotent and never expose the token. Pending
and acknowledged deliveries are persisted atomically in `deliveries.json` under the store
root, so a daemon restart does not lose a queued submission or resurrect an acknowledged
one.

## CLI

`review diff` remains local and unchanged. Remote commands accept `--daemon <url>` or
`CODE_REVIEW_URL`, and the token from `CODE_REVIEW_TOKEN` (or
`~/.config/code-review/config.json` with mode `0600`).

```bash
review start --repo /srv/repo --base main --reviewer worker --json
review status <id> --json
review feedback <id> --wait --format md
review comments list <id> --json
review comments add <id> --file src/a.ts --line 42 --body 'Please explain'
review submit <id> --request-changes --summary 'Address the blocker'
review refresh <id>
review fix-status <id> --json @claims.json
review health
review gc --older-than 90d
review serve --store /var/lib/code-review --public-url https://review.example
```

`start` without `--head` reviews the current worktree; `--head` selects a range and
`--commit` selects one commit. If `--base` is omitted, the CLI resolves `origin/HEAD` →
`main` → `master` → current branch through `resolveDefaultBase` (falling back to `main` when
the repository is not local to the client).

`start --json` returns the stable shape `{review,url,warnings}`. Other JSON commands return
the corresponding daemon object. Exit codes:

| code | meaning                               |
| ---- | ------------------------------------- |
| 0    | success                               |
| 2    | timeout / not ready                   |
| 3    | authentication or authorization       |
| 4    | daemon unavailable                    |
| 5    | validation or not found               |
| 6    | conflict / stale round / rate limited |

For a systemd unit, run `reviewd` with `EnvironmentFile=/etc/code-review/reviewd.env`
containing `CODE_REVIEW_TOKEN` and `CODE_REVIEW_STORE`; point a reverse proxy at the
listener and set `CODE_REVIEW_PUBLIC_URL` to the public HTTPS origin. Docker deployments
should mount the store as a persistent volume and keep the token in a secret.
