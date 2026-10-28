# Cross-harness C1: Shared Worker Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a harness-agnostic lease worker contract that Codex/Claude/Pi adapters can implement without importing DSH or reviewd internals.

**Architecture:** Create `packages/worker` with a typed job/lease protocol, a `HarnessRunner` boundary, and a shared registration/poll/heartbeat loop. The loop owns registration, long-polling, findings/report/ack transport, stale-registration recovery, and generic failure reporting. It does not choose a model, build a prompt, spawn a harness, or write the review store. DSH remains untouched in C1; C4 will replace its private loop with this package.

**Tech Stack:** Node 22, TypeScript strict, ESM, Vitest 5, esbuild, pnpm.

**Spec:** [Cross-harness review hooks design](../designs/2026-10-28-cross-harness-hooks.md)

## Global Constraints

- `packages/worker` must not import `packages/dsh`, `packages/server`, MCP, CLI, or any harness CLI.
- The worker contract contains no model, `maxTokens`, `reasoningEffort`, API key, prompt policy, or reviewd token fields.
- The worker only talks to reviewd through `WorkerApi`; it never writes the store.
- Existing DSH behavior and tests must remain unchanged; C1 does not wire the new loop into DSH.
- No live Codex/Claude/Pi tests; no DSH live session required for C1.
- One atomic commit per task.
- Every task ends with its focused test, `pnpm typecheck`, and `pnpm format --check`.
- Final gates: `pnpm verify`, `pnpm test:e2e`, `pnpm fat:verify`.
- Node 22, strict TypeScript, Prettier, ESLint, Vitest.

## File Structure

New:

- `packages/worker/package.json` — private workspace package; no runtime deps.
- `packages/worker/src/protocol.ts` — lease, runner, error, and API types.
- `packages/worker/src/loop.ts` — register/poll/heartbeat/submit loop.
- `packages/worker/src/index.ts` — public exports.
- `packages/worker/test/protocol.test.ts` — error classification contract.
- `packages/worker/test/loop.test.ts` — lease lifecycle and transport tests.
- `packages/worker/README.md` — contract and adapter example.

Modified:

- `scripts/build.mjs` — build `packages/worker/dist/index.js`.
- `vitest.config.ts` — add `@dsh-code-review/worker` alias for future adapters.

Not modified in C1:

- `packages/dsh/src/worker.ts` — remains the DSH-specific loop until C4.
- `packages/server/src/daemon/jobs.ts` — no protocol rewrite in C1.
- `packages/core` — no dependency on the worker package.

---

### Task 1: Worker package and protocol contract

**Files:**
- Create: `packages/worker/package.json`
- Create: `packages/worker/src/protocol.ts`
- Create: `packages/worker/src/index.ts`
- Test: `packages/worker/test/protocol.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WorkerApi.get<T>(path, signal?)` / `WorkerApi.post<T>(path, body, signal?)`
  - `JobBundle`, `JobLease`
  - `HarnessRunner.run(lease, signal)`
  - `RunnerResult`
  - `WorkerRunError`
  - `isStaleWorkerError(error)`
  - `normalizeRunnerResult(result)`

<task type="auto">
<name>Create worker package and protocol contract</name>
<files>packages/worker/package.json, packages/worker/src/protocol.ts, packages/worker/src/index.ts, packages/worker/test/protocol.test.ts</files>
<action>
1. Create `packages/worker/package.json`:

```json
{
  "name": "@dsh-code-review/worker",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "engines": { "node": ">=22" },
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist"]
}
```

2. Write the failing test first:

