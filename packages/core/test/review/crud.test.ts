import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewLifecycle, ReviewStore } from '../../src/index.js';
import type { Actor, FileDiff, ReviewLifecycleError, Snapshot } from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const roots: string[] = [];
const stores: ReviewStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

function snapshot(head = 'b'): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseRef: 'main',
      headRef: 'feature',
      baseSha: 'a'.repeat(40),
      headSha: head.repeat(40),
      label: `main..${head}`,
      worktreeDigest: head.repeat(40),
    },
    files: [fileDiff()],
    totals: { files: 1, added: 1, deleted: 0, truncated: false },
    warnings: [],
  };
}

interface Seeded {
  lifecycle: ReviewLifecycle;
  reviewId: string;
}

async function seeded(head = 'b'): Promise<Seeded> {
  const root = await mkdtemp(join(tmpdir(), 'cr-crud-'));
  roots.push(root);
  const store = await ReviewStore.open(root);
  stores.push(store);
  const lifecycle = new ReviewLifecycle(store);
  const review = await lifecycle.create({ title: 'Original', repoRoot: '/tmp/repo', actor });
  await lifecycle.addRound(review.id, snapshot(head), actor);
  return { lifecycle, reviewId: review.id };
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

describe('review CRUD', () => {
  it('updates the title and reviewer while keeping identity and rounds', async () => {
    const { lifecycle, reviewId } = await seeded();

    const updated = await lifecycle.updateReview(
      reviewId,
      { title: '  Corrected  ', reviewer: { backend: 'worker' } },
      actor,
    );

    expect(updated).toMatchObject({
      id: reviewId,
      title: 'Corrected',
      repoRoot: '/tmp/repo',
      reviewer: { backend: 'worker' },
      updatedBy: actor,
    });
    expect(updated.updatedAt).toBe(new Date(updated.updatedAt!).toISOString());
    expect(updated.rounds).toHaveLength(1);
  });

  it('refuses edits after close and on a deleted review', async () => {
    const { lifecycle, reviewId } = await seeded();
    await lifecycle.close(reviewId, 'closed', actor);
    await expectError(lifecycle.updateReview(reviewId, { title: 'Late' }, actor), 'closed');

    const second = await seeded('c');
    await second.lifecycle.deleteReview(second.reviewId, actor, 'duplicate');
    await expectError(
      second.lifecycle.updateReview(second.reviewId, { title: 'Gone' }, actor),
      'not-found',
    );
  });

  it('soft-deletes open and closed reviews and hides them from the list', async () => {
    const open = await seeded();
    const closed = await seeded('c');
    await closed.lifecycle.close(closed.reviewId, 'closed', actor);

    const deletedOpen = await open.lifecycle.deleteReview(open.reviewId, actor, 'duplicate');
    const deletedClosed = await closed.lifecycle.deleteReview(closed.reviewId, actor);

    expect(deletedOpen).toMatchObject({ deletedBy: actor });
    expect(deletedOpen.deletedAt).toBe(new Date(deletedOpen.deletedAt!).toISOString());
    expect(deletedClosed.deletedAt).toBeDefined();
    expect(await open.lifecycle.list()).toEqual([]);
  });

  it('edits a comment body and keeps its anchors and replies', async () => {
    const { lifecycle, reviewId } = await seeded();
    const comment = await lifecycle.addComment(
      reviewId,
      { body: 'Original', path: 'src/a.ts', side: 'new', lineStart: 2 },
      actor,
    );
    await lifecycle.reply(reviewId, comment.id, 'Answer', actor);

    const edited = await lifecycle.editComment(reviewId, comment.id, '  Corrected  ', actor);

    expect(edited).toMatchObject({
      body: 'Corrected',
      editedBy: actor,
      anchors: [expect.objectContaining({ path: 'src/a.ts', lineStart: 2 })],
      replies: [expect.objectContaining({ body: 'Answer' })],
    });
    expect(edited.editedAt).toBe(new Date(edited.editedAt!).toISOString());
  });

  it('refuses empty edits and edits of closed or deleted comments', async () => {
    const { lifecycle, reviewId } = await seeded();
    const comment = await lifecycle.addComment(
      reviewId,
      { body: 'Original', path: 'src/a.ts', side: 'new', lineStart: 2 },
      actor,
    );
    await expectError(lifecycle.editComment(reviewId, comment.id, '   ', actor), 'invalid-input');

    await lifecycle.deleteComment(reviewId, comment.id, actor);
    await expectError(
      lifecycle.editComment(reviewId, comment.id, 'After delete', actor),
      'comment-not-found',
    );

    const closed = await seeded('c');
    const second = await closed.lifecycle.addComment(
      closed.reviewId,
      { body: 'Original', path: 'src/a.ts', side: 'new', lineStart: 2 },
      actor,
    );
    await closed.lifecycle.close(closed.reviewId, 'closed', actor);
    await expectError(
      closed.lifecycle.editComment(closed.reviewId, second.id, 'Late', actor),
      'closed',
    );
  });

  it('soft-deletes a commented thread, including in a closed review', async () => {
    const { lifecycle, reviewId } = await seeded();
    const comment = await lifecycle.addComment(
      reviewId,
      { body: 'Original', path: 'src/a.ts', side: 'new', lineStart: 2 },
      actor,
    );
    await lifecycle.reply(reviewId, comment.id, 'Answer', actor);
    await lifecycle.close(reviewId, 'closed', actor);

    const deleted = await lifecycle.deleteComment(reviewId, comment.id, actor);

    expect(deleted).toMatchObject({ deletedBy: actor });
    expect(deleted.deletedAt).toBe(new Date(deleted.deletedAt!).toISOString());
    expect(deleted.replies).toHaveLength(1);
    const [summary] = await lifecycle.list();
    expect(summary).toMatchObject({ commentCount: 0, openCommentCount: 0 });
    await expectError(lifecycle.reply(reviewId, comment.id, 'Too late', actor), 'closed');
  });
});
