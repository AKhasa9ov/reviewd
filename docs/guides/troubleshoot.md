# Troubleshoot

Start with health and logs, then narrow the failure to auth, the repository, the reviewer or
the review round.

```bash
curl -fsS http://127.0.0.1:3100/api/health | jq .
curl -fsS http://127.0.0.1:3100/api/version | jq .
docker compose logs --tail=200 reviewd
```

`/api/health` probes store writability and git availability. A healthy process does **not**
mean a reviewer worker is online.

## Startup

| Symptom                               | Cause / action                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `CODE_REVIEW_TOKEN is required`       | Set a 32+ byte token. The image has no default.                                                                |
| `lock` rejects startup                | Another daemon owns the store. Stop it; remove `lock` only after confirming its pid is not alive.              |
| `store not writable` in health        | `/data` is missing, read-only, or owned by another uid. It must be writable by uid 1000 in the image.          |
| `git` errors for a mounted repository | The path is not visible at the same absolute path, is not a git repository, or the daemon user cannot read it. |
| UI shows a build diagnostic page      | The SPA was not built. Run `pnpm build` or set `CODE_REVIEW_WEB_DIR` to a built `dist/`.                       |
| Port already in use                   | Set `CODE_REVIEW_PORT` or stop the other process.                                                              |

## Authentication and browser

| Symptom                               | Cause / action                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Login loops or mutations return `403` | `CODE_REVIEW_PUBLIC_URL` does not exactly match the browser origin, or a Secure cookie is used over plain HTTP.      |
| `cross-origin mutation rejected`      | The `Origin`/`Sec-Fetch-Site` header does not match the public URL. Set the public URL to the actual browser origin. |
| `401 unauthorized` from a CLI/agent   | Missing/incorrect `Authorization: Bearer`, or the CLI is pointing at another daemon.                                 |
| `403 forbidden` for an allowed action | The token is valid but the request is cross-origin or the actor/route policy rejects it.                             |
| Cookie disappears after restart       | `CODE_REVIEW_TOKEN` changed; session cookies are invalidated when the signing key changes.                           |

The daemon has one shared token and no account system. Use TLS and a private network; see
[Deploy reviewd](deploy.md).

## Reviews and diffs

| Symptom                                  | Cause / action                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `validation` on create                   | Check the repo path, base/head refs and scope shape. `git rev-parse` the refs on the daemon host.                 |
| `not-found` on a review                  | The review was deleted or the daemon points at another store.                                                     |
| Empty or partial diff                    | Check the diff/file/content caps and `warnings`; a truncated file remains visible without content.                |
| `stale-review` / `409`                   | The review changed while the client held an old round. Re-read the review, then retry.                            |
| Comments look out of place after refresh | Open the current round; anchors show previous and current locations. A moved comment is not necessarily resolved. |
| `torn-tail` warning                      | The last event line was incomplete; the next append truncates it. Replay the review and verify it opens.          |

Diff limits are 2 MiB of diff text, 500 files, 20,000 lines per file, 1 MiB of content per
file and 64 MiB of content per snapshot. See [Review state](../reference/review-state.md).

## Reviewer and worker

| Symptom                               | Cause / action                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Health is fine but no findings appear | No worker is registered. Start DSH with `worker: true`, or configure the command backend.                                  |
| Worker keeps retrying                 | Check `/api/jobs/next`, the worker token, the lease heartbeat and the daemon logs. A stale registration re-registers once. |
| `agent-busy`                          | A reviewer is already queued or running for that review/round. Wait or cancel it.                                          |
| `protocol-mismatch`                   | The worker received an unsupported lease/prompt version. Upgrade the worker package.                                       |
| Reviewer times out                    | Increase `reviewerTimeoutMs` or reduce the review scope; the failure is recorded as a retryable agent failure.             |
| Partial report / coverage warning     | Some shards did not finish. Inspect the report's coverage ledger before treating the review as complete.                   |

A report with `schemaVersion: 1` is required. Invalid findings are rejected individually;
an entirely invalid report is an `invalid-output` failure.

## Rate limits and capacity

| Symptom                       | Cause / action                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `429` with `Retry-After`      | Fixed-window limits: 60 mutations/min and 600 reads/min per peer. Back off.    |
| Disk grows unexpectedly       | Snapshots and event logs are retained until GC. Back up, then run `review gc`. |
| GC removed more than expected | GC is irreversible. Restore the store backup; check `closedAt`/`createdAt`.    |

## CLI exit codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| 0    | success                               |
| 2    | timeout / not ready                   |
| 3    | authentication or authorization       |
| 4    | daemon unavailable                    |
| 5    | validation or not found               |
| 6    | conflict / stale round / rate limited |

For local `review diff`, `1` is an internal failure and `5` is usage or git validation.

## Collecting a useful report

Include:

- `reviewd` version and Node version;
- `/api/version` output;
- the request method, path and status (never the token or diff body);
- the redacted error `code` and message;
- whether a worker was registered;
- relevant daemon logs around the request.

Open a GitHub issue with the redacted details. For security issues, follow
[SECURITY.md](../../SECURITY.md), not a public issue.