```ts
import { describe, expect, it } from 'vitest';
import {
  isStaleWorkerError,
  normalizeRunnerResult,
  WorkerRunError,
} from '../src/index.js';

describe('worker protocol errors', () => {
  it('recognizes a stale worker registration', () => {
    expect(isStaleWorkerError({ status: 401 })).toBe(true);
    expect(isStaleWorkerError({ status: 404, code: 'not-found' })).toBe(true);
    expect(isStaleWorkerError({ code: 'unauthorized' })).toBe(true);
    expect(isStaleWorkerError({ status: 500 })).toBe(false);
    expect(isStaleWorkerError(new Error('boom'))).toBe(false);
  });

  it('carries retryability separately from the code', () => {
    const error = new WorkerRunError('timeout', 'reviewer timed out', true);
    expect(error.name).toBe('WorkerRunError');
    expect(error.code).toBe('timeout');
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('reviewer timed out');
  });

  it('normalizes report findings and validates schemaVersion', () => {
    const result = normalizeRunnerResult({
      report: { schemaVersion: 1, summary: 'ok', findings: [{ id: 'f1' }] },
    });
    expect(result.findings).toEqual([{ id: 'f1' }]);

    expect(() =>
      normalizeRunnerResult({ report: { schemaVersion: 2 } }),
    ).toThrowError(/schemaVersion 1/);
  });

  it('rejects a missing report object', () => {
    expect(() =>
      normalizeRunnerResult({ report: undefined as unknown as Record<string, unknown> }),
    ).toThrowError(/no report/);
  });
});
```

3. Run the test and confirm it fails because the module does not exist:

```bash
pnpm exec vitest run packages/worker/test/protocol.test.ts
```

Expected: FAIL with `Cannot find module '../src/index.js'` or equivalent.

4. Implement `packages/worker/src/protocol.ts`:

```ts
export interface WorkerApi {
  get<T = unknown>(path: string, signal?: AbortSignal): Promise<T>;
  post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T>;
}

export interface WorkerIdentity {
  id?: string;
  name?: string;
  harness: string;
}

export interface JobBundle {
  prompt: string;
  diff?: unknown;
  schema?: unknown;
  meta?: Record<string, unknown>;
}

export interface JobLease {
  id: string;
  reviewId: string;
  round: number;
  kind: 'initial' | 'verify';
  backend: string;
  attempt: number;
  attemptId: string;
  leaseUntil: string;
  bundle: JobBundle;
}

export interface RunnerResult {
  findings?: readonly unknown[];
  report: Record<string, unknown>;
}

export interface HarnessRunner {
  run(lease: JobLease, signal: AbortSignal): Promise<RunnerResult>;
  cancel?(): void;
}

export interface WorkerLogger {
  warn?(message: string): void;
  info?(message: string): void;
}

export interface WorkerLoopOptions {
  api: WorkerApi;
  identity: WorkerIdentity;
  runner: HarnessRunner;
  pollMs: number;
  heartbeatMs: number;
  leaseWaitSeconds?: number;
  logger?: WorkerLogger;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  randomId?: () => string;
}

export class WorkerRunError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.name = 'WorkerRunError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isStaleWorkerError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return (
    candidate.status === 401 ||
    candidate.status === 403 ||
    candidate.status === 404 ||
    candidate.code === 'unauthorized' ||
    candidate.code === 'not-found'
  );
}

export function normalizeRunnerResult(result: RunnerResult): {
  findings: readonly unknown[];
  report: Record<string, unknown>;
} {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new WorkerRunError('invalid-output', 'runner returned no result', false);
  }
  const report = result.report;
  if (typeof report !== 'object' || report === null || Array.isArray(report)) {
    throw new WorkerRunError('invalid-output', 'runner returned no report', false);
  }
  if (report.schemaVersion !== 1) {
    throw new WorkerRunError(
      'invalid-output',
      `runner report must use schemaVersion 1 (received ${String(report.schemaVersion)})`,
      false,
    );
  }
  const reportFindings = (report as { findings?: unknown }).findings;
  const findings = Array.isArray(result.findings)
    ? result.findings
    : Array.isArray(reportFindings)
      ? reportFindings
      : [];
  return { findings, report };
}
```

5. Implement `packages/worker/src/index.ts`:

```ts
export {
  isStaleWorkerError,
  normalizeRunnerResult,
  WorkerRunError,
} from './protocol.js';
export type {
  HarnessRunner,
  JobBundle,
  JobLease,
  RunnerResult,
  WorkerApi,
  WorkerIdentity,
  WorkerLogger,
  WorkerLoopOptions,
} from './protocol.js';
```

6. Run the protocol test and confirm it passes:

