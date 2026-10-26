import { describe, expect, it } from 'vitest';
import {
  MAX_FINDINGS,
  MAX_TEXT_BYTES,
  ReportValidationError,
  validateFindingItem,
  validateReport,
} from '../../src/index.js';
import type { Snapshot } from '../../src/index.js';

function snapshot(): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'a..b',
      worktreeDigest: 'b'.repeat(40),
    },
    files: [
      {
        path: 'src/a.ts',
        status: 'modified',
        binary: false,
        oversized: false,
        added: 1,
        deleted: 0,
        hunks: [],
        oldLines: ['  const value = 1;', 'return value;'],
        newLines: ['  const value = 1;', 'return value;'],
        contentHash: null,
      },
    ],
    totals: { files: 1, added: 1, deleted: 0, truncated: false },
    warnings: [],
  };
}

function valid(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    summary: 'Looks good overall',
    riskLevel: 'medium',
    findings: [
      {
        id: 'f1',
        severity: 'blocker',
        category: 'correctness',
        confidence: 'high',
        kind: 'issue',
        file: 'src/a.ts',
        lineStart: 2,
        lineEnd: 2,
        title: 'Return is wrong',
        rationale: 'It returns the old value.',
        evidence: 'return value;',
        suggestion: { original: 'return value;', replacement: 'return next;' },
      },
    ],
    questions: [{ id: 'q1', file: 'src/a.ts', line: 1, question: 'Why?', why: 'Intent unclear.' }],
    tests: {
      ran: true,
      commands: [{ command: 'pnpm test', result: 'pass', summary: 'all good' }],
    },
    verification: [{ commentId: 'cmt_1', status: 'fixed', evidence: 'verified' }],
  };
}

