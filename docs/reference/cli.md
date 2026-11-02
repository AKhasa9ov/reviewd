# CLI reference

The `review` CLI has two modes:

- **local** — `review diff` builds a snapshot without a daemon;
- **remote** — every other command talks to `reviewd` over the authenticated HTTP API.

Once the npm packages are published, install the CLI with:

```bash
npm install -g @dsh-code-review/server
review version
```

In a source checkout, build once and use the generated entrypoint:

```bash
pnpm install
pnpm build
node packages/server/dist/cli.js version
```

## Connection

Remote commands resolve the daemon URL and token in this order:

1. `--daemon <url>` and `--token <value>`;
2. `CODE_REVIEW_URL` and `CODE_REVIEW_TOKEN`;
3. `~/.config/code-review/config.json` (mode `0600`).

The daemon URL must include the scheme, for example `http://127.0.0.1:3100`. The token must
be at least 32 bytes. Never put the token in a shell history, URL or prompt.

```bash
export CODE_REVIEW_URL=http://127.0.0.1:3100
export CODE_REVIEW_TOKEN="$(cat /run/secrets/code-review-token)"
review health
```

## Commands

### Start a review

```bash
review start --repo /srv/repo --base main --reviewer worker --json
```

| Flag           | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `--repo`       | Repository root; defaults to the current directory.                      |
| `--base`       | Base ref; defaults to `origin/HEAD`, `main`, `master` or current branch. |
| `--head`       | Head ref for a range.                                                    |
| `--commit`     | Review one commit against its first parent.                              |
| `--worktree`   | Diff the base against the working tree.                                  |
| `--title`      | Review title; defaults to `Code review`.                                 |
| `--reviewer`   | `worker`, `none`, `command` or `auto` (worker).                          |
| `--session-id` | Initiating session id for feedback delivery.                             |
| `--harness`    | Initiating harness name; requires `--session-id`.                        |
| `--cwd`        | Initiating working directory; requires `--session-id`.                   |
| `--wait-agent` | Wait up to 30s for a worker to finish before returning.                  |
| `--json`       | Emit `{review,url,warnings}`.                                            |

Without `--head`, `--commit` or an explicit `--worktree`, `start` reviews the current
worktree. Choose only one of `--head`, `--commit` or `--worktree`.

### Status and feedback

```bash
review status <id> --json
review feedback <id> --wait --format md
review feedback <id> --wait --format json > feedback.json
```

`feedback` exits `2` if `--wait` reaches its timeout. The package is deterministic for a
review round; reading it does not acknowledge a delivery.

### Comments

```bash
review comments list <id> --json
review comments add <id> --file src/a.ts --line 42 --body 'Please explain'
review comments add <id> --file src/a.ts --line 42 --end-line 48 --side new --body 'Range'
```

`--side` is `new` (default) or `old`. `--end-line` creates a range.

The CLI has **no** `comments resolve` subcommand in this release. A fixer agent resolves a
comment with the HTTP route:

```bash
curl -fsS -X POST \
  "$CODE_REVIEW_URL/api/reviews/$ID/comments/$COMMENT_ID/resolve" \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H "x-review-actor: fixer-agent" \
  -H "idempotency-key: resolve-$COMMENT_ID" \
  -H 'content-type: application/json' \
  -d '{}'
```

The DSH equivalent is `review_resolve_comment`.

### Submit, refresh and findings

```bash
review submit <id> --request-changes --summary 'Address the blocker'
review submit <id> --approve --summary 'Looks good'
review submit <id> --comment --summary 'Questions only'
review refresh <id>
review transfer-findings <id>
```

`submit` requires exactly one verdict: `--approve`, `--request-changes` or `--comment`.
An approve verdict closes the review; the other verdicts keep it open. A round can be
submitted once.

`refresh` creates the next immutable round, re-anchors comments and queues verification.

`transfer-findings` moves accepted findings into review comments when that workflow is
enabled on the server.

### Fix status

```bash
review fix-status <id> --json @claims.json
```

`fix-status` posts structured fix claims. It does not resolve comments; use the HTTP resolve
route or the DSH tool for that.

### Health and GC

```bash
review health --json
review gc --older-than 90d
```

`gc` is irreversible. Back up the store first; see [Deploy reviewd](../guides/deploy.md).

### Serve

```bash
review serve --store /var/lib/code-review \
  --host 127.0.0.1 --port 3100 \
  --public-url https://review.example
```

`serve` starts the same daemon as `reviewd` and prints the listener URL. It reads
`CODE_REVIEW_TOKEN` from the environment; the token is required.

### Local diff

```bash
review diff --repo /srv/repo --base main --head HEAD --json > snapshot.json
```

| Flag             | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| `--repo`         | Repository root; defaults to current directory.             |
| `--base`         | Base ref.                                                   |
| `--head`         | Head ref; defaults to `HEAD`.                               |
| `--worktree`     | Diff the base against staged, unstaged and untracked files. |
| `--commit`       | Diff a commit against its first parent.                     |
| `--two-dot`      | Use `base..head` instead of the merge base.                 |
| `--json`         | Emit the full snapshot JSON.                                |
| `--no-untracked` | Exclude untracked files.                                    |
| `--no-content`   | Omit file content.                                          |
| `--max-files`    | Cap reviewable files.                                       |
| `--max-lines`    | Cap lines per file.                                         |
| `--ignore`       | Mark a path pattern ignored; repeatable.                    |

Flags take a separate value (`--base main`). `--flag=value` and `--` are not supported.

## Exit codes

Remote commands:

| Code | Meaning                               |
| ---- | ------------------------------------- |
| 0    | success                               |
| 2    | timeout / not ready                   |
| 3    | authentication or authorization       |
| 4    | daemon unavailable                    |
| 5    | validation or not found               |
| 6    | conflict / stale round / rate limited |

Local `review diff`:

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | success                                   |
| 1    | internal failure                          |
| 5    | usage, git validation or unsupported diff |

## See also

- [HTTP API](http-api.md)
- [Run a fix agent](../guides/run-a-fix-agent.md)
- [Connect an agent](../guides/connect-an-agent.md)
- [Troubleshoot](../guides/troubleshoot.md)
