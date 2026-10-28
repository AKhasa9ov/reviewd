# @dsh-code-review/worker

Harness-agnostic lease loop for reviewd jobs.

The package owns registration, heartbeat, long-polling, findings/report/ack
transport, stale-registration recovery, and generic failure reporting. It does
not choose a model, build a prompt, spawn a harness, or write the review store.

## Adapter contract

```ts
import { runWorkerLoop } from '@dsh-code-review/worker';
import type { HarnessRunner } from '@dsh-code-review/worker';

const runner: HarnessRunner = {
  async run(lease, signal) {
    // Run the harness with lease.bundle.prompt and lease.bundle.meta.cwd.
    // Return findings and a schemaVersion: 1 report.
    return { findings: [], report: { schemaVersion: 1, summary: 'ok', findings: [] } };
  },
  cancel() {
    // Best-effort process/session cancellation.
  },
};

await runWorkerLoop(
  {
    api, // ReviewApi-compatible get/post client
    identity: { harness: 'codex', name: 'codex-reviewer' },
    runner,
    pollMs: 2_000,
    heartbeatMs: 20_000,
  },
  signal,
);
```

Adapters must not receive the reviewd token through `lease.prompt` or the
harness environment. The worker process owns transport authentication.

## Failure mapping

- `WorkerRunError` carries `code` and `retryable`.
- Unknown runner errors map to `harness-failed` and are retryable.
- Invalid report shape/schema maps to `invalid-output` and is not retryable.
- Aborted runs do not post a failure.
- Stale worker registration (`401`/`403`/`404` or `unauthorized`/`not-found`)
  triggers one re-registration.

## Verification

```bash
pnpm exec vitest run packages/worker/test
pnpm build
```
