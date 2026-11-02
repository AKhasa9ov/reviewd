# @sir_yami/reviewd-worker

Harness-agnostic lease loop for reviewd jobs.

The package owns registration, heartbeat, long-polling, findings/report/ack
transport, stale-registration recovery, and generic failure reporting. It does
not choose a model, build a prompt, spawn a harness, or write the review store.

## Adapter contract

```ts
import { runWorkerLoop } from '@sir_yami/reviewd-worker';
import type { HarnessRunner } from '@sir_yami/reviewd-worker';

const runner: HarnessRunner = {
  async run(lease, signal) {
    // Run the harness with lease.bundle.prompt and lease.bundle.meta?.cwd.
    // Return findings and a schemaVersion: 1 report. The report's findings are
    // canonical; returning them only at the result level is normalized too.
    return { findings: [], report: { schemaVersion: 1, summary: 'ok', findings: [] } };
  },
  cancel() {
    // Best-effort process/session cancellation.
  },
};

await runWorkerLoop(
  {
    api, // WorkerApi get/post client; see the lease-envelope note below
    identity: { harness: 'codex', name: 'codex-reviewer' },
    runner,
    pollMs: 2_000,
    heartbeatMs: 20_000,
  },
  signal,
);
```

`api` is a `WorkerApi`, not DSH's `ReviewApi`, even though the DSH client is
structurally compatible. Its `get('/api/jobs/next?...')` must return a
flattened lease. reviewd returns `{ job, bundle }` from that route, so a thin
adapter must return `{ ...payload.job, bundle: payload.bundle }` (or `null`
when there is no job). Passing the raw envelope would leave `id`, `attemptId`,
and the other flattened lease fields undefined at runtime.

Adapters must not receive the reviewd token through `lease.bundle.prompt` or
the harness environment. The worker process owns transport authentication.

## Findings precedence

`report.findings` is canonical for both the final report and the incremental
`/findings` event. `normalizeRunnerResult` reconciles the two places a runner
can return findings:

- result-level `findings` only — copied into the returned report and posted;
- `report.findings` only — used as-is;
- both non-empty and deeply equal — accepted once;
- both non-empty and different — rejected as non-retryable `invalid-output`;
- both absent or empty — empty findings, and the report gets `findings: []`.

The loop posts the canonical list to `/findings` (when non-empty) and the
normalized report to `/report`, so reviewd's report fold sees the same
findings.

## Failure mapping

- `WorkerRunError` carries `code` and `retryable`.
- Unknown runner errors map to `harness-failed` and are retryable.
- Invalid report shape/schema maps to `invalid-output` and is not retryable.
- Divergent result-level and report-level findings map to `invalid-output` and
  are not retryable.
- Failure to submit findings/report/ack maps to `report-failed` and is retryable.
- Unsupported lease `protocolVersion`/`promptVersion` maps to non-retryable
  `protocol-mismatch` before the runner runs; the loop posts `fail` and does not
  consume findings or a report.
- Aborted runs do not post a failure.
- Stale worker registration (`401`/`403`/`404` or `unauthorized`/`not-found`)
  triggers one re-registration. A successful poll re-arms that one retry; a
  second stale error before any successful poll stops the loop.

## Protocol versioning

reviewd emits `protocolVersion: 1` and `promptVersion: 1` on every lease and
inside `bundle`. `schemaVersion: 1` describes the report shape only and is
unrelated to the lease protocol version.

`runWorkerLoop` validates both versions through `readLeaseVersions` before the
runner is invoked:

- v1 leases run normally;
- a missing version is the legacy v0 lease. It is accepted during migration and
  logs a warning; new adapters must require v1;
- an explicit unsupported version posts non-retryable `protocol-mismatch` with a
  message naming the supported version and never runs the runner.

`bundle.manifest` carries reviewd's complete `ReviewManifest` when available.
The manifest shape is owned by `@sir_yami/reviewd-core`; this package transports
it and does not model it. The bundle deliberately carries no model or token
policy.

## Verification

```bash
pnpm exec vitest run packages/worker/test
pnpm build
```
