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

  it('transfers an accepted finding into one AI comment', async () => {
    const { lifecycle, reviewId, store } = await seeded();

    const decision = await lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor);

    const loaded = await lifecycle.get(reviewId);
    expect(loaded.comments).toHaveLength(1);
    const transferred = loaded.comments[0]!;
    expect(transferred).toMatchObject({
      sourceFindingId: 'f1',
      author: { name: 'AI', kind: 'agent' },
      state: 'open',
      reviewId,
    });
    expect(transferred.body).toContain('Off by one');
    expect(transferred.body).toContain('The loop skips the last item.');
    expect(transferred.anchors).toEqual([
      expect.objectContaining({
        path: 'src/a.ts',
        lineStart: 2,
        lineEnd: 2,
        round: 1,
        quote: 'for (let i = 0; i < n - 1; i++)',
      }),
    ]);
    expect(decision.commentId).toBe(transferred.id);

    const decisionEvent = (await store.events(reviewId)).at(-1);
    expect(decisionEvent?.type).toBe('finding/decision');
    expect(decisionEvent?.data).toMatchObject({
      decision: { findingId: 'f1', commentId: transferred.id },
      comment: { id: transferred.id, sourceFindingId: 'f1' },
    });
  });

  it('does not create a second comment when the finding is accepted twice', async () => {
    const { lifecycle, reviewId } = await seeded();

    await lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor);
    await lifecycle.decideFinding(
      reviewId,
      'f1',
      { state: 'accepted', note: 'second decision' },
      actor,
    );

    const loaded = await lifecycle.get(reviewId);
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.findingDecisions).toHaveLength(2);
    expect(loaded.findingDecisions?.at(-1)?.commentId).toBe(loaded.comments[0]?.id);
  });

  it('soft-deletes the transferred comment when the finding is dismissed', async () => {
    const { lifecycle, reviewId } = await seeded();

    await lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor);
    const dismissed = await lifecycle.decideFinding(reviewId, 'f1', { state: 'dismissed' }, actor);

    const loaded = await lifecycle.get(reviewId);
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments[0]).toMatchObject({
      sourceFindingId: 'f1',
      deletedBy: actor,
    });
    expect(loaded.comments[0]?.deletedAt).toBeDefined();
    expect(dismissed.commentId).toBe(loaded.comments[0]?.id);
  });

  it('creates a fresh comment when a dismissed finding is accepted again', async () => {
    const { lifecycle, reviewId } = await seeded();

    await lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor);
    const firstId = (await lifecycle.get(reviewId)).comments[0]?.id;
    await lifecycle.decideFinding(reviewId, 'f1', { state: 'dismissed' }, actor);
    const accepted = await lifecycle.decideFinding(reviewId, 'f1', { state: 'accepted' }, actor);

    const loaded = await lifecycle.get(reviewId);
    const active = loaded.comments.filter((comment) => comment.deletedAt === undefined);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).not.toBe(firstId);
    expect(accepted.commentId).toBe(active[0]?.id);
    expect(loaded.comments).toHaveLength(2);
  });

  it('backfills a comment for an accepted decision without one', async () => {
    const { lifecycle, reviewId, store } = await seeded();
    await store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'finding/decision',
        actor,
        data: {
          decision: {
            findingId: 'f1',
            round: 1,
            state: 'accepted',
            note: 'Fix this too',
            by: actor,
            at: '2026-10-27T12:00:00.000Z',
          },
        },
      }),
    );

    const comments = await lifecycle.transferAcceptedFindings(reviewId, actor);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      sourceFindingId: 'f1',
      author: { name: 'AI', kind: 'agent' },
      state: 'open',
    });
    expect(comments[0]?.body).toContain('Note to the agent: Fix this too');
    expect(await lifecycle.transferAcceptedFindings(reviewId, actor)).toEqual([]);
    expect((await lifecycle.get(reviewId)).comments).toHaveLength(1);
  });

  it('does not backfill a finding whose latest decision is dismissed', async () => {
    const { lifecycle, reviewId, store } = await seeded();
    for (const state of ['accepted', 'dismissed'] as const) {
      await store.append(
        reviewId,
        createEvent({
          reviewId,
          type: 'finding/decision',
          actor,
          data: {
            decision: {
              findingId: 'f1',
              round: 1,
              state,
              by: actor,
              at: '2026-10-27T12:00:00.000Z',
            },
          },
        }),
      );
    }

    expect(await lifecycle.transferAcceptedFindings(reviewId, actor)).toEqual([]);
    expect((await lifecycle.get(reviewId)).comments).toHaveLength(0);
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
