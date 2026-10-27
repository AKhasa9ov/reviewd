import { describe, expect, it } from 'vitest';
import { buildFeedback, FEEDBACK_BYTE_LIMIT } from '../../src/index.js';
import type {
  Actor,
  AgentReport,
  Comment,
  Finding,
  FindingDecision,
  Snapshot,
  ReviewState,
} from '../../src/index.js';

const at = '2026-10-26T12:00:00.000Z';
const human: Actor = { name: 'Ada', kind: 'human' };

function snapshot(): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'aaaaaaa..bbbbbbb',
      worktreeDigest: 'b'.repeat(40),
    },
    files: [
      {
        path: 'src/a.ts',
        status: 'modified',
        binary: false,
        oversized: false,
        added: 0,
        deleted: 0,
        hunks: [],
        oldLines: ['one', 'two', 'three'],
        newLines: ['one', 'two', 'three'],
        contentHash: null,
      },
    ],
    totals: { files: 1, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_1',
    reviewId: 'rev_1',
    createdAt: at,
    author: human,
    body: 'Please fix',
    state: 'open',
    replies: [],
    anchors: [
      {
        id: 'anc_1',
        round: 1,
        path: 'src/a.ts',
        side: 'new',
        lineStart: 2,
        lineEnd: 2,
        quote: 'two',
        contextBefore: ['one'],
        contextAfter: ['three'],
        hunkHeader: '@@ -1,3 +1,3 @@',
        contentHash: 'hash',
        state: 'active',
      },
    ],
    outcomes: [],
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'blocker',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: 'src/a.ts',
    lineStart: 2,
    lineEnd: 2,
    title: 'Bad loop',
    rationale: 'It skips an item.',
    evidence: 'for (...)',
    ...overrides,
  };
}

function report(overrides: Partial<AgentReport> = {}): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'Review summary',
    riskLevel: 'high',
    findings: [finding()],
    questions: [
      {
        id: 'q1',
        file: 'src/a.ts',
        line: 2,
        question: 'Is this intentional?',
        why: 'It changes behavior.',
      },
    ],
    tests: { ran: true, commands: [] },
    verification: [],
    reviewId: 'rev_1',
    round: 1,
    backend: 'fake',
    rejected: [],
    warnings: [],
    ...overrides,
  };
}

function review(comments: Comment[], decisions: FindingDecision[] = []): ReviewState {
  return {
    id: 'rev_1',
    title: 'Demo review',
    repoRoot: '/tmp/repo',
    status: 'open',
    createdAt: at,
    rounds: [
      {
        no: 1,
        snapshotId: 'snap_1',
        createdAt: at,
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        path: 'snapshots/snap_1.json',
      },
    ],
    comments,
    version: 2,
    ...(decisions.length === 0 ? {} : { findingDecisions: decisions }),
  };
}

function input(
  overrides: {
    comments?: Comment[];
    report?: AgentReport | null;
    decisions?: FindingDecision[];
  } = {},
) {
  return {
    review: review(overrides.comments ?? [], overrides.decisions ?? []),
    snapshot: snapshot(),
    report: overrides.report === undefined ? report() : overrides.report,
    round: 1,
    verdict: 'request-changes' as const,
    deliveryKey: 'rev_1:1:sub_1',
    summary: 'Please address these.',
  };
}

function decision(overrides: Partial<FindingDecision> = {}): FindingDecision {
  return {
    findingId: 'f1',
    round: 1,
    state: 'accepted',
    by: human,
    at,
    ...overrides,
  };
}

