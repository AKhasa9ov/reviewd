# @dsh-code-review/dsh

Code review for DeepSeek Harness in one package: a sidebar panel, `review_*` tools,
`/review`, a reviewer worker, feedback delivery, and the full review daemon and UI in the
default embedded mode.

The package declares both DSH signals — `dsh.bundle.patch` (the `code-review` row) and
`dsh.client` (the web client) — and ships the bundled Host, the built SPA, locale files and
the MIT license.

## Install

Requires Node.js 22+ and DSH 0.2.x. `git` must be on `PATH` for diffing.

```bash
dsh plugin --profile web add @dsh-code-review/dsh
```

This adds the package to the `web` profile. Restart the profile so the Host routes and
loops load; DSH HMR can reload only the client half. From a local checkout, build and pack,
then install the tarball with the same command:

```bash
pnpm fat:verify
dsh plugin --profile web add /absolute/path/to/dsh-code-review-dsh-0.1.0.tgz
```

## Modes

### Embedded (default)

The bundle patch sets `embedded: true`. The Host starts `reviewd` in-process on an
ephemeral `127.0.0.1` port and generates a random 32-byte bearer token for that process.
The token is not written to disk and never reaches the browser.

- The full review SPA is served on the DSH origin at `/code-review/`; review deep links are
  `/code-review/review/<id>`. The sidebar panel calls `/api/code-review/*`, and `Open`
  opens the same-origin SPA in a new tab.
- `/code-review` and `/api/code-review` sit behind DSH's connection gate
  (`connection.requestRejection`: Host/Origin fence plus browser/API credentials). The
  browser authenticates with the normal DSH session; there is no review-token form and no
  token in HTML, URLs or client code. Unauthenticated requests get 401/403 before any
  static or proxy work.
- The daemon keeps review state under `$HOME/.local/share/dsh-code-review` on first run.
  Set `storeDir` to an absolute path to use another directory. The store survives restarts,
  upgrades and package uninstalls until you delete it.
- `uiBase` defaults to `/code-review`; keep it at that value in this release because the
  shipped SPA is built with that base.

Example profile override:

```yaml
- id: code-review
  config:
    embedded: true
    storeDir: /var/lib/dsh-code-review
    worker: true
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
`/code-review` in this mode. The panel lists reviews through the same-origin proxy and
links to the external review UI at `publicUrl` (or `daemonUrl`), which keeps its own token
login and HttpOnly cookie. The configured `token` stays Host-only: the proxy replaces any
browser Authorization header with the bearer and forwards only `idempotency-key` and
`x-review-actor`; `/api/code-review/info` returns addresses without the token.

Use the profile's own patch layer for these overrides; do not edit the package's
`cordis.patch.yml`.

## Tools and command

- `review_start` — create a review for the session workspace, or an explicit repo and
  base/head/commit.
- `review_status` — review, round count, comment count and agent report.
- `review_refresh` — create the next round, re-anchor comments and queue verification.
- `review_feedback` — read the latest submitted feedback without delivering it again.
- `/review <title>` — create a worktree review for the current workspace and return its
  URL.

Tool failures return `{ok:false, error:{code,message}}` instead of throwing. The initiating
DSH session is stored with the review so feedback can be routed after the turn ends.

## Worker

`worker: true` (the patch default) registers the `dsh-code-review` worker. It heartbeats,
long-polls `/api/jobs/next`, creates a reviewer subagent in the job's workspace, and posts
findings, a report and an acknowledgement. Reviewer model selection inherits the Host
default; an explicit `reviewerModel` wins. A configured `reviewerPreset` is mounted
explicitly.

The reviewer is read-only: every tool execution passes `tools.guard()`, which allows only
`read`, `grep`, `glob`, `review_status` and `review_feedback`. Shell, write, network,
delegation and review-mutating tools fail closed even when a preset exposes them. The
worker reads the report from the durable session log, requires `schemaVersion: 1`, and
cancels the agent with a retryable failure when `reviewerTimeoutMs` expires (default ten
minutes).

Set `worker: false` to stop this Host from picking up jobs. Reviews created with
`reviewerBackend: worker` then wait for another worker; the sidebar's **New review** form
always requests the worker backend. Use `reviewerBackend: none` for no automated
pre-review, or `command` when the daemon is configured for a command reviewer.

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

Upgrade with `dsh plugin --profile web add @dsh-code-review/dsh@latest`, then restart the
profile. Back up `storeDir` before upgrading; the event store is preserved and migrated in
place.

Uninstall with `dsh plugin --profile web remove @dsh-code-review/dsh`. Stopping the Host
closes the embedded daemon and discards its in-memory token. Uninstalling does **not**
delete review data: remove `storeDir` (by default `$HOME/.local/share/dsh-code-review`)
manually to erase it.

There is no automatic retention or GC in embedded mode. Reviews remain until you delete
the store. The daemon exposes authenticated `POST /api/gc`; in external mode
`review gc --older-than 90d` is the supported CLI. GC is irreversible, so take a backup
first.
