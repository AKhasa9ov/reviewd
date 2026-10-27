import type { Anchor, Comment, FileDiff, Snapshot } from '@dsh-code-review/core';
import type { ReviewView, ServiceSnapshotView, LatestFeedbackView } from '@dsh-code-review/ui';

const now = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

export function makeAnchor(
  round: number,
  path: string,
  lineStart: number,
  lineEnd: number,
  state: Anchor['state'] = 'active',
  quote = 'const retry = attempt < 3;',
): Anchor {
  return {
    id: `anchor_${round}_${path}_${lineStart}`,
    round,
    path,
    side: 'new',
    lineStart,
    lineEnd,
    quote,
    contextBefore: ['function charge() {'],
    contextAfter: ['  return fetchCharge();'],
    hunkHeader: '@@ -10,7 +10,9 @@',
    contentHash: 'hash',
    state,
  };
}

function comment(
  id: string,
  body: string,
  anchors: Anchor[],
  state: Comment['state'] = 'open',
  extra: Partial<Comment> = {},
): Comment {
  return {
    id,
    reviewId: 'rev_01',
    createdAt: now,
    author: { name: 'alex', kind: 'human' },
    body,
    state,
    replies: [],
    anchors,
    outcomes: [],
    ...extra,
  };
}

const fileAuth: FileDiff = {
  path: 'src/auth.ts',
  status: 'modified',
  binary: false,
  oversized: false,
  added: 2,
  deleted: 1,
  contentHash: 'hash-auth',
  hunks: [
    {
      oldStart: 10,
      oldLines: 4,
      newStart: 10,
      newLines: 5,
      header: '@@ -10,4 +10,5 @@ charge()',
      lines: [
        { kind: 'context', oldNo: 10, newNo: 10, text: 'function charge() {' },
        { kind: 'del', oldNo: 11, newNo: null, text: '  const retry = attempt < 2;' },
        { kind: 'add', oldNo: null, newNo: 11, text: '  const retry = attempt < 3;' },
        { kind: 'add', oldNo: null, newNo: 12, text: '  // retry twice' },
        { kind: 'context', oldNo: 12, newNo: 13, text: '  return fetchCharge();' },
        { kind: 'context', oldNo: 13, newNo: 14, text: '}' },
      ],
    },
  ],
  oldLines: [
    ...Array.from({ length: 9 }, (_, index) => `  // old line ${index + 1}`),
    'function charge() {',
    '  const retry = attempt < 2;',
    '  return fetchCharge();',
    '}',
  ],
  newLines: [
    ...Array.from({ length: 9 }, (_, index) => `  // new line ${index + 1}`),
    'function charge() {',
    '  const retry = attempt < 3;',
    '  // retry twice',
    '  return fetchCharge();',
    '}',
  ],
};

const fileReadme: FileDiff = {
  path: 'docs/retries.md',
  status: 'added',
  binary: false,
  oversized: false,
  added: 3,
  deleted: 0,
  contentHash: 'hash-readme',
  hunks: [
    {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 3,
      header: '@@ -0,0 +1,3 @@',
      lines: [
        { kind: 'add', oldNo: null, newNo: 1, text: '# Retries' },
        { kind: 'add', oldNo: null, newNo: 2, text: '' },
        { kind: 'add', oldNo: null, newNo: 3, text: 'Billing retries use a budget.' },
      ],
    },
  ],
  oldLines: [],
  newLines: ['# Retries', '', 'Billing retries use a budget.'],
};

const fileLegacy: FileDiff = {
  path: 'src/legacy.ts',
  status: 'deleted',
  binary: false,
  oversized: false,
  added: 0,
  deleted: 2,
  contentHash: 'hash-legacy',
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 0,
      newLines: 0,
      header: '@@ -1,2 +0,0 @@',
      lines: [
        { kind: 'del', oldNo: 1, newNo: null, text: 'export const legacy = true;' },
        { kind: 'del', oldNo: 2, newNo: null, text: 'export const old = true;' },
      ],
    },
  ],
  oldLines: ['export const legacy = true;', 'export const old = true;'],
  newLines: [],
};

function snapshot(round: number): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/srv/repo',
      baseRef: 'main',
      headRef: 'feature/billing',
      baseSha: '9f3a1c2d4e5f60718293a4b5c6d7e8f901234567',
      headSha:
        round === 2
          ? '4b8e7a10f2e3d4c5b6a79887766554433221100f'
          : '1a2b3c4d5e6f708192a3b4c5d6e7f80912345678',
      label: 'main → feature/billing',
      worktreeDigest: 'digest',
    },
    files: round === 2 ? [fileAuth, fileReadme, fileLegacy] : [fileAuth],
    totals: { files: round === 2 ? 3 : 1, added: 5, deleted: 3, truncated: false },
    warnings: [],
  };
}

export const alex = { name: 'alex', kind: 'human' as const };