describe('buildFeedback', () => {
  it('is deterministic and contains all required sections', () => {
    const applied = comment({
      id: 'cmt_applied',
      body: 'Applied comment',
      suggestion: { original: 'two', replacement: 'TWO' },
      outcomes: [{ round: 1, status: 'applied', confidence: 'high' }],
    });
    const accepted = comment({
      id: 'cmt_accepted',
      suggestion: { original: 'two', replacement: '2' },
    });
    const resolved = comment({ id: 'cmt_resolved', body: 'Resolved', state: 'resolved' });
    const first = buildFeedback(input({ comments: [applied, accepted, resolved] }));
    const second = buildFeedback(input({ comments: [applied, accepted, resolved] }));

    expect(first.markdown).toBe(second.markdown);
    expect(first.json).toEqual(second.json);
    expect(first.markdown).toContain('## Ревью «Demo review» — changes requested (round 1)');
    expect(first.markdown).toContain('### Замечания агента (к исправлению)');
    expect(first.markdown).toContain('[blocker][src/a.ts:2] Bad loop');
    expect(first.markdown).toContain('### Комментарии человека (open)');
    expect(first.markdown).toContain('### Принятые suggested правки');
    expect(first.markdown).toContain('применено человеком (не применять повторно)');
    expect(first.markdown).toContain('принято, но не применено');
    expect(first.markdown).toContain('### Вопросы к тебе');
    expect(first.markdown).toContain('### Уже исправлено в этом раунде');
    expect(first.json).toMatchObject({
      deliveryKey: 'rev_1:1:sub_1',
      resolved: { count: 1, commentIds: ['cmt_resolved'] },
    });
    expect(first.json.appliedSuggestions).toHaveLength(1);
    expect(first.json.acceptedSuggestions).toHaveLength(1);
  });

  it('excludes nit findings and closed human comments by default', () => {
    const feedback = buildFeedback(
      input({
        comments: [comment({ id: 'cmt_closed', state: 'dismissed' })],
        report: report({ findings: [finding({ severity: 'nit' })] }),
      }),
    );
    expect(feedback.markdown).not.toContain('Bad loop');
    expect(feedback.json.humanComments).toHaveLength(0);
    expect(feedback.json.resolved.count).toBe(0);
  });

  it('includes an accepted minor finding with its human note', () => {
    const feedback = buildFeedback(
      input({
        report: report({ findings: [finding({ severity: 'minor', title: 'Tighten the type' })] }),
        decisions: [decision({ state: 'accepted', note: 'Please do this, it affects callers.' })],
      }),
    );

    expect(feedback.markdown).toContain('[accepted][minor][src/a.ts:2] Tighten the type');
    expect(feedback.markdown).toContain('Please do this, it affects callers.');
    expect(feedback.json.findings).toEqual([
      expect.objectContaining({
        id: 'f1',
        severity: 'minor',
        decision: 'accepted',
        note: 'Please do this, it affects callers.',
      }),
    ]);
    expect(feedback.json.dismissedFindings).toEqual([]);
  });

  it('excludes a dismissed finding and tells the agent not to repeat a noted one', () => {
    const feedback = buildFeedback(
      input({
        decisions: [decision({ state: 'dismissed', note: 'This is intentional.' })],
      }),
    );

    expect(feedback.markdown).not.toContain('[blocker][src/a.ts:2] Bad loop');
    expect(feedback.markdown).toContain('### Отклонено человеком');
    expect(feedback.markdown).toContain('This is intentional.');
    expect(feedback.json.findings).toEqual([]);
    expect(feedback.json.dismissedFindings).toEqual([
      expect.objectContaining({ id: 'f1', decision: 'dismissed', note: 'This is intentional.' }),
    ]);
  });

  it('keeps the latest decision and ignores decisions from another round', () => {
    const dismissed = buildFeedback(
      input({
        decisions: [
          decision({ state: 'accepted', note: 'First note' }),
          decision({ state: 'dismissed', note: 'Second note' }),
        ],
      }),
    );
    expect(dismissed.markdown).not.toContain('[accepted]');
    expect(dismissed.markdown).toContain('Second note');
    expect(dismissed.markdown).not.toContain('First note');

    const stale = buildFeedback(
      input({
        decisions: [decision({ round: 2, state: 'dismissed', note: 'From next round' })],
      }),
    );
    expect(stale.markdown).toContain('[blocker][src/a.ts:2] Bad loop');
    expect(stale.markdown).not.toContain('From next round');
    expect(stale.json.dismissedFindings).toEqual([]);
  });

  it('caps markdown at 100 KiB with a deterministic notice', () => {
    const feedback = buildFeedback(
      input({ comments: [comment({ body: 'x'.repeat(120 * 1024) })] }),
    );
    expect(Buffer.byteLength(feedback.markdown, 'utf8')).toBeLessThanOrEqual(FEEDBACK_BYTE_LIMIT);
    expect(feedback.markdown).toContain('feedback truncated at');
  });

  it('caps the JSON package at 100 KiB and marks it truncated', () => {
    const feedback = buildFeedback(
      input({ comments: [comment({ body: 'y'.repeat(120 * 1024) })] }),
    );
    expect(feedback.json.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(feedback.json), 'utf8')).toBeLessThanOrEqual(
      FEEDBACK_BYTE_LIMIT,
    );
  });

  it('does not include agent settings or timestamps', () => {
    const feedback = buildFeedback(input());
    expect(feedback.markdown).not.toContain(at);
    expect(feedback.markdown).not.toContain('backend');
  });
});
