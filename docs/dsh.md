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
    # sessionId: session-...
    # cwd: /absolute/default/cwd
    # reviewerPreset: dsh-sdd
    # reviewerModel: { provider: openrouter, model: deepseek/deepseek-v4.1-flash-1017 }
```

| Key                                                           | Meaning                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| `daemonUrl`                                                   | External `reviewd` origin. Must be reachable from the DSH host. |
| `token`                                                       | Shared daemon bearer token. Secret; Host-only.                  |
| `worker`                                                      | Register a reviewer worker that long-polls `/api/jobs/next`.    |
| `repoHint`                                                    | Default repository root when the session has no usable cwd.     |
| `reviewerBackend`                                             | `worker`, `command` or `none`, copied into new reviews.         |
| `sessionId`                                                   | Parent session for reviewer agents and fallback initiator.      |
| `cwd`                                                         | Fallback reviewer working directory.                            |
| `reviewerPreset`                                              | Agent preset for reviewer subagents.                            |
| `reviewerModel`                                               | Provider/model/reasoning override for reviewer subagents.       |
| `pollMs`, `deliveryPollMs`, `heartbeatMs`, `requestTimeoutMs` | Loop tuning.                                                    |

`reviewd` rejects tokens shorter than 32 bytes. The token is never sent to the Client,
rendered in a panel, logged, or placed in a URL. The Client calls only same-origin
`/api/code-review/*`; the Host adds `Authorization: Bearer <token>` and strips any
Client-supplied authorization header.

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
long-polls for jobs and creates a subagent through `ctx.agents.create`. The subagent:

- runs in the review's workspace cwd and inherits the configured preset/model;
- has `write`, `edit` and `apply_patch` denied; `bash` remains available for read-only
  commands such as tests and linters;
- receives the job prompt and diff bundle, then returns one JSON report;
- posts findings, report and ack; a malformed report or timeout fails the job with a
  typed code. Plugin disposal cancels an active reviewer.

## Delivery

Feedback for `harness=dsh` is polled from `/api/deliveries/pending`. Each record carries
the initiator saved with the review. The Host resumes that session (including a closed
one) through `ctx.sessionController.resolveAgent`, calls `prompt` with
`mode:'queue'` and the stable idempotency key `cr:<deliveryKey>`, then acks. Prompt
failures leave the delivery pending and retry with capped backoff; no partial prompt is
acked. Legacy/CLI deliveries without an initiator stay pending for a human or CLI.

## Panel

The sidebar entry opens the Code Review panel. It loads reviews through the proxy and
offers a create form. The `Open` link goes to the daemon's standalone UI; that UI asks
for the daemon token once and exchanges it for an HttpOnly session cookie. A missing or
rejected token produces the panel's auth state with a Retry button. The panel uses
Harness `--dsw-alias-*` tokens and does not load the standalone UI bundle.

## Verification

- `pnpm verify` covers typecheck, 34 test files and the DSH bundle tests.
- `packages/dsh/test/integration.test.ts` starts a real daemon, creates a review with an
  initiator, submits feedback and asserts one queued prompt plus an acknowledged
  delivery.
- After install, `plugin_manager list_plugins` should show `include:code-review` active
  and the Host should expose `review_start` in `cordis_inspect_query`.
