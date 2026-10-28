import { randomUUID } from 'node:crypto';
import {
  isStaleWorkerError,
  normalizeRunnerResult,
  readLeaseVersions,
  WorkerRunError,
} from './protocol.js';
import type {
  HarnessRunner,
  JobLease,
  LeaseVersions,
  RunnerResult,
  WorkerLoopOptions,
} from './protocol.js';

/** Marks a runner invocation that the loop abandoned because the signal aborted. */
const ABORTED = Symbol('aborted');

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    const onAbort = (): void => done();
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
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
    .post(jobPath(lease, 'fail'), { attemptId: lease.attemptId, code, message, retryable }, signal)
    .catch(() => undefined);
}

/**
 * Run one reviewed job, but never let a runner that ignores the abort signal keep
 * `runWorkerLoop` pending. The race resolves with `ABORTED` as soon as the signal
 * fires; a runner that settles later is ignored (its rejection is still consumed).
 */
async function runAbortable(
  runner: HarnessRunner,
  lease: JobLease,
  signal: AbortSignal,
): Promise<RunnerResult | typeof ABORTED> {
  if (signal.aborted) return ABORTED;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<typeof ABORTED>((resolve) => {
    onAbort = () => resolve(ABORTED);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([runner.run(lease, signal), aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
}

async function runLease(
  options: WorkerLoopOptions,
  lease: JobLease,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  // A lease version mismatch is a contract error, not a reviewer failure: reject
  // it before the runner sees the lease and never consume findings/report.
  let versions: LeaseVersions;
  try {
    versions = readLeaseVersions(lease);
  } catch (error) {
    const failure =
      error instanceof WorkerRunError
        ? error
        : new WorkerRunError(
            'protocol-mismatch',
            error instanceof Error ? error.message : 'unsupported lease protocol version',
            false,
          );
    await fail(options, lease, failure.code, failure.message, failure.retryable, signal);
    return;
  }
  if (versions.legacy) {
    const missing = [
      versions.protocolVersion === 0 ? 'protocolVersion' : undefined,
      versions.promptVersion === 0 ? 'promptVersion' : undefined,
    ].filter((field): field is string => field !== undefined);
    options.logger?.warn?.(
      `code-review: lease is missing ${missing.join(
        ' and ',
      )}; accepted as protocol v0 during migration, but new adapters must require protocol version 1`,
    );
  }
  const onAbort = (): void => {
    try {
      options.runner.cancel?.();
    } catch (error) {
      // A throwing cancel must not escape the abort listener and crash the worker.
      options.logger?.warn?.(
        `code-review: runner cancel failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    let result: RunnerResult | typeof ABORTED;
    try {
      result = await runAbortable(options.runner, lease, signal);
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
    // An aborted lease belongs to the daemon's lease expiry now; posting a failure
    // here would race the abort and could not reach a live attempt.
    if (result === ABORTED || signal.aborted) return;

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
  // A stale error is worth one re-registration. If the freshly registered id is
  // rejected again before any successful poll, the credential is permanently
  // bad (for example a 403 from a misconfigured token), so re-registering again
  // would only spin. This flag marks that we already used our one retry.
  let reregistered = false;

  while (!signal.aborted) {
    const workerId = await register(options, baseId, sleep, signal);
    if (workerId === undefined) return;

    const heartbeat = setInterval(
      () => {
        void options.api
          .post(`/api/workers/${encodeURIComponent(workerId)}/heartbeat`, {}, signal)
          .catch(() => undefined);
      },
      Math.max(100, options.heartbeatMs),
    );
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
          // Any successful poll proves the registration works, so a later stale
          // error earns a new re-registration.
          reregistered = false;
          if (lease === null) {
            if (!signal.aborted) await sleep(options.pollMs, signal);
            continue;
          }
          await runLease(options, lease, signal);
        } catch (error) {
          if (signal.aborted) return;
          if (isStaleWorkerError(error)) {
            if (reregistered) {
              options.logger?.warn?.(
                'code-review: worker registration is still stale after re-registering; stopping worker loop',
              );
              return;
            }
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
    reregistered = true;
    options.logger?.warn?.('code-review: worker registration is stale; registering again');
  }
}