export const reviewView: ReviewView = {
  review: {
    id: 'rev_01',
    title: 'Billing retry semantics',
    repoRoot: '/srv/repo',
    status: 'open',
    createdAt: now,
    createdBy: alex,
    version: 3,
    rounds: [
      {
        no: 1,
        snapshotId: 'snap_1',
        createdAt: now,
        baseSha: '9f3a1c2d4e5f60718293a4b5c6d7e8f901234567',
        headSha: '1a2b3c4d5e6f708192a3b4c5d6e7f80912345678',
        path: '/srv/repo',
      },
      {
        no: 2,
        snapshotId: 'snap_2',
        createdAt: now,
        baseSha: '9f3a1c2d4e5f60718293a4b5c6d7e8f901234567',
        headSha: '4b8e7a10f2e3d4c5b6a79887766554433221100f',
        path: '/srv/repo',
      },
    ],
    comments: [
      comment(
        'c1',
        'This should use the configured max attempts.',
        [
          makeAnchor(1, 'src/auth.ts', 11, 11, 'active'),
          makeAnchor(2, 'src/auth.ts', 11, 12, 'active'),
        ],
        'open',
        {
          suggestion: {
            original: '  const retry = attempt < 3;',
            replacement: '  const retry = attempt < config.maxAttempts;',
          },
          outcomes: [{ round: 2, status: 'unchanged', confidence: 'high' }],
          replies: [
            {
              id: 'r1',
              author: { name: 'agent', kind: 'agent' },
              body: 'Updated the constant.',
              createdAt: now,
            },
          ],
        },
      ),
      comment(
        'c2',
        'The docs claim three retries but the code says two.',
        [
          makeAnchor(1, 'docs/retries.md', 3, 3, 'active'),
          makeAnchor(2, 'docs/retries.md', 3, 3, 'outdated'),
        ],
        'open',
        { outcomes: [{ round: 2, status: 'outdated', confidence: 'high' }] },
      ),
      comment(
        'c3',
        'Old legacy helper can go.',
        [
          makeAnchor(1, 'src/legacy.ts', 1, 2, 'active'),
          makeAnchor(2, 'src/legacy.ts', 1, 2, 'active'),
        ],
        'resolved',
      ),
    ],
    reviewer: { backend: 'none' },
    agent: { status: 'done', round: 2, findings: [] },
    submissions: [],
    fixClaims: [
      {
        commentId: 'c1',
        status: 'fixed',
        evidence: 'Changed to config.maxAttempts.',
        by: { name: 'agent', kind: 'agent' },
        at: now,
      },
    ],
  },
  latestSnapshot: snapshot(2),
  report: {
    schemaVersion: 1,
    reviewId: 'rev_01',
    round: 2,
    backend: 'none',
    summary: 'Retry handling is close, but docs and the fallback path disagree.',
    riskLevel: 'medium',
    findings: [
      {
        id: 'f1',
        severity: 'major',
        category: 'correctness',
        confidence: 'high',
        kind: 'issue',
        file: 'src/auth.ts',
        lineStart: 11,
        lineEnd: 12,
        title: 'Retry budget is hard-coded',
        rationale: 'The retry count cannot be configured per environment.',
        evidence: 'const retry = attempt < 3;',
        suggestion: {
          original: 'const retry = attempt < 3;',
          replacement: 'const retry = attempt < config.maxAttempts;',
        },
      },
      {
        id: 'f2',
        severity: 'minor',
        category: 'docs',
        confidence: 'medium',
        kind: 'question',
        file: 'docs/retries.md',
        lineStart: 3,
        lineEnd: 3,
        title: 'Docs say three retries',
        rationale: 'The new doc and the fallback path may disagree.',
        evidence: 'Billing retries use a budget.',
      },
    ],
    questions: [
      {
        id: 'q1',
        file: 'src/auth.ts',
        line: 13,
        question: 'Is fetchCharge idempotent?',
        why: 'Retries may double-charge.',
      },
    ],
    tests: {
      ran: true,
      commands: [{ command: 'pnpm test', result: 'pass', summary: '282 passed' }],
    },
    verification: [{ commentId: 'c1', status: 'fixed', evidence: 'Uses config now.' }],
    warnings: [],
    rejected: [],
  },
};

export const snapshotR2: ServiceSnapshotView = { snapshot: snapshot(2), round: 2 };
export const snapshotR1: ServiceSnapshotView = { snapshot: snapshot(1), round: 1 };

export const latestFeedback: LatestFeedbackView = {
  submission: {
    submissionId: 'sub_1',
    round: 2,
    verdict: 'request-changes',
    deliveryKey: 'delivery-key',
    createdAt: now,
  },
  feedback: {
    markdown: '# Feedback for round 2',
    deliveryKey: 'delivery-key',
    json: {
      schemaVersion: 1,
      reviewId: 'rev_01',
      round: 2,
      verdict: 'request-changes',
      title: 'Billing retry semantics',
      scope: { baseSha: 'base', headSha: 'head', label: 'main → feature/billing' },
      deliveryKey: 'delivery-key',
      findings: [],
      dismissedFindings: [],
      humanComments: [],
      appliedSuggestions: [],
      acceptedSuggestions: [],
      questions: [],
      verification: [],
      resolved: { count: 0, commentIds: [] },
    },
  },
};
