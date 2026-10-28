import { describe, expect, it } from 'vitest';
import { isStaleWorkerError, normalizeRunnerResult, WorkerRunError } from '../src/index.js';

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

    expect(() => normalizeRunnerResult({ report: { schemaVersion: 2 } })).toThrowError(
      /schemaVersion 1/,
    );
  });

  it('rejects a missing report object', () => {
    expect(() =>
      normalizeRunnerResult({ report: undefined as unknown as Record<string, unknown> }),
    ).toThrowError(/no report/);
  });
});
