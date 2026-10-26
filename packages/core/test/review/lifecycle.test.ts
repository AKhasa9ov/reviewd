import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewLifecycle, ReviewNotFoundError, ReviewStore } from '../../src/index.js';
import type { ReviewLifecycleError } from '../../src/index.js';
import type { Actor, FileDiff, Snapshot } from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const reviewer: Actor = { name: 'Reviewer', kind: 'agent' };
const roots: string[] = [];
const stores: ReviewStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(): Promise<ReviewStore> {
  const root = await mkdtemp(join(tmpdir(), 'cr-lifecycle-'));
  roots.push(root);
  const store = await ReviewStore.open(root);
  stores.push(store);
  return store;
}

function fileDiff(path: string, newLines: string[]): FileDiff {
  return {
    path,
    status: 'modified',
    binary: false,
    oversized: false,
    added: 0,
    deleted: 0,
    hunks: [],
    oldLines: newLines,
    newLines,
    contentHash: null,
  };
}

interface SnapshotOptions {
  path?: string;
  baseSha?: string;
  headSha?: string;
}

function snapshot(lines: string[], options: SnapshotOptions = {}): Snapshot {
  const path = options.path ?? 'src/a.ts';
  const baseSha = options.baseSha ?? 'a'.repeat(40);
  const headSha = options.headSha ?? 'b'.repeat(40);
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseSha,
      headSha,
      label: `${baseSha.slice(0, 7)}..${headSha.slice(0, 7)}`,
      worktreeDigest: headSha,
    },
    files: [fileDiff(path, lines)],
    totals: { files: 1, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

function worktreeSnapshot(lines: string[], digest: string): Snapshot {
  return {
    ...snapshot(lines),
    scope: {
      kind: 'worktree',
      repoRoot: '/tmp/repo',
      baseSha: 'a'.repeat(40),
      headSha: null,
      label: 'worktree',
      worktreeDigest: digest,
    },
  };
}

const six = ['one', 'two', 'three', 'four', 'five', 'six'];
const shifted = ['zero', ...six];

async function expectLifecycleError(
  promise: Promise<unknown>,
  code: ReviewLifecycleError['code'],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: 'ReviewLifecycleError',
    code,
  } satisfies Partial<ReviewLifecycleError>);
}

