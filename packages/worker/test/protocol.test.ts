import { describe, expect, it } from 'vitest';
import {
  PROMPT_VERSION,
  PROTOCOL_VERSION,
  isStaleWorkerError,
  normalizeRunnerResult,
  readLeaseVersions,
  WorkerRunError,
} from '../src/index.js';
import type { JobLease } from '../src/index.js';

function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

function lease(overrides: Partial<JobLease> = {}): JobLease {
  return {
    id: 'job_1',
    reviewId: 'rev_1',
    round: 1,
    kind: 'initial',
    backend: 'worker',
    attempt: 1,
    attemptId: 'att_1',
    leaseUntil: '2026-10-28T00:00:00.000Z',
    bundle: { prompt: 'Review this diff' },
    ...overrides,
  };
}

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

  it('uses result findings when only the result carries them', () => {
    const normalized = normalizeRunnerResult({
      findings: [{ id: 'f1' }],
      report: { schemaVersion: 1, summary: 'ok' },
    });
    expect(normalized.findings).toEqual([{ id: 'f1' }]);
    expect(normalized.report).toEqual({
      schemaVersion: 1,
      summary: 'ok',
      findings: [{ id: 'f1' }],
    });
  });

  it('uses report findings when the result has none', () => {
    const normalized = normalizeRunnerResult({
      report: { schemaVersion: 1, summary: 'ok', findings: [{ id: 'f2' }] },
    });
    expect(normalized.findings).toEqual([{ id: 'f2' }]);
    expect(normalized.report).toEqual({
      schemaVersion: 1,
      summary: 'ok',
      findings: [{ id: 'f2' }],
    });
  });

  it('accepts deeply equal findings from both sources', () => {
    const normalized = normalizeRunnerResult({
      findings: [{ id: 'f1', line: 3 }],
      report: { schemaVersion: 1, findings: [{ id: 'f1', line: 3 }] },
    });
    expect(normalized.findings).toEqual([{ id: 'f1', line: 3 }]);
    expect(normalized.report.findings).toEqual([{ id: 'f1', line: 3 }]);
  });

  it('rejects non-empty findings that differ between the result and the report', () => {
    const error = caught(() =>
      normalizeRunnerResult({
        findings: [{ id: 'from-result' }],
        report: { schemaVersion: 1, findings: [{ id: 'from-report' }] },
      }),
    );

    expect(error).toBeInstanceOf(WorkerRunError);
    expect((error as WorkerRunError).code).toBe('invalid-output');
    expect((error as WorkerRunError).retryable).toBe(false);
    expect((error as Error).message).toMatch(/findings/i);
    expect((error as Error).message).toMatch(/differ/i);
  });

  it('prefers non-empty report findings over an empty result array', () => {
    const normalized = normalizeRunnerResult({
      findings: [],
      report: { schemaVersion: 1, findings: [{ id: 'from-report' }] },
    });
    expect(normalized.findings).toEqual([{ id: 'from-report' }]);
    expect(normalized.report.findings).toEqual([{ id: 'from-report' }]);
  });

  it('returns empty findings and normalizes the report when both sources are absent', () => {
    const normalized = normalizeRunnerResult({ report: { schemaVersion: 1 } });
    expect(normalized.findings).toEqual([]);
    expect(normalized.report).toEqual({ schemaVersion: 1, findings: [] });
  });
});

describe('lease protocol versions', () => {
  it('accepts an explicit v1 lease', () => {
    const versions = readLeaseVersions(
      lease({
        protocolVersion: 1,
        promptVersion: 1,
        bundle: { prompt: 'Review this diff', protocolVersion: 1, promptVersion: 1 },
      }),
    );

    expect(PROTOCOL_VERSION).toBe(1);
    expect(PROMPT_VERSION).toBe(1);
    expect(versions).toEqual({ protocolVersion: 1, promptVersion: 1, legacy: false });
  });

  it('treats a missing version as legacy v0', () => {
    expect(readLeaseVersions(lease())).toEqual({
      protocolVersion: 0,
      promptVersion: 0,
      legacy: true,
    });
  });

  it('accepts an explicit v0 lease', () => {
    expect(readLeaseVersions(lease({ protocolVersion: 0, promptVersion: 0 }))).toEqual({
      protocolVersion: 0,
      promptVersion: 0,
      legacy: true,
    });
  });

  it('falls back to the bundle versions when the lease omits them', () => {
    const versions = readLeaseVersions(
      lease({
        bundle: { prompt: 'Review this diff', protocolVersion: 1, promptVersion: 1 },
      }),
    );

    expect(versions).toEqual({ protocolVersion: 1, promptVersion: 1, legacy: false });
  });

  it('rejects an unsupported protocol version as a non-retryable protocol mismatch', () => {
    const error = caught(() => readLeaseVersions(lease({ protocolVersion: 2, promptVersion: 1 })));

    expect(error).toBeInstanceOf(WorkerRunError);
    expect((error as WorkerRunError).code).toBe('protocol-mismatch');
    expect((error as WorkerRunError).retryable).toBe(false);
    expect((error as Error).message).toMatch(/protocol version 1/);
    expect((error as Error).message).toMatch(/protocol version 2/);
  });

  it('rejects an unsupported prompt version as a non-retryable protocol mismatch', () => {
    const error = caught(() => readLeaseVersions(lease({ protocolVersion: 1, promptVersion: 3 })));

    expect(error).toBeInstanceOf(WorkerRunError);
    expect((error as WorkerRunError).code).toBe('protocol-mismatch');
    expect((error as WorkerRunError).retryable).toBe(false);
    expect((error as Error).message).toMatch(/prompt version 1/);
    expect((error as Error).message).toMatch(/prompt version 3/);
  });
});
