# DSH integration

`@dsh-code-review/dsh` is one Cordis bundle for DeepSeek Harness 0.2.x. It ships both
halves of the integration plus the review daemon and SPA, so the default install needs no
separate server process:

- **Host**: starts the daemon in-process (embedded mode) or proxies an external one,
  registers the `review_*` tools and `/review` command, runs the reviewer worker and
  delivers feedback into the initiating DSH session.
- **Client**: a `Code Review` entry in `sidebar.panellist` and a keyed `main` panel. The
  panel lists reviews, creates them and opens the full review SPA in a new tab.

Review state is owned by `reviewd` and its filesystem store, not by DSH. Embedded mode
runs that daemon inside the DSH process; external mode connects to one the operator runs.
Both modes use the same store, review lifecycle and HTTP contract.

## Architecture

### Embedded mode (default)

```text
DSH Web UI (browser)
  ├── /code-review/*        SPA served by the bundle, behind the DSH connection gate
  └── /api/code-review/*    panel/SPA API proxy, behind the same gate
        │
        ▼
DSH Host process
  ├── connection.requestRejection()   Host/Origin + DSH session credential check
  ├── proxy → 127.0.0.1:<ephemeral>   adds per-process bearer, strips browser auth
  ├── tools, /review, worker, delivery loops
  └── reviewd (in-process) ── storeDir ── reviews/ snapshots/ deliveries.json
```

The bundle's patch inserts `code-review` with `embedded: true`, `uiBase: /code-review`,
`worker: true` and `reviewerBackend: worker`. It starts `reviewd` on an ephemeral loopback
port and generates a random 32-byte bearer for that instance. The browser only sees the
DSH session cookie; the bearer is injected by the Host and never appears in HTML, URLs,
`/api/code-review/info` or client code. A failed daemon start is reported as a typed 503.

### External mode (`embedded: false`)

```text
DSH Web UI (browser)
  ├── /api/code-review/*    panel API proxy, behind the DSH connection gate
  └── Open link             external review UI (publicUrl or daemonUrl)
        │                         │
        ▼                         ▼
DSH Host process              reviewd (separate process)
  ├── proxy → daemonUrl ────────┘  token login + HttpOnly cookie
  ├── tools, /review, worker, delivery loops
  └── no /code-review static mount
```

External mode does not mount the SPA on the DSH origin. The panel lists reviews through
the same-origin proxy and links to the daemon's own UI, which keeps its token login and
HttpOnly session cookie. The configured `token` is still Host-only: the proxy replaces any
browser `Authorization` header, forwards `idempotency-key` and `x-review-actor`, and keeps
the token out of responses. The daemon may be on loopback with a separate `publicUrl` for
browser links.

## Install

Requires Node.js 22+, DSH 0.2.x and `git` on `PATH`.

```bash
dsh plugin --profile web add @dsh-code-review/dsh
```

This forwards `add` to pnpm in the `web` profile directory. Restart the profile after a
Host-side install so its routes, tools and loops load; DSH HMR can reload only the client
half. From a local checkout, build and pack, then install the tarball with the same
command:

```bash
pnpm fat:verify
dsh plugin --profile web add /absolute/path/to/dsh-code-review-dsh-0.1.0.tgz
```

A successful install adds `@dsh-code-review/dsh` to the profile bundle list and activates
the inserted `code-review` row. The older `plugin_manager install_bundle target=...` flow
still works for an unpacked directory, but the npm package/tarball path above is the
release path. The package id in the manifest is the last segment of the npm name (`dsh`).

## Configuration

The bundle patch supplies defaults; override the row in the profile's own patch layer (the
layer applied after every bundle), not in the package's `cordis.patch.yml`:

