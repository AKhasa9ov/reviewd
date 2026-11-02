# CLI agent loop

Use the CLI when the harness can run shell commands but does not have a native reviewd
adapter. This is the portable path for Claude Code, Codex, pi and custom agents.

## Setup

The operator provides the daemon URL and token; the agent must not discover or print them.

```bash
export CODE_REVIEW_URL=http://127.0.0.1:3100
export CODE_REVIEW_TOKEN="$(cat /run/secrets/code-review-token)"
```

In a source checkout the binary is `node packages/server/dist/cli.js`; after publication it
is `review` from `@dsh-code-review/server`.

The repository must be visible to the daemon at the same absolute path.

## Start

```bash
review start --repo /srv/repo --base main --reviewer worker --json > start.json
jq -r '.review.review.id, .url' start.json
```

`start --json` returns the created review view, its browser URL and snapshot warnings.
Without `--head`, `start` reviews the current worktree. Use `--head feature` for a range or
`--commit <sha>` for one commit.

A human can create the review instead and give the agent the id. Prefer this when a worker
or a model is not available.

## Read feedback

```bash
review feedback "$REVIEW_ID" --wait --format json > feedback.json
```

The package contains:

- `humanComments` — open human comments with anchors;
- `findings` — accepted findings with decisions and notes;
- `dismissedFindings` — rejected findings the agent should not repeat;
- `acceptedSuggestions` / `appliedSuggestions`;
- `questions`, `verification` and `resolved`.

Read the whole package before editing. Do not resolve a comment just because the feedback
mentions it.

## List comments

```bash
review comments list "$REVIEW_ID" --json
```

The output includes comment ids, states and anchor locations. Use the ids in the resolve
request.

## Fix and refresh

Make the changes, run the repository's tests, then:

```bash
review refresh "$REVIEW_ID"
review status "$REVIEW_ID" --json
```

`refresh` creates the next immutable round. It does not resolve anything.

## Resolve

The CLI has no `comments resolve` subcommand. Resolve through the HTTP endpoint:

```bash
curl -fsS -X POST \
  "$CODE_REVIEW_URL/api/reviews/$REVIEW_ID/comments/$COMMENT_ID/resolve" \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H "x-review-actor: fixer-agent" \
  -H "idempotency-key: resolve-$COMMENT_ID" \
  -H 'content-type: application/json' \
  -d '{}'
```

The `x-review-actor` header names the agent in the event. A retry with the same
`idempotency-key` is safe. Confirm `comment.state == "resolved"` in the response.

## Report

Give the human:

- the review id and refreshed round;
- each resolved comment id and what changed;
- the command/test that proves it;
- remaining limitations or follow-ups.

Example:

```text
Review rev_01J... round 2.
Resolved cmt_01J...: retry preserves the last item (src/app.ts:42).
Verified: pnpm test -- tests/retry.test.ts (12 passed).
Remaining: drag-range regression test not added.
```

## Error handling

| Exit / status | Meaning                         | Action                                           |
| ------------- | ------------------------------- | ------------------------------------------------ |
| `2`           | timeout / not ready             | Poll again; do not spin without a bound.         |
| `3`           | auth                            | Operator fixes the token; do not guess.          |
| `4`           | daemon unavailable              | Stop and report; do not retry forever.           |
| `5`           | validation / not found          | Re-read the review; fix the request.             |
| `6`           | conflict / stale / rate limited | Refresh or back off; retry idempotently.         |
| `401`/`403`   | HTTP auth                       | Check token and origin; do not expose the token. |
| `409`         | stale review                    | Refresh the review and retry.                    |
| `429`         | rate limit                      | Honor `Retry-After`.                             |

## Prompt fragment

```text
Use the review CLI to read feedback for review <id>.
Do not print or embed CODE_REVIEW_TOKEN.
Make the requested changes, run the repository tests, then call review refresh.
Resolve only comments you verified. For each, report the comment id,
the changed file, and the command that proves the fix.
```

## See also

- [CLI reference](../reference/cli.md)
- [Fixer contract](fixer.md)
- [Connect an agent](../guides/connect-an-agent.md)
- [Run a fix agent](../guides/run-a-fix-agent.md)
