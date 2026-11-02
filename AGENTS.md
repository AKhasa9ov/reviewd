# AGENTS.md

You are an AI coding agent. This file explains how to **use** reviewd, not how to change
this repository. For contributor instructions, read [CONTRIBUTING.md](CONTRIBUTING.md).

reviewd gives an agent a durable review surface: an independent reviewer, human comments,
rounds and a deterministic feedback package.

## Pick your interface

| You are running in…    | Use                                           |
| ---------------------- | --------------------------------------------- |
| DSH 0.2.x              | Native bundle: `review_*` tools and `/review` |
| Claude Code, Codex, pi | Shell out to the `review` CLI                 |
| A custom service       | Authenticated HTTP API                        |
| A shell / CI job       | `review` CLI or `curl`                        |

There is no MCP server in this release. Do not assume a native adapter for a harness other
than DSH.

## Connection

The operator supplies these out of band. Never print, embed or put them in a prompt:

```bash
export CODE_REVIEW_URL=http://127.0.0.1:3100
export CODE_REVIEW_TOKEN="$(cat /run/secrets/code-review-token)"
```

The daemon must be able to see the repository at the same absolute path as the agent.

## The loop

```text
review_feedback / review feedback
  → edit code
  → run tests
  → review_refresh / review refresh
  → review_comments_list / review comments list
  → review_resolve_comment / HTTP resolve
```

Refreshing creates a new round; resolving changes one comment's state. They are not the
same action.

## DSH tools

- `review_start` — create a review for the session workspace or explicit repo/range.
- `review_status` — review, rounds, comments and report status.
- `review_feedback` — read the latest submitted feedback.
- `review_comments_list` — open comments with ids and anchors.
- `review_refresh` — create the next round and re-anchor comments.
- `review_resolve_comment` — resolve a comment you verified, recorded as an agent action.

Tool failures return `{ok:false, error:{code,message}}`; do not retry a validation error
blindly.

## CLI

In a source checkout the entrypoint is `node packages/server/dist/cli.js`; after
publication it is `review` from `@sir_yami/reviewd-server`.

```bash
review start --repo /srv/repo --base main --reviewer worker --json
review status "$REVIEW_ID" --json
review feedback "$REVIEW_ID" --wait --format json
review comments list "$REVIEW_ID" --json
review refresh "$REVIEW_ID"
```

The CLI has **no `comments resolve`** command in this release. Resolve through the DSH tool
or:

```bash
curl -fsS -X POST \
  "$CODE_REVIEW_URL/api/reviews/$REVIEW_ID/comments/$COMMENT_ID/resolve" \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H "x-review-actor: fixer-agent" \
  -H "idempotency-key: resolve-$COMMENT_ID" \
  -H 'content-type: application/json' \
  -d '{}'
```

## Rules

1. Do not edit the review store, database or event log directly.
2. Do not resolve a comment unless the fix is present in the refreshed round and the
   relevant checks pass.
3. Do not treat a moved anchor, applied suggestion or reviewer claim as verified.
4. Do not put the daemon token in a reviewer prompt, environment or repository file.
5. Use `idempotency-key` on mutating HTTP requests that may be retried.
6. Report the command and result for each fix; the human needs evidence, not a claim.
7. Use the API/CLI for review state; never scrape the browser UI.

## Read next

- [Agent integration](docs/agents/README.md)
- [DSH integration](docs/agents/dsh.md)
- [CLI agent loop](docs/agents/cli.md)
- [Reviewer contract](docs/agents/reviewer.md)
- [Fixer contract](docs/agents/fixer.md)
- [Run a fix agent](docs/guides/run-a-fix-agent.md)
- [HTTP API](docs/reference/http-api.md)

For repository work, use [CONTRIBUTING.md](CONTRIBUTING.md) and the
[architecture](docs/architecture.md).
