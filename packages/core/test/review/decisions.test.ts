import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewLifecycle, ReviewStore, createEvent } from '../../src/index.js';
import type {
  Actor,
  AgentReport,
  FileDiff,
  Finding,
  ReviewLifecycleError,
  Snapshot,
} from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const roots: string[] = [];
const stores: ReviewStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(): Promise<ReviewStore> {
  const root = await mkdtemp(join(tmpdir(), 'cr-decisions-'));
  roots.push(root);
  const store = await ReviewStore.open(root);
  stores.push(store);
  return store;
}

function fileDiff(): FileDiff {
  const lines = ['one', 'two', 'three'];
  return {
    path: 'src/a.ts',
    status: 'modified',
    binary: false,
    oversized: false,
    added: 1,
    deleted: 0,
    hunks: [],
    oldLines: lines,
    newLines: lines,
    contentHash: null,
  };
}

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
    files: [fileDiff()],
    totals: { files: 1, added: 1, deleted: 0, truncated: false },
    warnings: [],
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: 'src/a.ts',
    lineStart: 2,
    lineEnd: 2,
    title: 'Off by one',
    rationale: 'The loop skips the last item.',
    evidence: 'for (let i = 0; i < n - 1; i++)',
    ...overrides,
  };
}

function report(round: number, findings: Finding[] = [finding()]): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'One issue',
    riskLevel: 'medium',
    findings,
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId: 'ignored',
    round,
    backend: 'fake',
    rejected: [],
    warnings: [],
  };
}

interface Seeded {
  store: ReviewStore;
  lifecycle: ReviewLifecycle;
  reviewId: string;
}

async function seeded(): Promise<Seeded> {
  const store = await openStore();
  const lifecycle = new ReviewLifecycle(store);
  const review = await lifecycle.create({ title: 'Decisions', repoRoot: '/tmp/repo', actor });
  const round = await lifecycle.addRound(review.id, snapshot(), actor);
  await store.append(
    review.id,
    createEvent({
      reviewId: review.id,
      type: 'agent/report',
      actor: { name: 'Reviewer', kind: 'agent' },
      data: { report: { ...report(round.no), reviewId: review.id } },
    }),
  );
  return { store, lifecycle, reviewId: review.id };
}

async function expectError(
  promise: Promise<unknown>,
  code: ReviewLifecycleError['code'],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: 'ReviewLifecycleError',
    code,
  } satisfies Partial<ReviewLifecycleError>);
}

describe('finding decisions', () => {
  it('accepts a finding with a trimmed note and persists it', async () => {
    const { lifecycle, reviewId, store } = await seeded();

    const decision = await lifecycle.decideFinding(
      reviewId,
      'f1',
      { state: 'accepted', note: '  Please fix this.  ' },
      actor,
    );

    expect(decision).toMatchObject({
      findingId: 'f1',
      round: 1,
      state: 'accepted',
      note: 'Please fix this.',
      by: actor,
    });
    expect(new Date(decision.at).toISOString()).toBe(decision.at);

    const loaded = await lifecycle.get(reviewId);
    expect(loaded.findingDecisions).toEqual([decision]);
    const events = await store.events(reviewId);
    expect(events.at(-1)?.type).toBe('finding/decision');
  });

  it('keeps the latest decision for the same finding', async () => {
    const { lifecycle, reviewId } = await seeded();

    await lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor);
    const dismissed = await lifecycle.decideFinding(
      reviewId,
      'f1',
      { state: 'dismissed', note: '' },
      actor,
    );

    const loaded = await lifecycle.get(reviewId);
    expect(loaded.findingDecisions).toEqual([
      expect.objectContaining({ state: 'accepted' }),
      dismissed,
    ]);
    expect(dismissed).not.toHaveProperty('note');
  });

  it('leaves an existing decision and note untouched when the finding is already decided', async () => {
    const { lifecycle, reviewId } = await seeded();
    const existing = await lifecycle.decideFinding(
      reviewId,
      'f1',
      { state: 'accepted', note: 'Keep this note' },
      actor,
    );

    const skipped = await lifecycle.decideFindingIfUndecided(
      reviewId,
      'f1',
      { state: 'dismissed' },
      actor,
    );

    expect(skipped).toBeNull();
    expect((await lifecycle.get(reviewId)).findingDecisions).toEqual([existing]);
  });

  it('lets only one concurrent conditional decision win', async () => {
    const { lifecycle, reviewId } = await seeded();

    const decisions = await Promise.all([
      lifecycle.decideFindingIfUndecided(reviewId, 'f1', { state: 'accepted' }, actor),
      lifecycle.decideFindingIfUndecided(reviewId, 'f1', { state: 'dismissed' }, actor),
    ]);

    expect(decisions.filter((decision) => decision !== null)).toHaveLength(1);
    expect((await lifecycle.get(reviewId)).findingDecisions).toHaveLength(1);
  });

  it('rejects unknown findings, stale reports, closed reviews and invalid notes', async () => {
    const { lifecycle, reviewId, store } = await seeded();

    await expectError(
      lifecycle.decideFinding(reviewId, 'missing', { state: 'accepted' }, actor),
      'finding-not-found',
    );
    await expectError(
      lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted', note: 'x'.repeat(4001) }, actor),
      'invalid-input',
    );

    await lifecycle.addRound(
      reviewId,
      {
        ...snapshot(),
        scope: { ...snapshot().scope, headSha: 'c'.repeat(40), worktreeDigest: 'c'.repeat(40) },
      },
      actor,
    );
    await expectError(
      lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor),
      'invalid-input',
    );

    await store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'agent/report',
        actor: { name: 'Reviewer', kind: 'agent' },
        data: { report: { ...report(2), reviewId } },
      }),
    );
    await lifecycle.close(reviewId, 'closed', actor);
    await expectError(
      lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor),
      'closed',
    );
  });
});
