# Connect an agent

reviewd does not require a particular agent framework. The daemon exposes one authenticated
HTTP contract; DSH has a native bundle, and every other harness can use the CLI or HTTP.

## Choose an integration

| Harness                | Recommended integration              | Native adapters?                     |
| ---------------------- | ------------------------------------ | ------------------------------------ |
| DSH 0.2.x              | `@dsh-code-review/dsh`               | Yes: panel, tools, `/review`, worker |
| Claude Code            | Shell out to `review` CLI            | No                                   |
| Codex                  | Shell out to `review` CLI            | No                                   |
| pi                     | Shell out to `review` CLI            | No                                   |
| Custom agent / service | Authenticated HTTP API               | No; use the documented API           |
| Custom worker          | `@dsh-code-review/worker` lease loop | Library, bring your own runner       |
| Plain shell / CI       | `review` CLI or `curl`               | No                                   |

There is **no MCP server** and no Claude Code/Codex/pi plugin in this release. The stable
integration surface is the CLI and HTTP API. Do not build a dependency on internal package
imports.

## Roles

| Role           | What it does                                                       | Allowed to mutate review state? |
| -------------- | ------------------------------------------------------------------ | ------------------------------- |
| Reviewer agent | Reads the snapshot and posts findings/questions/suggestions.       | Only through the job/report API |
| Fixer agent    | Reads feedback, edits code, refreshes and resolves fixed comments. | Yes, with the daemon token      |
| Human          | Creates reviews, comments, decides findings, submits and approves. | Yes                             |

A reviewer must not receive the daemon token in its prompt or environment. The worker
process owns transport authentication; the reviewer gets a read-only snapshot.

## Option 1: DSH

Install the bundle:

```bash
dsh plugin --profile web add @dsh-code-review/dsh
```

Restart the profile. Embedded mode starts the daemon in-process and exposes:

- a **Code Review** sidebar panel and SPA at `/code-review`;
- `review_start`, `review_status`, `review_refresh`, `review_feedback`,
  `review_comments_list` and `review_resolve_comment`;
- `/review <title>` for the current workspace;
- a reviewer worker when `worker: true`;
- feedback delivery into the initiating session.

See [DSH integration](../agents/dsh.md) for modes, configuration and data retention.

## Option 2: CLI

Use this for Claude Code, Codex, pi, a shell script or CI.

```bash
export CODE_REVIEW_URL=http://127.0.0.1:3100
export CODE_REVIEW_TOKEN="$(cat /run/secrets/code-review-token)"

review start --repo /srv/repo --base main --reviewer worker --json
```

The JSON result contains the review and its browser URL. Use the id for the rest of the
loop:

```bash
review status "$REVIEW_ID" --json
review feedback "$REVIEW_ID" --wait --format json
review comments list "$REVIEW_ID" --json
review refresh "$REVIEW_ID"
review submit "$REVIEW_ID" --request-changes --summary 'Address the blocker'
```

The CLI has no `comments resolve` subcommand. Fixer agents resolve a comment through the
HTTP route shown in [Run a fix agent](run-a-fix-agent.md#option-b-cli-http).

Installation from npm is pending the `0.1.0` registry publication. In a source checkout:

```bash
pnpm install
pnpm build
node packages/server/dist/cli.js start --repo /srv/repo --base main --json
```

### Driving it from an agent

Give the agent three things:

1. a checkout path visible to the daemon;
2. `CODE_REVIEW_URL` and a token provided by the operator, not pasted into the prompt;
3. permission to run the specific CLI commands, not arbitrary shell access.

A safe agent prompt fragment:

```text
Use the review CLI to read feedback for review <id>.
Do not print or embed CODE_REVIEW_TOKEN.
Make the requested changes, run the repository tests, then call review refresh.
Resolve only comments you verified; report the command and result for each.
```

## Option 3: HTTP

Use the API for a service, a custom harness or a language without the CLI. Every request
uses the bearer token:

```bash
curl -fsS \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "repoRoot": "/srv/repo",
    "title": "Feature review",
    "scope": {"kind": "range", "baseRef": "main", "headRef": "feature"},
    "reviewer": {"backend": "worker"}
  }' \
  "$CODE_REVIEW_URL/api/reviews"
```

Use `idempotency-key` for mutations that may be retried. Use the worker endpoints for a
custom reviewer; see [HTTP API](../reference/http-api.md) and
[Worker protocol](../reference/worker-protocol.md).

The browser uses a cookie, not a bearer token. Do not scrape the SPA or reuse the browser
session for an agent.

## Option 4: Custom worker

`@dsh-code-review/worker` provides the lease loop but deliberately does not choose a model,
build a prompt or spawn a harness. Implement `HarnessRunner.run(lease, signal)` and return a
`schemaVersion: 1` report. See the
[worker contract](../agents/reviewer.md#worker-loop) and
[packages/worker/README.md](../../packages/worker/README.md).

## Integration checklist

- [ ] Daemon reachable at `CODE_REVIEW_URL`; token is at least 32 bytes.
- [ ] Repository path exists **inside** the daemon's filesystem view.
- [ ] `CODE_REVIEW_PUBLIC_URL` matches the browser origin exactly.
- [ ] Reviewer worker is registered if using `reviewerBackend: worker`.
- [ ] Agent knows the review id and can run only the intended commands.
- [ ] Token is injected by the host, never placed in model context.
- [ ] Fixer resolves comments only after verification.
- [ ] Feedback delivery is acknowledged if the harness uses deliveries.

## Next

- [DSH integration](../agents/dsh.md)
- [CLI agent loop](../agents/cli.md)
- [Reviewer contract](../agents/reviewer.md)
- [Fixer contract](../agents/fixer.md)
- [HTTP API](../reference/http-api.md)