```bash
pnpm exec vitest run packages/worker/test/protocol.test.ts
```

7. Run focused typecheck and format checks:

```bash
pnpm typecheck
pnpm exec prettier --check packages/worker
```

8. Commit:

```bash
git add packages/worker/package.json packages/worker/src/protocol.ts packages/worker/src/index.ts packages/worker/test/protocol.test.ts
git commit -m "feat(worker): add harness-agnostic lease protocol"
```
</action>
<verify>pnpm exec vitest run packages/worker/test/protocol.test.ts && pnpm typecheck && pnpm exec prettier --check packages/worker</verify>
<done>Protocol types, error classification, and result normalization exist in packages/worker; their tests pass; no DSH or server imports.</done>
</task>

---

### Task 2: Shared registration, polling, heartbeat, and job transport

**Files:**
- Create: `packages/worker/src/loop.ts`
- Modify: `packages/worker/src/index.ts`
- Test: `packages/worker/test/loop.test.ts`

**Interfaces:**
- Consumes: all Task 1 exports.
- Produces:
  - `runWorkerLoop(options: WorkerLoopOptions, signal: AbortSignal): Promise<void>`
  - HTTP contract:
    - `POST /api/workers/register` with `{ id, name, harness }`
    - `POST /api/workers/:id/heartbeat`
    - `GET /api/jobs/next?workerId=:id&wait=25`
    - `POST /api/jobs/:id/findings` with `{ attemptId, findings }`
    - `POST /api/jobs/:id/report` with `{ attemptId, report }`
    - `POST /api/jobs/:id/ack` with `{ attemptId }`
    - `POST /api/jobs/:id/fail` with `{ attemptId, code, message, retryable }`

<task type="auto">
<name>Implement the shared lease loop</name>
<files>packages/worker/src/loop.ts, packages/worker/src/index.ts, packages/worker/test/loop.test.ts</files>
<action>
1. Write the failing lifecycle tests first:

```ts
import { describe, expect, it } from 'vitest';
import {
  runWorkerLoop,
  WorkerRunError,
} from '../src/index.js';
import type { JobLease, WorkerApi, WorkerLoopOptions } from '../src/index.js';

interface Call {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

function lease(): JobLease {
  return {
    id: 'job_1',
    reviewId: 'rev_1',
    round: 1,
    kind: 'initial',
    backend: 'worker',
    attempt: 1,
    attemptId: 'att_1',
    leaseUntil: '2026-10-28T00:00:00.000Z',
    bundle: { prompt: 'Review this diff', meta: { cwd: '/repo' } },
  };
}

function apiFor(
  controller: AbortController,
  calls: Call[],
  job: JobLease | null,
): WorkerApi {
  let served = false;
  return {
    async get<T>(path: string): Promise<T> {
      calls.push({ method: 'GET', path });
      if (!path.includes('/api/jobs/next')) return null as T;
      if (served) {
        controller.abort();
        return null as T;
      }
      served = true;
      return job as T;
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      calls.push({ method: 'POST', path, body });
      if (path === '/api/workers/register') {
        return { id: (body as { id: string }).id } as T;
      }
      return {} as T;
    },
  };
}

function options(api: WorkerApi, runner: WorkerLoopOptions['runner']): WorkerLoopOptions {
  return {
    api,
    runner,
    identity: { harness: 'codex', name: 'test-worker' },
    pollMs: 1,
    heartbeatMs: 1_000,
    randomId: () => 'wkr_test',
    sleep: async () => undefined,
  };
}

describe('runWorkerLoop', () => {
  it('does not call the daemon when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
      controller.signal,
    );
    expect(calls).toEqual([]);
  });

  it('registers, leases, submits findings/report, and acks', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    const seen: JobLease[] = [];
    await runWorkerLoop(
      options(api, {
        async run(received) {
          seen.push(received);
          return {
            findings: [{ id: 'f1', title: 'found' }],
            report: {
              schemaVersion: 1,
              summary: 'ok',
              findings: [{ id: 'f1', title: 'found' }],
            },
          };
        },
      }),
      controller.signal,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.bundle.prompt).toBe('Review this diff');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/api/workers/register',
      body: { id: 'wkr_test', name: 'test-worker', harness: 'codex' },
    });
    expect(calls.some((call) => call.path.includes('/api/jobs/next?workerId=wkr_test'))).toBe(
      true,
    );
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/findings',
      body: { attemptId: 'att_1', findings: [{ id: 'f1', title: 'found' }] },
    });
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/report',
      body: {
        attemptId: 'att_1',
        report: {
          schemaVersion: 1,
          summary: 'ok',
          findings: [{ id: 'f1', title: 'found' }],
        },
      },
    });
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/ack',
      body: { attemptId: 'att_1' },
    });
  });

  it('reports a retryable runner failure without posting a report', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, {
        run: async () => {
          throw new WorkerRunError('timeout', 'reviewer timed out', true);
        },
      }),
      controller.signal,
    );

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/fail',
      body: {
        attemptId: 'att_1',
        code: 'timeout',
        message: 'reviewer timed out',
        retryable: true,
      },
    });
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(false);
  });

  it('rejects an invalid report as non-retryable', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, {
        run: async () => ({ report: { schemaVersion: 2, summary: 'wrong' } }),
      }),
      controller.signal,
    );

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/fail',
      body: {
        attemptId: 'att_1',
        code: 'invalid-output',
        message: 'runner report must use schemaVersion 1 (received 2)',
        retryable: false,
      },
    });
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(false);
  });

  it('re-registers after a stale worker error', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    let nextCalls = 0;
    let registrations = 0;
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        nextCalls += 1;
        if (nextCalls === 1) {
          throw Object.assign(new Error('unknown worker'), {
            status: 401,
            code: 'unauthorized',
          });
        }
        controller.abort();
        return null as T;
      },
      async post<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') {
          registrations += 1;
          return { id: (body as { id: string }).id } as T;
        }
        return {} as T;
      },
    };

    await runWorkerLoop(
      options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
      controller.signal,
    );

    expect(registrations).toBe(2);
    expect(nextCalls).toBe(2);
  });
});
```

