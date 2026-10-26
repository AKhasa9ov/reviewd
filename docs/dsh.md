# DSH integration

`packages/dsh` is a Cordis bundle for DeepSeek Harness 0.2.x. It ships two halves:

- **Host**: same-origin daemon proxy, `review_*` tools, `/review` command, reviewer
  worker and feedback delivery into the initiating DSH session.
- **Client**: a `Code Review` entry in `sidebar.panellist` and a keyed `main` panel
  listing reviews and opening the standalone review UI.

The standalone `reviewd` daemon still owns review state, diff snapshots and the full
line-comment UI. DSH is a control surface and delivery bridge; it is not a second store.

## Install

Build the workspace, then install the bundle at its absolute path through the profile
plugin manager (do not hand-edit the profile patch):

```bash
pnpm build
```

```text
plugin_manager install_bundle target=/absolute/path/to/dsh-code-review/packages/dsh
```

A successful install reports `application: applied`, adds `@dsh-code-review/dsh` to the
profile bundle list and activates the inserted `code-review` row. Restart or reload the
Harness page if the client half was not hot-reloaded; a change to the Host half requires
restarting the Harness process so its routes and loops reload.

## Configuration

The bundle's patch inserts one row with defaults. Override its config in the profile's
own patch layer (the layer applied after every bundle):

```yaml
- id: code-review
  config:
    daemonUrl: http://127.0.0.1:3100
    token: '<at least 32 bytes>'
    worker: true
    reviewerBackend: worker
    repoHint: /absolute/repo
    # Optional:
    # publicUrl: https://reviews.example.lan
    # sessionId: session-...
    # cwd: /absolute/default/cwd
    # reviewerPreset: dsh-sdd
    # reviewerModel: { provider: openrouter, model: deepseek/deepseek-v4.1-flash-1017 }
    # reviewerTimeoutMs: 600000
```

| Key                                                           | Meaning                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `daemonUrl`                                                   | `reviewd` origin reachable from the DSH host.                          |
| `publicUrl`                                                   | Browser-facing UI origin when `daemonUrl` is loopback or host-only.    |
| `token`                                                       | Shared daemon bearer token. Secret; Host-only.                         |
| `worker`                                                      | Register a reviewer worker that long-polls `/api/jobs/next`.           |
| `repoHint`                                                    | Default repository root when the session has no usable cwd.            |
| `reviewerBackend`                                             | `worker`, `command` or `none`, copied into new reviews.                |
| `sessionId`                                                   | Parent session for reviewer agents and fallback initiator.             |
| `cwd`                                                         | Fallback reviewer working directory.                                   |
| `reviewerPreset`                                              | Agent preset for reviewer subagents.                                   |
| `reviewerModel`                                               | Provider/model/reasoning override for reviewer subagents.              |
| `reviewerTimeoutMs`                                           | Reviewer deadline in ms (default `600000`); timeouts cancel and retry. |
| `pollMs`, `deliveryPollMs`, `heartbeatMs`, `requestTimeoutMs` | Loop and request tuning.                                               |

`reviewd` rejects tokens shorter than 32 bytes. The token is never sent to the Client,
rendered in a panel, logged, or placed in a URL. The Client calls only same-origin
`/api/code-review/*`; the Host applies DSH's `connection.requestRejection` gate (Host/Origin
fence plus browser/API credentials), replaces any Client-supplied authorization header with
`Authorization: Bearer <token>`, forwards `idempotency-key` and `x-review-actor`, and serves
the authenticated `/api/code-review/info` as `{daemonUrl, publicUrl?}` without the token.

## Tools and command

- `review_start` — create a review for the session workspace, or an explicit repo and
  base/head/commit. The initiator is `{harness:'dsh', sessionId, cwd}`.
- `review_status` — review, round count, comment count, agent report.
- `review_refresh` — create the next round, re-anchor comments and queue verification.
- `review_feedback` — read the latest submitted feedback without delivering it again.
- `/review <instruction>` — create a worktree review for the current workspace and
  return the review URL.

Tool failures return a JSON string with `{ok:false, error:{code,message}}` instead of
throwing. Creating a review stores the initiator in `review/created`, so the daemon can
route feedback even after the originating turn ends.

## Worker

With `worker: true`, the bundle registers a worker named `dsh-code-review`, heartbeats,
long-polls for jobs and creates a subagent through `ctx.agents.create`. Registration
retries a stable worker id with 1s..30s backoff instead of giving up after one failure.
The subagent:

- runs in the review's workspace cwd and inherits the configured preset/model;
- is strictly read-only: tools are restricted to an allowlist of `read`, `grep`, `glob`,
  `review_status` and `review_feedback`; shell, write, network, delegation and
  review-mutating tools are not visible; if restriction cannot be applied the job fails;
- receives the job prompt with a bounded unified diff (60k characters, with an explicit
  truncation marker), then returns one JSON report;
- must return `schemaVersion: 1`; anything else is rejected as non-retryable
  `invalid-output` without posting findings or a report;
- posts findings (server-side validated), report and ack;
- is cancelled with `kind: 'timeout'` and failed with retryable `reviewer-timeout` when
  `reviewerTimeoutMs` expires, and its agent handle is disposed in `finally` on every
  path. Plugin disposal cancels an active reviewer.

## Delivery

Feedback for `harness=dsh` is polled from `/api/deliveries/pending`. Each record carries
the initiator saved with the review. The Host resumes that session (including a closed
one) through `ctx.sessionController.resolveAgent`, calls `prompt` with
`mode:'queue'` and the stable idempotency key `cr:<deliveryKey>`, then acks. Prompt
failures retry with capped backoff; after three failed attempts the Host POSTs
`/api/deliveries/:id/fail` and stops prompting that record. A successful ack resets the
budget; no partial prompt is acked. Legacy/CLI deliveries without an initiator stay
pending for a human or CLI.

## Panel

The sidebar entry opens the Code Review panel. It loads reviews through the proxy and
offers a create form. The `Open` link prefers `publicUrl` over `daemonUrl`, so a daemon
on loopback still produces a link that works from another machine. That UI asks for the
daemon token once and exchanges it for an HttpOnly session cookie. A missing or rejected
token produces the panel's auth state with a Retry button. The panel uses Harness
`--dsw-alias-*` tokens and does not load the standalone UI bundle.

## Verification

- `pnpm verify` covers typecheck and 39 test files (19 core, 7 server, 6 DSH, 4 UI,
  3 web).
- `packages/dsh/test/integration.test.ts` starts a real daemon, creates a review with an
  initiator, submits feedback and asserts one queued prompt plus an acknowledged
  delivery.
- After install, `plugin_manager list_plugins` should show `include:code-review` active
  and the Host should expose `review_start` in `cordis_inspect_query`.
