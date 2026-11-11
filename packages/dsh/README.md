# @sir_yami/reviewd

Code review for DeepSeek Harness in one package: a native review panel plus a repository
settings tab, `review_*` tools, `/review`, a reviewer worker, feedback delivery, and the
full review daemon and SPA in the default embedded mode.

See [DSH integration](../../docs/agents/dsh.md) for the user guide and
[Architecture](../../docs/architecture.md) for how the bundle fits together.

The package declares both DSH signals — `dsh.bundle.patch` (the `code-review` row) and
`dsh.client` (the web client that mounts the panel, sidebar icon and settings tab) — and
ships the bundled Host, the built SPA, locale files and the MIT license.

## Install

Requires Node.js 22+ and DSH 0.2.x. `git` must be on `PATH` for diffing.

```bash
dsh plugin --profile web add @sir_yami/reviewd
```

This adds the package to the `web` profile. Restart the profile so the Host routes and
loops load; DSH HMR can reload only the client half. From a local checkout, build and
pack, then install the tarball with the same command:

```bash
pnpm fat:verify
dsh plugin --profile web add /absolute/path/to/sir_yami-reviewd-0.2.0.tgz
```

## Modes

### Embedded (default)

The bundle patch sets `embedded: true`. The Host starts `reviewd` in-process on an
ephemeral `127.0.0.1` port and generates a random 32-byte bearer token for that process.
The token is not written to disk and never reaches the browser.

- The `Code Review` sidebar icon opens a native `main` panel that runs the whole review
  workflow inside DSH: the compact **Reviews** / **New review** / **Health** navigation, the
  review list, review detail with diff and file views, comments, findings and submit. It
  calls `/api/code-review/*` through the same-origin proxy. The native panel has no
  review-token form and no reviewd sidebar or drawer; only the fallback SPA keeps its shell.
- Repository settings are not a panel tab. They live under DSH Settings → Built-in plugins
  → **Code Review**, where the saved repositories, their daemon paths and their default
  target branches are edited.
- In embedded mode the standalone SPA is still served on the DSH origin at `/code-review/`
  for direct links and as a fallback; review deep links are `/code-review/review/<id>`.
- `/code-review` and `/api/code-review` sit behind DSH's connection gate
  (`connection.requestRejection`: Host/Origin fence plus browser/API credentials). The
  browser authenticates with the normal DSH session; no token appears in HTML, URLs or
  client code. Unauthenticated requests get 401/403 before any static or proxy work.
