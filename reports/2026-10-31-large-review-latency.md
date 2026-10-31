# Benchmark — large review comment and decision latency

- Claim: on a 1,430-event, 8.4 MB review, opening the review, posting a comment, and accepting a finding each took well under a second after the replay fix, versus seconds to tens of seconds before.
- Environment: `23056aa` (old) and `4eaa7e2` (new), same Linux host, 8 cores, Node v22.23.2, pnpm 11.22.0, load average 2.0–3.5 during the runs, tmpfs-backed benchmark store. Both sides used release builds and an identical copy of one production review.
- Command (GET, medians of five alternating rounds; the comment and decision loops use the same pattern):

  ```bash
  curl -sS -o /dev/null -w '%{http_code},%{time_total},%{size_download}\n' \
    -H "Authorization: Bearer $TOKEN" \
    http://127.0.0.1:PORT/api/reviews/rev_01M636MECSS3ZSVWB8HRRZC3DZ
  ```

- Runs: five rounds, always old then new in each round. No errors: all GETs were HTTP 200, all comment POSTs 201, all decision POSTs 200 with `state: accepted`. The comment and decision responses were parsed and checked, not just timed.

| Path                                          |       Old median (range) |    New median (range) | Speedup |
| --------------------------------------------- | -----------------------: | --------------------: | ------: |
| GET review, 1,430 events, 8,383,403 bytes     |    5.328 s (5.249–5.493) | 0.247 s (0.235–0.302) |   21.5x |
| POST comment, five comments per side          | 20.773 s (20.666–20.838) | 0.365 s (0.300–0.411) |   56.8x |
| POST finding decision, five findings per side |    6.486 s (6.407–6.631) | 0.129 s (0.117–0.193) |   50.3x |

## Limit check

The old GET spent its time folding 1,430 events and deep-cloning a 4.8 MB aggregate, so 5.3 s is CPU-bound, not a network limit. The old comment path repeated the same replay for state, snapshot lookup, the post-append read, and the event-hub sync; four replays explain the measured 20.8 s. The new GET reads a 1.2 MB replay cache and serializes 8.38 MB in 0.247 s (~34 MB/s on tmpfs); the new comment still parses the 4.9 MB event log for the hub tail but does not fold it, so 0.365 s (~13 MB/s) is plausible. No response exceeded a physical limit or was served from a no-op.

## End-to-end

The UI comment path is POST followed by a full GET refresh, so the user-visible round trip moved from about 26.1 s to about 0.61 s on this isolated copy. In the loaded production daemon the same old path was observed at about 27.6 s for GET alone, with the daemon at 90–110% CPU and health checks rising to 5 s; that observation is the reason this path was investigated, while the controlled five-round table above is the reproducible comparison.

## Work proof

- GET responses were 8,383,403 bytes on both sides; the review had 1,430 events.
- Each comment POST returned a fresh `comment.id` (HTTP 201) and increased the store event count by one.
- Each decision POST returned `{findingId, state: "accepted"}` (HTTP 200) for the requested finding.
- The new side's first read after warming the cache was already on the fast path; the old side was run from its own untouched copy of the same baseline.

## Verdict

Adopt. The fix removes the full replay from reads, replaces replay with a validated byte-count cache hit, and makes the event hub fetch only the tail it does not already know.

## Evidence

- Raw measurements: `/tmp/bench-get.csv`, `/tmp/bench-comment.csv`, `/tmp/bench-decision.csv`.
- Code: `packages/core/src/review/store.ts`, `packages/server/src/daemon/sse.ts` at `4eaa7e2`.
- Full gates: `pnpm verify` (816 tests) and `pnpm test:e2e` (27 tests) passed.