```yaml
- id: code-review
  config:
    embedded: true
    storeDir: /var/lib/dsh-code-review
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

| Key                                                           | Meaning                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `embedded`                                                    | `true` (default) starts `reviewd` in-process; `false` uses `daemonUrl`. |
| `uiBase`                                                      | Same-origin mount for the embedded SPA. Default `/code-review`.         |
| `storeDir`                                                    | Embedded store directory. Default `$HOME/.local/share/dsh-code-review`. |
| `daemonUrl`                                                   | External `reviewd` origin. Ignored when `embedded` is true.             |
| `publicUrl`                                                   | Browser-facing UI origin when the daemon URL is loopback or host-only.  |
| `token`                                                       | External daemon bearer. Required (32+ chars) only when not embedded.    |
| `worker`                                                      | Register the reviewer worker. Default `true` in the bundle patch.       |
| `repoHint`                                                    | Default repository root when the session has no usable cwd.             |
| `reviewerBackend`                                             | `worker`, `command` or `none`, copied into new reviews.                 |
| `sessionId`                                                   | Parent session for reviewer agents and fallback initiator.              |
| `cwd`                                                         | Fallback reviewer working directory.                                    |
| `reviewerPreset`                                              | Agent preset for reviewer subagents.                                    |
| `reviewerModel`                                               | Provider/model/reasoning override; an explicit value wins over Host.    |
| `reviewerTimeoutMs`                                           | Reviewer deadline in ms (default `600000`); timeouts cancel and retry.  |
| `pollMs`, `deliveryPollMs`, `heartbeatMs`, `requestTimeoutMs` | Loop and request tuning.                                                |

Embedded mode ignores `daemonUrl` and `token`; its URL and bearer are generated per
process. External mode validates both: `daemonUrl` must be an http(s) URL and `token` must
be at least 32 characters. A configuration problem logs a warning and leaves the tools and
panel in a not-configured state instead of failing activation.

## Authentication and routes

Both `/api/code-review/*` and, in embedded mode, `/code-review/*` pass through
`connection.requestRejection()` before any proxy or static work. That gate applies DSH's
Host/Origin fence and browser/API credential checks. Unauthenticated requests get 401/403;
there is no separate review-token form in embedded mode. The browser authenticates with
its DSH session and never receives the daemon bearer.

- `/api/code-review/info` is authenticated and returns `{daemonUrl, publicUrl?, uiBase?}`
  without the token. The panel uses `uiBase` first in embedded mode and falls back to
  `publicUrl`, then `daemonUrl`, for the `Open` link.
- `/api/code-review/*` proxies to `<daemon>/api/*` and forwards `last-event-id` for SSE.
  Bodies over 2 MiB get 413; an unreachable daemon or failed embedded start gets 502/503.
- `/code-review/` serves the SPA; deep links are `/code-review/review/<id>`. The SPA calls
  `/code-review/api/*`, which the Host proxies to the daemon. Static paths outside the SPA
  contract return 404/405 rather than the index page.
- In external mode the static mount is absent. `/api/code-review` remains available for
  the panel and any DSH-side API calls.

Do not put the daemon token in a URL or in client configuration. In embedded mode there is
no token to configure.

## Tools and command

- `review_start` — create a review for the session workspace, or an explicit repo and
  base/head/commit. The initiator is `{harness:'dsh', sessionId, cwd}`. Embedded mode
  returns the same-origin `/code-review/review/<id>` path, never the loopback daemon URL;
  external mode uses `publicUrl` when configured.
- `review_status` — review, round count, comment count, agent status and report. When
  the round has a coverage ledger, `agent.coverage` carries per-file statuses and totals.
- `review_refresh` — create the next round, re-anchor comments and queue verification.
- `review_feedback` — read the latest submitted feedback without delivering it again.
- `review_comments_list` — open comments with ids, authors, anchors and text; the fixer
  uses it after `review_refresh` to find what it should close.
- `review_resolve_comment` — mark one fixed comment as resolved. The daemon records the
  action as an AI agent, not as a human browser action.
- `/review <title>` — create a worktree review for the current workspace and return the
  same browser-facing review URL as `review_start` (the title is the rest of the command
  input).

Tool failures return a JSON string with `{ok:false, error:{code,message}}` instead of
throwing. Creating a review stores the initiator in `review/created`, so the daemon can
route feedback even after the originating turn ends.

## Worker

With `worker: true`, the bundle registers a worker named `dsh-code-review`, heartbeats,
long-polls for jobs and creates a subagent through `ctx.agents.create`. Registration
retries a stable worker id with 1s..30s backoff instead of giving up after one failure.
If the daemon restarted and forgot the id, `/api/jobs/next` answers 401 and the worker
registers again before polling. In embedded mode the worker waits for the daemon's
readiness before its first poll; a failed embedded start is logged once instead of
becoming a retry loop against a dead port.

The subagent:

- runs in the review's workspace cwd; a configured `reviewerPreset` is mounted
  explicitly on a root reviewer because `agents.create({meta: {agentPreset}})` only labels
  the session and does not compose the preset's tools/model by itself. If the worker
  resolves the initiating DSH session, the reviewer is created as a child agent and no
  separate preset is mounted;
- is strictly read-only: every tool execution passes through `tools.guard()`, which
  allows only `read`, `grep`, `glob`, `review_status`, `review_feedback` and the scoped
  `review_report` tool; shell, write, network, delegation and review-mutating tools fail
  closed. Global `tools.restrict()` cannot hide preset-scoped tools, so the guard is the
  boundary;
- inherits the Host's default model unless `reviewerModel` is set; the explicit override
  wins;
- receives one bounded shard prompt at a time: the shard spans at most 12 files / 120,000
  patch bytes by default, carries a module-aware path filter and only that shard's unified
  diff, and ends with the report contract. The hard per-job diff cap is 220,000 characters;
  an over-cap prompt is marked as truncated instead of silently losing the marker;
- works under honest coverage: the daemon records every changed path in the manifest (up
  to its 64 MiB metadata listing cap) and marks the round `done` only when no known path
  is pending, deferred, failed or skipped, and the manifest is complete. A large review
  can be `partial` under the current single-agent prompt; the panel shows the coverage
  summary (`Reviewed X/Y files`, plus pending/deferred/failed/no-hunks/skipped/
  manifest-only counts when non-zero). `partial` means the rest of the range was not in
  the reviewer's context, not that the review failed. `no-hunks` is terminal for a
  pure rename/mode-only/empty file, or an untracked symlink that was deliberately not
  followed: there is nothing to inspect. A `manifest-listing-truncated` or synthesized `manifest-missing` warning marks
  the ledger `incomplete`, so the round stays `partial` rather than pretending the known
  manifest is the whole range;
- calls the scoped `review_report` tool with the final structured report whenever the
  harness exposes a tool registry; the worker captures the typed call and falls back to
  the newest parseable fenced-JSON report in the durable session log
  (`agent.session.snapshotEvents()`) for older harnesses and command reviewers;
- the tool normalizes a missing `schemaVersion` to `1`; fenced reports without
  `schemaVersion: 1` are rejected as non-retryable `invalid-output` without posting
  findings or a report;
- posts findings (server-side validated), report and ack;
- is cancelled with `kind: 'timeout'` and failed with retryable `reviewer-timeout` when
  `reviewerTimeoutMs` expires, and its agent handle is disposed in `finally` on every
  path. Plugin disposal cancels an active reviewer.

Set `worker: false` to stop this Host from picking up jobs. Reviews created with
`reviewerBackend: worker` then wait for another worker; the sidebar's **New review** form
always requests the worker backend. Use `reviewerBackend: none` for no automated
pre-review, or `command` when the daemon is configured for a command reviewer. With
`none`, the review is created and a skipped report is recorded.

## Delivery

Feedback for `harness=dsh` is polled from `/api/deliveries/pending`. The Host lists
`sessionController` in its required plugin `inject`, so Cordis applies the plugin only while
that bridge is available; a direct `startReviewLoops` call without it logs a warning and
leaves submitted feedback pending. Each record carries the initiator saved with the review.
The Host resumes that session (including a closed one) through
`ctx.sessionController.resolveAgent`, calls `prompt` with
`mode:'queue'` and the stable idempotency key `cr:<deliveryKey>`, then acks. The prompt
starts with an explicit fix-round instruction for `request-changes` and `comment`
submissions; an `approve` submission only receives an approval notice because it closes the
review. Prompt failures retry with capped backoff; after three failed attempts the Host
POSTs `/api/deliveries/:id/fail` and stops prompting that record. A successful ack resets
the budget; no partial prompt is acked. Legacy/CLI deliveries without an initiator stay
pending for a human or CLI.

## Store, upgrade and uninstall

The embedded daemon creates `$HOME/.local/share/dsh-code-review` on first run (the store
also creates missing directories). Set `storeDir` to an absolute path to use another
directory. The store holds the append-only event log, replay caches, snapshots, deliveries,
settings and the single-writer lock; it survives restarts, upgrades and package removal.

Upgrade with `dsh plugin --profile web add @dsh-code-review/dsh@latest`, then restart the
profile. Back up `storeDir` first; the event store is preserved, but this release does not
perform automatic event-schema migrations. Keep the backup if a future version changes the
on-disk format. Uninstall with
`dsh plugin --profile web remove @dsh-code-review/dsh`. Stopping the Host closes the
embedded daemon and discards its in-memory token. Uninstalling does **not** delete review
data; remove `storeDir` manually to erase it.

There is no automatic retention or GC in embedded mode. Reviews remain until the store is
deleted or GC is run manually. The authenticated `POST /api/gc` endpoint is also exposed in
embedded mode through `/api/code-review/gc`; an external daemon additionally supports the
`review gc --older-than 90d` CLI. GC is irreversible, so take a backup first. See
[docs/ops.md](ops.md) for the full retention, backup and upgrade procedure.

## Security notes

- The embedded daemon binds `127.0.0.1` on an ephemeral port with a per-process bearer.
  The DSH connection gate protects both the SPA and the proxy; the daemon port is not a
  second public surface. Do not forward it.
- Embedded mode is single-tenant: anyone who can authenticate to that DSH profile can read
  and modify every review in its store. Treat the DSH profile as the access boundary.
- An external `reviewd` has one shared bearer and no accounts. Keep it on loopback or a
  private network and terminate TLS at a reverse proxy. There is no CORS and no
  per-user audit identity.
- Reviewer comments and output are untrusted. The reviewer is read-only, suggestions are
  not applied automatically, and git access validates paths against the repository root.
- The package contains no secrets, tokens, `.env` files, store data, test fixtures or
  source maps, and runs no postinstall script. Registry scans should expect warnings for
  `child_process` (git and the optional command reviewer spawn without a shell),
  filesystem access (repository reads and store writes) and network access (loopback
  daemon/proxy); these are expected, with no secret exfiltration or destructive behavior.

## Release status

The package name is `@dsh-code-review/dsh` (version `0.1.0`, MIT, public access). The
manifest's repository, homepage and bugs URLs currently point at
`https://github.com/dsh-code-review/dsh-code-review`; **confirm those final public URLs
before npm publish** and update all three fields together if the repository moves. The
package has not been published to npm and has not been submitted to dsh.so. The dsh.so
submit form asks for the public source repository URL (GitHub/Gitee/GitLab), not a local
tarball or ZIP; provide the npm package URL as supporting metadata where the form allows
it. A listing may stay "Declared/unverified" until it is independently install-tested.

## Verification

- `pnpm verify` runs format, lint, typecheck, build and the unit/integration suite,
  including the package metadata/README checks in `packages/dsh/test/package.test.ts`.
- `pnpm fat:verify` builds, packs and inspects the tarball: `index.js`, `client.js`,
  `cordis.patch.yml`, `web/index.html`, `web/assets/*`, `README.md` and `LICENSE`, with no
  `src/`, `test/`, `node_modules/` or `*.map`.
- `packages/dsh/test/integration.test.ts` starts a real daemon, creates a review with an
  initiator, submits feedback and asserts one queued prompt plus an acknowledged delivery.
- `pnpm test:e2e` covers the standalone daemon and its token UI. It does not load the DSH
  plugin or an `embedded: false` DSH profile; the external-mode Host/proxy paths are covered
  by unit tests, not a live external profile. The live fat-package check used a disposable
  profile: panel without a token, review creation, `/code-review/review/<id>` in a new tab,
  comments and deep-link reload, findings in the report and inline view, proxy SSE, and
  cleanup of both DSH and daemon ports on shutdown.
- After install, `dsh plugin --profile web why @dsh-code-review/dsh` should show the
  package in the profile, and the Host should expose `review_start` in
  `cordis_inspect_query`.