2. Run the tests and confirm they fail because `runWorkerLoop` is not exported:

```bash
pnpm exec vitest run packages/worker/test/loop.test.ts
```

Expected: FAIL with `runWorkerLoop is not a function` or an unresolved export.

3. Implement `packages/worker/src/loop.ts`:

```ts
import { randomUUID } from 'node:crypto';
import {
  isStaleWorkerError,
  normalizeRunnerResult,
  WorkerRunError,
} from './protocol.js';
import type { JobLease, RunnerResult, WorkerLoopOptions } from './protocol.js';

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function jobPath(lease: JobLease, action: string): string {
  return `/api/jobs/${encodeURIComponent(lease.id)}/${action}`;
}

async function fail(
  options: WorkerLoopOptions,
  lease: JobLease,
  code: string,
  message: string,
  retryable: boolean,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  await options.api
    .post(
      jobPath(lease, 'fail'),
      { attemptId: lease.attemptId, code, message, retryable },
      signal,
    )
    .catch(() => undefined);
}

async function runLease(
  options: WorkerLoopOptions,
  lease: JobLease,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  const onAbort = (): void => options.runner.cancel?.();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    let result: RunnerResult;
    try {
      result = await options.runner.run(lease, signal);
    } catch (error) {
      if (signal.aborted) return;
      const failure =
        error instanceof WorkerRunError
          ? error
          : new WorkerRunError(
              'harness-failed',
              error instanceof Error ? error.message : 'harness failed',
              true,
            );
      await fail(options, lease, failure.code, failure.message, failure.retryable, signal);
      return;
    }
    if (signal.aborted) return;

    let normalized: ReturnType<typeof normalizeRunnerResult>;
    try {
      normalized = normalizeRunnerResult(result);
    } catch (error) {
      const failure =
        error instanceof WorkerRunError
          ? error
          : new WorkerRunError(
              'invalid-output',
              error instanceof Error ? error.message : 'invalid runner output',
              false,
            );
      await fail(options, lease, failure.code, failure.message, failure.retryable, signal);
      return;
    }

    try {
      if (normalized.findings.length > 0) {
        await options.api.post(
          jobPath(lease, 'findings'),
          { attemptId: lease.attemptId, findings: normalized.findings },
          signal,
        );
      }
      await options.api.post(
        jobPath(lease, 'report'),
        { attemptId: lease.attemptId, report: normalized.report },
        signal,
      );
      await options.api.post(jobPath(lease, 'ack'), { attemptId: lease.attemptId }, signal);
    } catch (error) {
      if (signal.aborted) return;
      await fail(
        options,
        lease,
        'report-failed',
        error instanceof Error ? error.message : 'cannot submit review report',
        true,
        signal,
      );
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function register(
  options: WorkerLoopOptions,
  baseId: string,
  sleep: (ms: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Promise<string | undefined> {
  let delayMs = 1_000;
  for (let attempt = 1; !signal.aborted; attempt += 1) {
    try {
      const registered = await options.api.post<{ id: string }>(
        '/api/workers/register',
        {
          id: baseId,
          name: options.identity.name ?? 'code-review-worker',
          harness: options.identity.harness,
        },
        signal,
      );
      return registered.id;
    } catch (error) {
      if (signal.aborted) return undefined;
      options.logger?.warn?.(
        `code-review: worker registration failed (attempt ${attempt}, retrying in ${delayMs}ms): ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      await sleep(delayMs, signal);
      delayMs = Math.min(delayMs * 2, 30_000);
    }
  }
  return undefined;
}