describe('ReviewLifecycle', () => {
  it('creates an open review and lists its summary', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);

    const review = await lifecycle.create({
      title: 'Review state',
      repoRoot: '/tmp/repo',
      actor,
    });

    expect(review.id).toMatch(/^rev_/);
    expect(review).toMatchObject({
      title: 'Review state',
      repoRoot: '/tmp/repo',
      status: 'open',
      rounds: [],
      comments: [],
      version: 1,
    });
    expect(new Date(review.createdAt).toISOString()).toBe(review.createdAt);

    await expect(lifecycle.list()).resolves.toEqual([
      {
        id: review.id,
        title: 'Review state',
        status: 'open',
        createdAt: review.createdAt,
        roundCount: 0,
        commentCount: 0,
        openCommentCount: 0,
      },
    ]);
  });

  it('adds immutable rounds and persists each snapshot', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Rounds', repoRoot: '/tmp/repo', actor });

    const first = await lifecycle.addRound(review.id, snapshot(six), actor);
    const second = await lifecycle.addRound(
      review.id,
      snapshot(shifted, { baseSha: 'c'.repeat(40), headSha: 'd'.repeat(40) }),
      actor,
    );

    expect(first).toMatchObject({
      no: 1,
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      path: `snapshots/${first.snapshotId}.json`,
    });
    expect(second).toMatchObject({
      no: 2,
      baseSha: 'c'.repeat(40),
      headSha: 'd'.repeat(40),
      path: `snapshots/${second.snapshotId}.json`,
    });
    expect(first.snapshotId).toMatch(/^snap_/);
    expect(second.snapshotId).not.toBe(first.snapshotId);

    const storedFirst = await store.readSnapshot(first.snapshotId);
    const storedSecond = await store.readSnapshot(second.snapshotId);
    expect(storedFirst.files[0]?.newLines).toEqual(six);
    expect(storedSecond.files[0]?.newLines).toEqual(shifted);
    await expect(lifecycle.latestSnapshot(review.id)).resolves.toEqual(storedSecond);

    const loaded = await lifecycle.get(review.id);
    expect(loaded.rounds.map((round) => round.no)).toEqual([1, 2]);
    expect(loaded.rounds[0]).toEqual(first);
    expect(loaded.rounds[1]).toEqual(second);
  });

  it('allows successive worktree rounds distinguished by their digest', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Worktree', repoRoot: '/tmp/repo', actor });

    const first = await lifecycle.addRound(review.id, worktreeSnapshot(six, 'digest-one'), actor);
    const second = await lifecycle.addRound(
      review.id,
      worktreeSnapshot(shifted, 'digest-two'),
      actor,
    );

    expect(first.headSha).toBeNull();
    expect(second).toMatchObject({ no: 2, headSha: null });
    await expect(lifecycle.latestSnapshot(review.id)).resolves.toMatchObject({
      scope: { worktreeDigest: 'digest-two' },
    });
  });

  it('rejects missing rounds, duplicate snapshots, and missing reviews', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Errors', repoRoot: '/tmp/repo', actor });

    await expectLifecycleError(lifecycle.latestSnapshot(review.id), 'no-rounds');
    await expectLifecycleError(
      lifecycle.addComment(
        review.id,
        { body: 'Too early', path: 'src/a.ts', side: 'new', lineStart: 1 },
        actor,
      ),
      'no-rounds',
    );

    const first = await lifecycle.addRound(review.id, snapshot(six), actor);
    await expectLifecycleError(
      lifecycle.addRound(review.id, snapshot(shifted), actor),
      'duplicate-round',
    );
    await lifecycle.addRound(
      review.id,
      snapshot(shifted, { baseSha: 'c'.repeat(40), headSha: 'd'.repeat(40) }),
      actor,
    );
    await expectLifecycleError(
      lifecycle.addRound(review.id, snapshot(six), actor),
      'duplicate-round',
    );
    await expectLifecycleError(lifecycle.latestSnapshot('rev_missing'), 'not-found');
    await expectLifecycleError(lifecycle.get('rev_missing'), 'not-found');
    await expect(first.no).toBe(1);
  });

  it('adds a comment with a captured anchor', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Comments', repoRoot: '/tmp/repo', actor });
    await lifecycle.addRound(review.id, snapshot(six), reviewer);

    const comment = await lifecycle.addComment(
      review.id,
      {
        body: 'This needs a guard.',
        path: 'src/a.ts',
        side: 'new',
        lineStart: 3,
        lineEnd: 4,
        suggestion: { original: 'three\nfour', replacement: 'three\nFOUR' },
      },
      actor,
    );

    expect(comment.id).toMatch(/^cmt_/);
    expect(comment).toMatchObject({
      reviewId: review.id,
      author: actor,
      body: 'This needs a guard.',
      state: 'open',
      replies: [],
      outcomes: [],
      suggestion: { original: 'three\nfour', replacement: 'three\nFOUR' },
    });
    expect(comment.anchors).toHaveLength(1);
    expect(comment.anchors[0]).toMatchObject({
      round: 1,
      path: 'src/a.ts',
      side: 'new',
      lineStart: 3,
      lineEnd: 4,
      quote: 'three\nfour',
      contextBefore: ['one', 'two'],
      contextAfter: ['five', 'six'],
      state: 'active',
    });

    const loaded = await lifecycle.get(review.id);
    expect(loaded.comments).toEqual([comment]);

    await expectLifecycleError(
      lifecycle.addComment(
        review.id,
        { body: 'Missing file', path: 'src/missing.ts', side: 'new', lineStart: 1 },
        actor,
      ),
      'snapshot-mismatch',
    );
  });

  it('replies without changing comment identity and never deletes comments', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Replies', repoRoot: '/tmp/repo', actor });
    await lifecycle.addRound(review.id, snapshot(six), reviewer);
    const comment = await lifecycle.addComment(
      review.id,
      { body: 'Question?', path: 'src/a.ts', side: 'new', lineStart: 2 },
      reviewer,
    );

    const replied = await lifecycle.reply(review.id, comment.id, 'Answer.', actor);
    expect(replied.id).toBe(comment.id);
    expect(replied.body).toBe('Question?');
    expect(replied.replies).toHaveLength(1);
    expect(replied.replies[0]).toMatchObject({ author: actor, body: 'Answer.' });
    expect(replied.replies[0]?.id).toMatch(/^cmt_/);

    for (const state of ['resolved', 'dismissed', 'open'] as const) {
      const updated = await lifecycle.setCommentState(review.id, comment.id, state, actor);
      expect(updated.state).toBe(state);
      expect(updated.id).toBe(comment.id);
      expect(updated.body).toBe('Question?');
      expect(updated.replies).toHaveLength(1);
    }

    const loaded = await lifecycle.get(review.id);
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments[0]?.id).toBe(comment.id);
    expect(loaded.comments[0]?.replies).toHaveLength(1);

    await expectLifecycleError(
      lifecycle.reply(review.id, 'cmt_missing', 'Body', actor),
      'comment-not-found',
    );
    await expectLifecycleError(
      lifecycle.setCommentState(review.id, 'cmt_missing', 'resolved', actor),
      'comment-not-found',
    );
  });

  it('closes the review and rejects later mutations', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Close', repoRoot: '/tmp/repo', actor });
    await lifecycle.addRound(review.id, snapshot(six), reviewer);
    const comment = await lifecycle.addComment(
      review.id,
      { body: 'Fix', path: 'src/a.ts', side: 'new', lineStart: 1 },
      actor,
    );

    const closed = await lifecycle.close(review.id, 'approved', reviewer);
    expect(closed.status).toBe('closed');
    expect(closed.comments).toHaveLength(1);

    await expectLifecycleError(lifecycle.addRound(review.id, snapshot(shifted), actor), 'closed');
    await expectLifecycleError(
      lifecycle.addComment(
        review.id,
        { body: 'Late', path: 'src/a.ts', side: 'new', lineStart: 1 },
        actor,
      ),
      'closed',
    );
    await expectLifecycleError(lifecycle.reply(review.id, comment.id, 'Late', actor), 'closed');
    await expectLifecycleError(
      lifecycle.setCommentState(review.id, comment.id, 'resolved', actor),
      'closed',
    );
    await expectLifecycleError(
      lifecycle.refresh(
        review.id,
        snapshot(shifted, { baseSha: 'c'.repeat(40), headSha: 'd'.repeat(40) }),
        actor,
      ),
      'closed',
    );
    await expectLifecycleError(lifecycle.close(review.id, 'closed', actor), 'closed');
  });

  it('refreshes rounds and re-anchors every comment while preserving history', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Refresh', repoRoot: '/tmp/repo', actor });
    const first = await lifecycle.addRound(review.id, snapshot(six), reviewer);
    const open = await lifecycle.addComment(
      review.id,
      { body: 'Line three', path: 'src/a.ts', side: 'new', lineStart: 3 },
      actor,
    );
    const resolved = await lifecycle.addComment(
      review.id,
      { body: 'Line five', path: 'src/a.ts', side: 'new', lineStart: 5 },
      actor,
    );
    await lifecycle.setCommentState(review.id, resolved.id, 'resolved', actor);

    const result = await lifecycle.refresh(
      review.id,
      snapshot(shifted, { baseSha: 'c'.repeat(40), headSha: 'd'.repeat(40) }),
      reviewer,
    );
    const second = result.round;

    expect(second.no).toBe(2);
    expect(result.comments).toHaveLength(2);
    expect(result.comments[0]?.id).toBe(open.id);
    expect(result.comments[0]?.body).toBe('Line three');
    expect(result.comments[0]?.anchors).toHaveLength(2);
    expect(result.comments[0]?.anchors[1]).toMatchObject({
      round: 2,
      lineStart: 4,
      quote: 'three',
      state: 'active',
      previous: { round: 1, path: 'src/a.ts', lineStart: 3, lineEnd: 3 },
    });
    expect(result.comments[1]?.id).toBe(resolved.id);
    expect(result.comments[1]?.state).toBe('resolved');
    expect(result.comments[1]?.anchors).toHaveLength(2);
    expect(result.comments[1]?.anchors[1]).toMatchObject({
      round: 2,
      lineStart: 6,
      previous: { round: 1, path: 'src/a.ts', lineStart: 5, lineEnd: 5 },
    });

    const stored = await lifecycle.get(review.id);
    expect(stored.rounds.map((round) => round.no)).toEqual([1, 2]);
    expect(stored.comments).toEqual(result.comments);
    await expect(store.readSnapshot(first.snapshotId)).resolves.toMatchObject({
      files: [{ newLines: six }],
    });
  });

  it('stores deterministic outcomes for re-anchored comments', async () => {
    const store = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({ title: 'Outcomes', repoRoot: '/tmp/repo', actor });
    await lifecycle.addRound(review.id, snapshot(six), reviewer);
    const comment = await lifecycle.addComment(
      review.id,
      { body: 'Line three', path: 'src/a.ts', side: 'new', lineStart: 3 },
      actor,
    );

    const result = await lifecycle.refresh(
      review.id,
      snapshot(shifted, { baseSha: 'c'.repeat(40), headSha: 'd'.repeat(40) }),
      reviewer,
    );

    expect(result.comments[0]?.outcomes).toEqual([
      { round: 2, status: 'moved', confidence: 'high' },
    ]);
    const stored = await lifecycle.get(review.id);
    expect(stored.comments[0]?.id).toBe(comment.id);
    expect(stored.comments[0]?.outcomes).toEqual(result.comments[0]?.outcomes);
    expect(stored.comments[0]?.anchors).toHaveLength(2);
  });

  it('reads snapshots and reports missing or corrupt files as not found', async () => {
    const store = await openStore();
    await expect(store.readSnapshot('snap_missing')).rejects.toBeInstanceOf(ReviewNotFoundError);

    const root = roots[0];
    if (root === undefined) throw new Error('missing test root');
    await mkdir(join(root, 'snapshots'), { recursive: true });
    await writeFile(join(root, 'snapshots', 'snap_corrupt.json'), '{not json', 'utf8');
    await expect(store.readSnapshot('snap_corrupt')).rejects.toBeInstanceOf(ReviewNotFoundError);
    await expect(readFile(join(root, 'snapshots', 'snap_corrupt.json'), 'utf8')).resolves.toBe(
      '{not json',
    );
  });
});