- The daemon keeps review state under `$HOME/.local/share/dsh-code-review` on first run;
  that default is unchanged. `storeDir` accepts any explicit directory, and a leading `~/`
  (or a bare `~`) expands to `$HOME`; `~user` and relative paths are left unchanged and both
  resolve against the Host's working directory. Set the store to
  `~/.local/share/code-review` only when you intentionally want the embedded daemon to share
  the standalone daemon's store; only one daemon may write a store at a time, so stop the
  standalone daemon before starting an embedded daemon on the same store. The store survives
  restarts, upgrades and package uninstalls until you delete it. See
  [Store, upgrade and uninstall](../../docs/agents/dsh.md#store-upgrade-and-uninstall) for
  backup, retention and the single-writer rule.
- `uiBase` defaults to `/code-review`; keep it at that value in this release because the
  shipped SPA is built with that base.

Example profile override:

```yaml
- id: code-review
  config:
    embedded: true
    storeDir: /var/lib/dsh-code-review
    worker: true
    workerConcurrency: 3
    reviewerBackend: worker
```

### External daemon (`embedded: false`)

Set `embedded: false` and point the Host at an existing `reviewd`:

```yaml
- id: code-review
  config:
    embedded: false
    daemonUrl: http://127.0.0.1:3100
    token: '<at least 32 characters>'
    # publicUrl: https://reviews.example.lan
    worker: true
    reviewerBackend: worker
```

`daemonUrl` must be an http(s) URL and `token` must be at least 32 characters. `publicUrl`
is optional and only changes browser-facing links. The bundle does not mount
`/code-review` in this mode. The panel renders the same native workflow through the
same-origin proxy; the daemon's own UI at `publicUrl` (or `daemonUrl`) stays available for
direct links and keeps its own token login and HttpOnly cookie. The configured `token` stays
Host-only: the proxy replaces any browser Authorization header with the bearer. It forwards
`accept`, `content-type`, `idempotency-key`, `x-review-actor`, `x-review-actor-kind` and
`last-event-id` (for SSE), and never forwards the browser's own `authorization`; when no kind
header is present it sends `x-review-actor-kind: human` so browser actions stay human. The
panel's API client uses `/api/code-review` as its base and appends `/api/...` paths, and the
proxy forwards a remainder that already starts with `/api` unchanged, so both
`/api/code-review/reviews` and `/api/code-review/api/reviews` reach the daemon's
`/api/reviews`. `/api/code-review/info` returns addresses without the token.

Use the profile's own patch layer for these overrides; do not edit the package's
`cordis.patch.yml`.

## Tools and command

- `review_start` — create a review for the session workspace, or an explicit repo and
  base/head/commit. In embedded mode its `url` is the same-origin
  `/code-review/review/<id>` path; external mode uses `publicUrl` when configured and the
  daemon URL otherwise.
- `review_status` — review, round count, comment count and agent report.
- `review_refresh` — create the next round, re-anchor comments and queue verification.
- `review_feedback` — read the latest submitted feedback without delivering it again.
- `review_comments_list` — open comments with ids, authors, anchors and text.
- `review_reply_comment` — reply to an open comment as an agent without changing its state.
- `review_resolve_comment` — mark a fixed comment resolved; the event records an AI agent.
- `/review <title>` — create a worktree review for the current workspace and return the
  same browser-facing URL as `review_start` (a `/code-review/review/<id>` path in embedded
  mode).

Tool failures return `{ok:false, error:{code,message}}` instead of throwing. The initiating
DSH session is stored with the review so feedback can be routed after the turn ends.

## Worker

`worker: true` (the patch default) registers the `dsh-code-review` worker. It heartbeats,
long-polls `/api/jobs/next`, creates a reviewer subagent in the job's workspace, and posts
findings, a report and an acknowledgement. Reviewer model selection inherits the Host
default; an explicit `reviewerModel` wins. A configured `reviewerPreset` is mounted
explicitly on the root reviewer agent. When the worker resolves the initiating DSH session,
the reviewer is created as its child and does not mount a separate preset.

`workerConcurrency` (default **3**, clamped to 1–8) starts that many independent worker
loops. Each loop registers its own worker, heartbeats and leases at most one shard at a
time, so independent shards can finish in parallel. The cap is global to the Host and is
shared by every review; parallel shards increase model request concurrency, not the total
amount of review work. Set it to `1` for the previous serial behavior, or lower it when the
model provider's concurrency or rate limit is tighter.

The reviewer is read-only: every tool execution passes `tools.guard()`, which allows only
`read`, `grep`, `glob`, `review_status` and `review_feedback`. Shell, write, network,
delegation and review-mutating tools fail closed even when a preset exposes them. The
worker reads the report from the durable session log, requires `schemaVersion: 1`, and
cancels the agent with a retryable failure when `reviewerTimeoutMs` expires (default ten
minutes).

Set `worker: false` to stop this Host from picking up jobs. Reviews created with
`reviewerBackend: worker` then wait for another worker. The panel's **New review** form
defaults to Manual review only and offers Agent worker to queue a reviewer job. Use
`reviewerBackend: none` for no automated pre-review, or `command` when the daemon is
configured for a command reviewer.

## Security notes

- The embedded daemon listens on loopback only and accepts just its per-process bearer.
  The DSH connection gate protects `/code-review` and `/api/code-review`; the daemon token
  is injected by the Host, never rendered or returned to the browser.
- Embedded mode is single-tenant: every user who can authenticate to that DSH profile can
  read and modify every review in its store. Treat the DSH profile as the access boundary.
- An external `reviewd` has one shared bearer token and no accounts. Keep it on loopback
  or a private network and terminate TLS at a reverse proxy; never expose it directly.
- Review comments and reviewer output are untrusted data. The reviewer is read-only,
  suggestions are not applied automatically, and git access validates paths against the
  repository root.
- Registry scans should expect `child_process`, filesystem and network warnings: `git`
  and the optional command reviewer spawn without a shell, the daemon reads repositories
  and writes its store, and the Host serves the loopback daemon and proxies HTTP. There are
  no packaged secrets, tokens, store data, test fixtures or source maps, and no telemetry
  or postinstall script.

## Upgrade, uninstall and data retention

Upgrade with `dsh plugin --profile web add @sir_yami/reviewd@latest`, then restart the
profile. Back up `storeDir` before upgrading; the event store is preserved. This release
does not perform automatic event-schema migrations, so restore the backup if a future
version changes the on-disk format.

Uninstall with `dsh plugin --profile web remove @sir_yami/reviewd`. Stopping the Host
closes the embedded daemon and discards its in-memory token. Uninstalling does **not**
delete review data: remove `storeDir` (by default `$HOME/.local/share/dsh-code-review`)
manually to erase it.

There is no automatic retention or GC in embedded mode. Reviews remain until you delete
the store or run GC manually. The authenticated `POST /api/gc` endpoint is also reachable
in embedded mode through `/api/code-review/gc`; in external mode
`review gc --older-than 90d` is the supported CLI. GC is irreversible, so take a backup
first.
