# Agent integration

This section is for agents that use reviewd. For contributor rules, use
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## Choose an interface

| Harness                | Interface                            | Native? |
| ---------------------- | ------------------------------------ | ------- |
| DSH 0.2.x              | `@dsh-code-review/dsh` bundle        | Yes     |
| Claude Code, Codex, pi | `review` CLI (shell)                 | No      |
| Custom service         | HTTP API                             | No      |
| Custom reviewer        | `@dsh-code-review/worker` lease loop | Library |
| CI / shell             | CLI or `curl`                        | No      |

No MCP server and no native Claude Code/Codex/pi plugin are shipped in this release.

## Roles

- **Reviewer** — reads a read-only snapshot and posts structured findings. It does not get
  the daemon token.
- **Fixer** — reads feedback, edits code, refreshes the review and resolves verified
  comments. It needs the daemon token, supplied by the operator out of band.
- **Human** — creates reviews, comments, decides findings, submits and approves.

## Minimal fix loop

```bash
review feedback "$REVIEW_ID" --wait --format json
review comments list "$REVIEW_ID" --json

# edit, run checks

review refresh "$REVIEW_ID"
curl -fsS -X POST \
  "$CODE_REVIEW_URL/api/reviews/$REVIEW_ID/comments/$COMMENT_ID/resolve" \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H "x-review-actor: fixer-agent" \
  -H "idempotency-key: resolve-$COMMENT_ID" \
  -H 'content-type: application/json' \
  -d '{}'
```

The CLI has no `comments resolve` subcommand; the DSH tool is `review_resolve_comment`.

## Rules

1. Never put `CODE_REVIEW_TOKEN` in a prompt, model context, repository file or log.
2. Resolve only comments that are fixed in the refreshed round and verified by a check.
3. Use `idempotency-key` for retried mutations.
4. Do not edit the store or scrape the SPA.
5. Report evidence (command, result, remaining risk), not just "fixed".

## Guides

- [DSH integration](dsh.md) — native bundle, modes, tools, worker.
- [CLI agent loop](cli.md) — portable command workflow.
- [Reviewer contract](reviewer.md) — findings, report validation, worker.
- [Fixer contract](fixer.md) — feedback, resolution and evidence.
- [Connect an agent](../guides/connect-an-agent.md) — integration matrix.
- [Run a fix agent](../guides/run-a-fix-agent.md) — end-to-end walkthrough.