describe('validateReport', () => {
  it('accepts a complete valid report against a snapshot', () => {
    const result = validateReport(valid(), { snapshot: snapshot() });
    expect(result.rejected).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.report).toMatchObject({
      schemaVersion: 1,
      summary: 'Looks good overall',
      riskLevel: 'medium',
    });
    expect(result.report.findings[0]).toMatchObject({
      id: 'f1',
      file: 'src/a.ts',
      suggestion: { original: 'return value;', replacement: 'return next;' },
    });
    expect(result.report.tests.commands).toHaveLength(1);
    expect(result.report.verification).toHaveLength(1);
  });

  it('rejects individual invalid items and keeps valid findings', () => {
    const raw = valid();
    raw.findings = [
      (raw.findings as unknown[])[0],
      {
        ...(raw.findings as Record<string, unknown>[])[0],
        id: 'f1',
        title: 'duplicate id',
      },
      {
        ...(raw.findings as Record<string, unknown>[])[0],
        id: 'f2',
        severity: 'nope',
      },
      {
        ...(raw.findings as Record<string, unknown>[])[0],
        id: 'f3',
        lineStart: 99,
        lineEnd: 100,
      },
      {
        ...(raw.findings as Record<string, unknown>[])[0],
        id: 'f4',
        evidence: 'x'.repeat(MAX_TEXT_BYTES + 1),
      },
      {
        ...(raw.findings as Record<string, unknown>[])[0],
        id: 'f5',
        file: 'src/missing.ts',
      },
    ];
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.report.findings.map((item) => item.id)).toEqual(['f1']);
    expect(result.rejected.map((item) => item.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    expect(result.rejected.every((item) => item.kind === 'finding')).toBe(true);
  });

  it('normalizes a sparse LLM finding and gives it a stable content id', () => {
    const raw = valid();
    raw.findings = [
      {
        file: 'src/a.ts',
        lineStart: 2,
        lineEnd: 2,
        severity: 'medium',
        title: 'Return is stale',
        evidence: 'return value;',
        recommendation: 'Return the next value.',
      },
    ];
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.rejected).toEqual([]);
    expect(result.report.findings[0]).toMatchObject({
      severity: 'major',
      category: 'other',
      confidence: 'medium',
      kind: 'issue',
      rationale: 'Return the next value.',
    });
    expect(result.report.findings[0]?.id).toMatch(/^f_auto_/);
  });

  it('gives different ids to sparse findings validated one at a time', () => {
    const first = validateFindingItem({
      file: 'src/a.ts',
      lineStart: 1,
      lineEnd: 1,
      severity: 'minor',
      title: 'First',
      evidence: 'one',
    });
    const second = validateFindingItem({
      file: 'src/a.ts',
      lineStart: 2,
      lineEnd: 2,
      severity: 'minor',
      title: 'Second',
      evidence: 'two',
    });
    expect(first.finding?.id).not.toBe(second.finding?.id);
  });

  it('rejects inherited prototype keys as severities', () => {
    const raw = valid();
    (raw.findings as Record<string, unknown>[])[0]!.severity = 'toString';
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.report.findings).toEqual([]);
    expect(result.rejected[0]?.reason).toContain('severity');
  });

  it('drops a mismatched suggestion but keeps the finding marked unanchored', () => {
    const raw = valid();
    (raw.findings as Record<string, unknown>[])[0]!.suggestion = {
      original: 'totally different',
      replacement: 'nope',
    };
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.report.findings).toHaveLength(1);
    expect(result.report.findings[0]?.suggestion).toBeUndefined();
    expect(result.report.findings[0]?.unanchored).toBe(true);
  });

  it('matches a suggestion after indentation and spacing normalization', () => {
    const raw = valid();
    (raw.findings as Record<string, unknown>[])[0]!.suggestion = {
      original: 'return   value;',
      replacement: 'return next;',
    };
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.report.findings[0]?.suggestion).toEqual({
      original: 'return   value;',
      replacement: 'return next;',
    });
    expect(result.report.findings[0]?.unanchored).toBeUndefined();
  });

  it('rejects questions, tests and verification independently', () => {
    const raw = valid();
    raw.questions = [
      { id: 'q1', file: 'src/a.ts', line: 1, question: 'ok', why: 'ok' },
      { id: 'q1', file: 'src/a.ts', line: 1, question: 'duplicate', why: 'x' },
      { id: 'q3', file: 'src/missing.ts', line: 1, question: 'missing', why: 'x' },
    ];
    raw.tests = { ran: true, commands: [{ command: 'x', result: 'bogus', summary: '' }] };
    raw.verification = [{ commentId: 'cmt_1', status: 'nope', evidence: 'x' }];
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.report.questions).toHaveLength(1);
    expect(result.report.tests.commands).toHaveLength(0);
    expect(result.report.verification).toHaveLength(0);
    expect(result.rejected.map((item) => item.kind)).toEqual([
      'question',
      'question',
      'verification',
      'test',
    ]);
  });

  it('enforces finding/question limits and records unknown fields', () => {
    const raw = valid();
    raw.findings = Array.from({ length: MAX_FINDINGS + 1 }, (_, index) => ({
      ...(raw.findings as Record<string, unknown>[])[0],
      id: `f${index}`,
    }));
    raw.questions = Array.from({ length: 51 }, (_, index) => ({
      id: `q${index}`,
      file: 'src/a.ts',
      line: 1,
      question: 'q',
      why: 'w',
    }));
    raw.mystery = true;
    const result = validateReport(raw, { snapshot: snapshot() });
    expect(result.report.findings).toHaveLength(MAX_FINDINGS);
    expect(result.report.questions).toHaveLength(50);
    expect(result.rejected.some((item) => item.reason.includes('more than'))).toBe(true);
    expect(result.warnings).toContain('unknown-report-field:mystery');
  });

  it('rejects a non-object or unsupported schema version', () => {
    expect(() => validateReport(null)).toThrow(ReportValidationError);
    expect(() => validateReport({ schemaVersion: 2 })).toThrow(ReportValidationError);
  });

  it('accepts a report without optional arrays', () => {
    const result = validateReport({
      schemaVersion: 1,
      summary: 'minimal',
      riskLevel: 'low',
    });
    expect(result.report).toMatchObject({
      findings: [],
      questions: [],
      verification: [],
      tests: { ran: false, commands: [] },
    });
  });
});
