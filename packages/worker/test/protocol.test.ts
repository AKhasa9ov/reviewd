import { describe, expect, it } from 'vitest';
import { isStaleWorkerError, normalizeRunnerResult, WorkerRunError } from '../src/index.js';

function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
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
