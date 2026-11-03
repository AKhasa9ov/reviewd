# Run a fix agent

A fix agent reads submitted feedback, changes the code, refreshes the review and resolves
only the comments it actually fixed. reviewd records the resolution as an **agent** action;
it never pretends a human verified the fix.

This guide works for DSH, a shell-based coding agent, or any HTTP client.

## The loop

```text
read feedback
  → edit code
  → run tests
  → refresh review
  → list open comments
  → reply with progress or evidence when useful
  → resolve comments that are actually fixed
  → report evidence to the human
```

Refreshing is not resolving. A refresh creates a new round and re-anchors comments; a
resolve changes one comment's state. Keep the two actions separate so the audit trail shows
what changed and what the agent claims.

## Option A: DSH

In a DSH session with the review bundle installed:

1. `review_feedback` with the review id returns the latest submitted package without
   delivering it again.
2. Apply the requested changes and run the tests.
3. `review_refresh` creates the next round.
4. `review_comments_list` returns open comments and their ids.
5. `review_reply_comment` with `{reviewId, commentId, body}` answers a question or records
   a progress/evidence note. It adds a reply but keeps the comment open.
6. `review_resolve_comment` marks each fixed comment resolved. The event actor is an AI
   agent, not the human who submitted the review.

Tool failures return `{ok:false, error:{code,message}}` rather than throwing. Follow the
[DSH integration guide](../agents/dsh.md) for install and worker configuration.

## Option B: CLI + HTTP

Set the daemon connection once:

```bash
export CODE_REVIEW_URL=http://127.0.0.1:3100
export CODE_REVIEW_TOKEN="$(cat /run/secrets/code-review-token)"
```

Read the feedback as JSON:

```bash
review feedback "$REVIEW_ID" --wait --format json > feedback.json
```

Inspect the open comments:

```bash
review comments list "$REVIEW_ID" --json
```

Make the changes and run the repository's tests. Then create the next round:

```bash
review refresh "$REVIEW_ID"
review status "$REVIEW_ID" --json
```

Reply in the channel when the human asked a question or needs progress evidence. The CLI
prints the new reply id:

```bash
review comments reply "$REVIEW_ID" \
  --comment "$COMMENT_ID" \
  --body 'Fixed the retry guard; pnpm test tests/retry.test.ts passes.'
```

Resolve a fixed comment through the HTTP endpoint. The CLI intentionally has **no**
`review comments resolve` command in this release:

```bash
curl -fsS -X POST \
  "$CODE_REVIEW_URL/api/reviews/$REVIEW_ID/comments/$COMMENT_ID/resolve" \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H "x-review-actor: fixer-agent" \
  -H "idempotency-key: resolve-$COMMENT_ID" \
  -H 'content-type: application/json' \
  -d '{}'
```

The `x-review-actor` header names the agent in the event. Without it, the daemon records
`AI fixer`. `idempotency-key` makes a retried request safe.

The response is the updated review view. Check `comment.state` is `resolved` before moving
on.

## What to resolve

Resolve a comment only when:

- the reported behavior is actually fixed;
- the change is in the refreshed round;
- the relevant tests or checks pass;
- the comment is still open.

Do **not** resolve a comment because the diff moved, because a suggestion was applied
without verification, or because the review is noisy. Those are separate signals. A
dismissed finding is not the same as a fixed comment.

## Evidence to report

A useful fix report includes:

- the comment id and what changed;
- the command or test that proves it;
- any remaining limitation or follow-up;
- a link to the refreshed round.

Example:

```text
Resolved cmt_01J... in src/app.ts: retry now preserves the last item.
Verified: pnpm test -- tests/retry.test.ts (12 passed).
Remaining: no UI regression test for the drag-selected range.
```

## Failure handling

| Symptom                                 | Action                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `401` / `403`                           | Check `CODE_REVIEW_TOKEN` and that the daemon is running.                                  |
| `404` on the comment                    | Re-read the review; the comment id may be stale or deleted.                                |
| `409 stale-review`                      | Refresh again and re-read the current round.                                               |
| Resolve succeeds but comment still open | Check the response body and the current review round; retry with the same idempotency key. |
| Feedback is empty                       | Confirm the review was submitted; use `review feedback <id> --wait`.                       |
| Agent cannot reach the daemon           | Put the daemon on loopback/private network; never put the token in a prompt.               |

## Safety rules

- Do not put `CODE_REVIEW_TOKEN` in the reviewer prompt or a harness environment.
- Do not resolve comments you did not verify.
- Do not edit the review store directly.
- Use the HTTP API or CLI; the event log is the audit trail.

## Next

- [CLI reference](../reference/cli.md)
- [HTTP API: comment resolution](../reference/http-api.md#editing-and-deleting)
- [Fixer contract](../agents/fixer.md)
- [Troubleshoot](troubleshoot.md)