/** Register, long-poll, heartbeat, and run jobs until the signal aborts. */
export async function runWorkerLoop(
  options: WorkerLoopOptions,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  const sleep = options.sleep ?? wait;
  const baseId = options.identity.id ?? options.randomId?.() ?? `wkr_${randomUUID()}`;

  while (!signal.aborted) {
    const workerId = await register(options, baseId, sleep, signal);
    if (workerId === undefined) return;

    const heartbeat = setInterval(() => {
      void options.api
        .post(`/api/workers/${encodeURIComponent(workerId)}/heartbeat`, {}, signal)
        .catch(() => undefined);
    }, Math.max(100, options.heartbeatMs));
    heartbeat.unref?.();

    let stale = false;
    try {
      while (!signal.aborted) {
        try {
          const lease = await options.api.get<JobLease | null>(
            `/api/jobs/next?workerId=${encodeURIComponent(workerId)}&wait=${
              options.leaseWaitSeconds ?? 25
            }`,
            signal,
          );
          if (lease === null) {
            if (!signal.aborted) await sleep(options.pollMs, signal);
            continue;
          }
          await runLease(options, lease, signal);
        } catch (error) {
          if (signal.aborted) return;
          if (isStaleWorkerError(error)) {
            stale = true;
            break;
          }
          options.logger?.warn?.(
            `code-review: worker poll failed: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
          await sleep(options.pollMs, signal);
        }
      }
    } finally {
      clearInterval(heartbeat);
    }

    if (!stale) return;
    options.logger?.warn?.('code-review: worker registration is stale; registering again');
  }
}
```

4. Export the loop from `packages/worker/src/index.ts`:

```ts
export { runWorkerLoop } from './loop.js';
```

5. Run the loop tests and confirm they pass:

```bash
pnpm exec vitest run packages/worker/test/loop.test.ts
```

6. Run focused typecheck and format checks:

```bash
pnpm typecheck
pnpm exec prettier --check packages/worker
```

7. Commit:

```bash
git add packages/worker/src/loop.ts packages/worker/src/index.ts packages/worker/test/loop.test.ts
git commit -m "feat(worker): add shared lease loop"
```
</action>
<verify>pnpm exec vitest run packages/worker/test && pnpm typecheck && pnpm exec prettier --check packages/worker</verify>
<done>The worker registers, heartbeats, long-polls, submits findings/report, acks, validates reports, reports retryable/non-retryable failures, recovers from stale registration, and stops cleanly on abort.</done>
</task>

---

### Task 3: Build integration, adapter documentation, and DSH parity

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `vitest.config.ts`
- Modify: `tsconfig.base.json`
- Create: `packages/worker/README.md`
- Test: no new test file; existing worker and DSH tests.

**Interfaces:**
- Consumes: `packages/worker/src/index.ts` and `runWorkerLoop`.
- Produces: `packages/worker/dist/index.js`; `@dsh-code-review/worker` Vitest alias.

<task type="auto">
<name>Build and document the worker package</name>
<files>scripts/build.mjs, vitest.config.ts, tsconfig.base.json, packages/worker/README.md</files>
<action>
1. Add the worker entry to `scripts/build.mjs` after the core build:

```js
const workerEntry = join(root, 'packages/worker/src/index.ts');
const workerOut = join(root, 'packages/worker/dist/index.js');
```

Add this esbuild block immediately after the core `await build({...})`:

```js
await build({
  absWorkingDir: root,
  entryPoints: [workerEntry],
  outfile: workerOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});
```

2. Add the Vitest alias:

```ts
'@dsh-code-review/worker': fileURLToPath(
  new URL('./packages/worker/src/index.ts', import.meta.url),
),
```

Place it after the core alias.

Add the TypeScript path mapping to `tsconfig.base.json`:

```json
"@dsh-code-review/worker": ["packages/worker/src/index.ts"]
```

Place it after the core path.

3. Write `packages/worker/README.md`:

````markdown
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
    // Run the harness with lease.bundle.prompt and lease.bundle.meta?.cwd.
    // Return findings and a schemaVersion: 1 report.
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
and `bundle` undefined at runtime.

Adapters must not receive the reviewd token through `lease.bundle.prompt` or
the harness environment. The worker process owns transport authentication.

## Failure mapping

- `WorkerRunError` carries `code` and `retryable`.
- Unknown runner errors map to `harness-failed` and are retryable.
- Invalid report shape/schema maps to `invalid-output` and is not retryable.
- Failure to submit findings/report/ack maps to `report-failed` and is retryable.
- Aborted runs do not post a failure.
- Stale worker registration (`401`/`403`/`404` or `unauthorized`/`not-found`)
  triggers one re-registration. A successful poll re-arms that one retry; a
  second stale error before any successful poll stops the loop.

## Verification

```bash
pnpm exec vitest run packages/worker/test
pnpm build
```
````

4. Run the focused checks:

```bash
pnpm exec vitest run packages/worker/test
pnpm build
pnpm typecheck
pnpm exec prettier --check packages/worker scripts/build.mjs vitest.config.ts tsconfig.base.json
```

5. Run DSH parity and full gates:

```bash
pnpm exec vitest run packages/dsh/test/worker.test.ts
pnpm verify
pnpm test:e2e
pnpm fat:verify
```

6. Commit:

```bash
git add scripts/build.mjs vitest.config.ts tsconfig.base.json packages/worker/README.md
git commit -m "build(worker): expose shared worker package"
```
</action>
<verify>pnpm exec vitest run packages/worker/test packages/dsh/test/worker.test.ts && pnpm verify && pnpm test:e2e && pnpm fat:verify</verify>
<done>The worker package is buildable and documented; its tests and existing DSH worker tests pass; full repository, e2e, and fat-package gates pass without changing DSH behavior.</done>
</task>

---

## Self-Review

- **Spec coverage:** C1 maps to design §6.1–6.4 (contracts/errors) and §14 C1 (protocol + shared worker loop). C1 intentionally does not implement MCP, CLI, skills, Codex, or the DSH adapter refactor; those are C2–C5.
- **No placeholders:** Every task contains exact files, test code, implementation code, commands, and commit messages.
- **Type consistency:** `JobLease`, `RunnerResult`, `WorkerApi`, `WorkerRunError`, `normalizeRunnerResult`, and `runWorkerLoop` are defined once in Task 1/2 and reused with the same names in Task 3.
- **DSH parity:** C1 does not import or modify DSH; the existing `packages/dsh/test/worker.test.ts` remains the parity gate. C4 owns the actual DSH refactor.

## Execution Handoff

After approval, execute with `superpowers:subagent-driven-development` (fresh implementer per task, review between tasks) or `superpowers:executing-plans` (inline checkpoints). C1 does not require a DSH live session; DSH live testing belongs to C4.
