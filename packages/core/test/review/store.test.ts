import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coverageFromPrompt,
  fold,
  ReviewStore,
  ReviewStoreCorruptionError,
  ReviewStoreLockedError,
  ReviewNotFoundError,
} from '../../src/index.js';
import type {
  Actor,
  Anchor,
  Comment,
  ReviewEvent,
  ReviewId,
  ReviewState,
  Round,
  Snapshot,
} from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const at = '2026-10-26T12:00:00.000Z';
const reviewId = 'rev_01K8Z000000000000000000000';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cr-store-'));
  roots.push(root);
  return root;
}

function baseReview(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    id: reviewId,
    title: 'Review state',
    repoRoot: '/tmp/repo',
    status: 'open',
    createdAt: at,
    rounds: [],
    comments: [],
    version: 0,
    ...overrides,
  };
}

function round(no = 1): Round {
  return {
    no,
    snapshotId: `snap_${no}`,
    createdAt: at,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    path: 'snapshots/one.json',
  };
}

function snapshotFixture(): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseRef: 'main',
      headRef: 'HEAD',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'main..HEAD',
      worktreeDigest: 'c'.repeat(40),
    },
    files: [],
    totals: { files: 0, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

function comment(id = 'cmt_1'): Comment {
  return {
    id,
    reviewId,
    createdAt: at,
    author: actor,
    body: 'Please fix this.',
    state: 'open',
    replies: [],
    anchors: [],
    outcomes: [],
  };
}

function anchor(roundNo = 1): Anchor {
  return {
    id: `anc_${roundNo}`,
    round: roundNo,
    path: 'src/index.ts',
    side: 'new',
    lineStart: 4,
    lineEnd: 4,
    quote: 'const x = 1;',
    contextBefore: ['const a = 0;'],
    contextAfter: ['export { x };'],
    hunkHeader: '@@ -1,3 +1,3 @@',
    contentHash: 'hash',
    state: 'active',
  };
}

function event<T extends ReviewEvent['type']>(
  type: T,
  data: Extract<ReviewEvent, { type: T }>['data'],
  id = `evt_${type.replace(/\W/g, '_')}`,
): ReviewEvent {
  return {
    v: 1,
    id,
    reviewId,
    type,
    at,
    actor,
    data,
  } as ReviewEvent;
}

function created(review = baseReview()): ReviewEvent {
  return { ...event('review/created', { review }, 'evt_created'), reviewId: review.id };
}

function allEvents(): ReviewEvent[] {
  return [
    created(),
    event('round/created', { round: round() }, 'evt_round'),
    event('comment/added', { comment: comment() }, 'evt_comment'),
    event(
      'comment/replied',
      { commentId: 'cmt_1', reply: { id: 'rep_1', author: actor, body: 'Done.', createdAt: at } },
      'evt_reply',
    ),
    event('comment/state', { commentId: 'cmt_1', state: 'resolved' }, 'evt_state'),
    event(
      'comment/anchor',
      { commentId: 'cmt_1', anchor: { ...anchor(), lineStart: 5, lineEnd: 5 } },
      'evt_anchor',
    ),
    event('suggestion/applied', { commentId: 'cmt_1', round: 1 }, 'evt_applied'),
    event('review/closed', { verdict: 'approved' }, 'evt_closed'),
  ];
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

describe('ReviewStore', () => {
  it('round-trips a review through JSONL and the cache', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root, { now: () => new Date(at) });
    await store.append(reviewId, created());
    await store.append(reviewId, event('round/created', { round: round() }, 'evt_round'));

    const state = await store.load(reviewId);
    expect(state.title).toBe('Review state');
    expect(state.version).toBe(2);
    expect(state.rounds).toHaveLength(1);
    expect(state.warnings).toEqual([]);
    await store.close();

    const cache = await readJson(join(root, 'reviews', reviewId, 'snapshot.json'));
    expect(cache['eventCount']).toBe(2);
    expect((cache['state'] as ReviewState).version).toBe(2);
    expect((cache['state'] as ReviewState).rounds).toHaveLength(1);
  });

  it('increments version for every event and folds all event types', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    for (const item of allEvents()) await store.append(reviewId, item);

    const state = await store.load(reviewId);
    expect(state.version).toBe(8);
    expect(state.rounds).toHaveLength(1);
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]?.replies).toHaveLength(1);
    expect(state.comments[0]?.state).toBe('resolved');
    expect(state.comments[0]?.anchors).toHaveLength(1);
    expect(state.comments[0]?.outcomes).toEqual([
      { round: 1, status: 'applied', confidence: 'high' },
    ]);
    expect(state.status).toBe('closed');
    await store.close();
  });

  it('loads a fresh replay cache without replaying the event log', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.append(reviewId, event('round/created', { round: round() }, 'evt_round'));
    await store.close();

    const reopened = await ReviewStore.open(root);
    const internal = reopened as unknown as {
      readEntry: (id: ReviewId) => Promise<unknown>;
    };
    const replay = vi.spyOn(internal, 'readEntry');
    const state = await reopened.load(reviewId);

    expect(state.title).toBe('Review state');
    expect(state.rounds).toHaveLength(1);
    expect(replay).not.toHaveBeenCalled();
    await reopened.close();
  });

  it('reads an event tail without replaying review state', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.append(reviewId, event('round/created', { round: round() }, 'evt_round'));
    await store.append(
      reviewId,
      event('comment/added', { comment: comment('cmt_tail') }, 'evt_comment'),
    );

    const internal = store as unknown as {
      readEntry: (id: ReviewId) => Promise<unknown>;
    };
    const replay = vi.spyOn(internal, 'readEntry');
    const tail = await store.events(reviewId, 1);

    expect(tail.map((item) => item.seq)).toEqual([2, 3]);
    expect(tail.map((item) => item.type)).toEqual(['round/created', 'comment/added']);
    expect(replay).not.toHaveBeenCalled();
    await store.close();
  });

  it('reloads the same state when the cache is deleted', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    for (const item of allEvents()) await store.append(reviewId, item);
    const cached = await store.load(reviewId);

    await rm(join(root, 'reviews', reviewId, 'snapshot.json'));
    const replayed = await store.load(reviewId);
    expect(replayed).toEqual(cached);
    await store.close();
  });

  it('rejects an event that cannot fold before it writes the line', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.append(reviewId, event('round/created', { round: round() }, 'evt_round'));

    await expect(
      store.append(reviewId, event('round/created', { round: round() }, 'evt_duplicate')),
    ).rejects.toThrow(/duplicate round/i);
    const state = await store.load(reviewId);
    expect(state.version).toBe(2);
    expect(state.rounds).toHaveLength(1);
    const lines = (await readFile(join(root, 'reviews', reviewId, 'events.jsonl'), 'utf8'))
      .trimEnd()
      .split('\n');
    expect(lines).toHaveLength(2);
    await store.close();
  });

  it('ignores a cache whose version/event count do not match the log', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await writeFile(
      join(root, 'reviews', reviewId, 'snapshot.json'),
      JSON.stringify({ reviewId, eventCount: 99, state: baseReview({ title: 'stale' }) }),
    );

    const state = await store.load(reviewId);
    expect(state.title).toBe('Review state');
    const cache = await readJson(join(root, 'reviews', reviewId, 'snapshot.json'));
    expect(cache['eventCount']).toBe(1);
    expect((cache['state'] as ReviewState).title).toBe('Review state');
    await store.close();
  });

  it('recovers a torn tail with a warning and repairs it before appending', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await writeFile(join(root, 'reviews', reviewId, 'events.jsonl'), '', { flag: 'a' });
    await writeFile(join(root, 'reviews', reviewId, 'events.jsonl'), '{"v":1,"id":"evt_torn"', {
      flag: 'a',
    });

    const torn = await store.load(reviewId);
    expect(torn.version).toBe(1);
    expect(torn.warnings).toEqual(['torn-tail']);

    await store.append(reviewId, event('round/created', { round: round() }, 'evt_round'));
    const repaired = await store.load(reviewId);
    expect(repaired.version).toBe(2);
    expect(repaired.rounds).toHaveLength(1);
    expect(repaired.warnings).toEqual([]);
    await store.close();
  });

  it('reports a corrupt middle line with its 1-based line number', async () => {
    const root = await tempRoot();
    const lines = [
      JSON.stringify(created()),
      '{"not":"an event"}',
      JSON.stringify(event('round/created', { round: round() }, 'evt_round')),
    ];
    await mkdir(join(root, 'reviews', reviewId), { recursive: true });
    await writeFile(join(root, 'reviews', reviewId, 'events.jsonl'), `${lines.join('\n')}\n`, {
      flag: 'w',
    });
    const store = await ReviewStore.open(root);

    await expect(store.load(reviewId)).rejects.toMatchObject({
      name: 'ReviewStoreCorruptionError',
      line: 2,
      reviewId,
    });
    await expect(store.load(reviewId)).rejects.toBeInstanceOf(ReviewStoreCorruptionError);
    await store.close();
  });

  it('rejects a complete but semantically invalid final line as corruption', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'reviews', reviewId), { recursive: true });
    const lines = [JSON.stringify(created()), '{"v":1,"id":"evt_bad"}'];
    await writeFile(join(root, 'reviews', reviewId, 'events.jsonl'), `${lines.join('\n')}\n`);
    const store = await ReviewStore.open(root);

    await expect(store.load(reviewId)).rejects.toMatchObject({
      name: 'ReviewStoreCorruptionError',
      line: 2,
    });
    await store.close();
  });

  it('rejects a second writer while the lock is held', async () => {
    const root = await tempRoot();
    const first = await ReviewStore.open(root);
    await expect(ReviewStore.open(root)).rejects.toMatchObject({
      name: 'ReviewStoreLockedError',
      pid: process.pid,
      stale: false,
    });
    await first.close();
    const third = await ReviewStore.open(root);
    await third.close();
  });

  it('rejects a stale lock with a clear message and does not delete it', async () => {
    const root = await tempRoot();
    const deadPid = 999_999_999;
    await writeFile(join(root, 'lock'), JSON.stringify({ pid: deadPid, createdAt: at }), {
      flag: 'w',
    });

    const error = await ReviewStore.open(root).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ReviewStoreLockedError);
    expect((error as ReviewStoreLockedError).stale).toBe(true);
    expect((error as Error).message).toMatch(/stale lock/);
    await expect(readFile(join(root, 'lock'), 'utf8')).resolves.toContain(String(deadPid));
  });

  it('releases only its own lock on close', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    const lockPath = join(root, 'lock');
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, createdAt: 'other' }));

    await store.close();
    await expect(readFile(lockPath, 'utf8')).resolves.toContain('other');
    await rm(lockPath);
  });

  it('throws a typed error for an unknown review', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await expect(store.load('rev_missing')).rejects.toBeInstanceOf(ReviewNotFoundError);
    await store.close();
  });

  it('lists cached reviews sorted by createdAt then id', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(
      reviewId,
      created(baseReview({ id: reviewId, title: 'Later', createdAt: '2026-10-26T12:01:00.000Z' })),
    );
    await store.append(
      'rev_1',
      created(baseReview({ id: 'rev_1', title: 'Earlier', createdAt: at })),
    );
    await store.append('rev_2', created(baseReview({ id: 'rev_2', title: 'Same', createdAt: at })));

    const summaries = await store.list();
    expect(summaries.map((item) => item.title)).toEqual(['Earlier', 'Same', 'Later']);
    expect(summaries[0]).toMatchObject({ id: 'rev_1', openCommentCount: 0, roundCount: 0 });
    await store.close();
  });

  it('does not leave temporary files after writing the cache', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.load(reviewId);
    const files = await readdir(join(root, 'reviews', reviewId));
    expect(files.sort()).toEqual(['events.jsonl', 'snapshot.json']);
    await store.close();
  });

  it('serializes concurrent appends so every event gets a unique sequence', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.append(reviewId, event('round/created', { round: round() }, 'evt_round'));

    const comments = Array.from({ length: 20 }, (_item, index) => `cmt_${index}`);
    await Promise.all(
      comments.map(async (commentId, index) =>
        store.append(
          reviewId,
          event(
            'comment/added',
            { comment: comment(commentId) },
            `evt_comment_${index.toString().padStart(2, '0')}`,
          ),
        ),
      ),
    );
    await store.close();

    const reopened = await ReviewStore.open(root);
    const state = await reopened.load(reviewId);
    const events = await reopened.events(reviewId, 0);
    expect(state.comments.map((item) => item.id).sort()).toEqual(comments.sort());
    expect(events).toHaveLength(22);
    expect(events.map((item) => item.seq)).toEqual(Array.from({ length: 22 }, (_v, i) => i + 1));
    await reopened.close();
  });

  it('checks the conditional predicate inside the append critical section', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());

    const [first, second] = await Promise.all([
      store.appendIf(
        reviewId,
        event('round/created', { round: round() }, 'evt_round_a'),
        (state) => state.rounds.length === 0,
      ),
      store.appendIf(
        reviewId,
        event('round/created', { round: round() }, 'evt_round_b'),
        (state) => state.rounds.length === 0,
      ),
    ]);

    expect([first, second].filter((value) => value !== null)).toHaveLength(1);
    expect((await store.load(reviewId)).rounds).toHaveLength(1);
    await store.close();
  });

  it('keeps an append committed when the cache cannot be written', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.close();

    const cachePath = join(root, 'reviews', reviewId, 'snapshot.json');
    await rm(cachePath);
    await mkdir(cachePath);

    const reopened = await ReviewStore.open(root);
    const appended = await reopened.append(
      reviewId,
      event('comment/added', { comment: comment('cmt_cache') }, 'evt_cache'),
    );
    expect(appended.seq).toBe(2);
    const state = await reopened.load(reviewId);
    expect(state.comments.map((item) => item.id)).toEqual(['cmt_cache']);
    await reopened.close();
  });

  it('lists a review whose cache is missing by rebuilding it from the event log', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created());
    await store.close();
    await rm(join(root, 'reviews', reviewId, 'snapshot.json'));

    const reopened = await ReviewStore.open(root);
    const summaries = await reopened.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: reviewId, title: 'Review state' });
    const cache = await readJson(join(root, 'reviews', reviewId, 'snapshot.json'));
    expect(cache['eventCount']).toBe(1);
    await reopened.close();
  });

  it('keeps a recently closed review even when it was created long ago', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.append(reviewId, created(baseReview({ createdAt: '2026-01-01T00:00:00.000Z' })));
    await store.append(reviewId, {
      ...event('review/closed', { verdict: 'approved' }, 'evt_closed_recent'),
      at: '2026-10-20T00:00:00.000Z',
    });

    const result = await store.gc(30, new Date('2026-10-26T00:00:00.000Z'));
    expect(result.removedReviews).toEqual([]);
    const state = await store.load(reviewId);
    expect(state.status).toBe('closed');
    expect(state.closedAt).toBe('2026-10-20T00:00:00.000Z');
    await store.close();
  });

  it('keeps snapshots referenced by a review whose cache is missing', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', snapshotFixture());
    await store.writeSnapshot('snap_orphan', snapshotFixture());
    await store.append(reviewId, created(baseReview({ rounds: [round()] })));
    await rm(join(root, 'reviews', reviewId, 'snapshot.json'));

    const result = await store.gc(90, new Date(at));
    expect(result.removedReviews).toEqual([]);
    expect(result.removedSnapshots).toBe(1);
    await expect(store.readSnapshot('snap_1')).resolves.toMatchObject({ schemaVersion: 1 });
    await expect(store.readSnapshot('snap_orphan')).rejects.toBeInstanceOf(ReviewNotFoundError);
    await store.close();
  });

  it('refuses to overwrite an existing snapshot id', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', snapshotFixture());

    await expect(store.writeSnapshot('snap_1', snapshotFixture())).rejects.toMatchObject({
      code: 'EEXIST',
    });
    await expect(store.readSnapshot('snap_1')).resolves.toMatchObject({ schemaVersion: 1 });
    await store.close();
  });

  it('synthesizes a manifest for a legacy v1 snapshot on read', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', snapshotFixture());

    const snapshot = await store.readSnapshot('snap_1');

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.manifest).toBeDefined();
    expect(snapshot.manifest?.files).toEqual([]);
    expect(snapshot.manifest?.warnings).toEqual([]);
    await store.close();
  });

  it('marks a synthesized v2 manifest incomplete when the manifest is missing', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', { ...snapshotFixture(), schemaVersion: 2 });

    const snapshot = await store.readSnapshot('snap_1');

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.manifest?.warnings).toContain('manifest-missing');
    const coverage = coverageFromPrompt(snapshot.manifest!, []);
    expect(coverage.incomplete).toBe(true);
    await store.close();
  });

  it('carries legacy-truncated into the synthesized manifest of a truncated v1 snapshot', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', {
      ...snapshotFixture(),
      totals: { files: 0, added: 0, deleted: 0, truncated: true },
    });

    const snapshot = await store.readSnapshot('snap_1');

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.manifest?.warnings).toContain('legacy-truncated');
    await store.close();
  });

  it('reads a v1 snapshot whose totals omit truncated as not truncated', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', snapshotFixture());
    const path = join(root, 'snapshots', 'snap_1.json');
    const raw = await readJson(path);
    const totals = raw['totals'] as Record<string, unknown>;
    delete totals['truncated'];
    await writeFile(path, JSON.stringify(raw));

    const snapshot = await store.readSnapshot('snap_1');

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.totals.truncated).toBe(false);
    expect(snapshot.manifest?.warnings).not.toContain('legacy-truncated');
    await store.close();
  });

  it('round-trips a v2 snapshot manifest and keeps legacy v1 distinct', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    const legacy = snapshotFixture();
    const manifest = {
      schemaVersion: 1 as const,
      scope: legacy.scope,
      files: [],
      totals: { files: 0, added: 0, deleted: 0, patchBytes: 0 },
      warnings: [],
    };
    await store.writeSnapshot('snap_1', { ...legacy, schemaVersion: 2, manifest });

    const snapshot = await store.readSnapshot('snap_1');
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.manifest).toEqual(manifest);
    await store.close();
  });

  it('accepts a v2 snapshot without a manifest and synthesizes one on read', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    await store.writeSnapshot('snap_1', { ...snapshotFixture(), schemaVersion: 2 });

    const snapshot = await store.readSnapshot('snap_1');

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.manifest?.files).toEqual([]);
    await store.close();
  });

  it('rejects a v2 snapshot whose totals.truncated is not boolean', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    const invalid = {
      ...snapshotFixture(),
      schemaVersion: 2,
      totals: { files: 0, added: 0, deleted: 0 },
    } as unknown as Snapshot;

    await expect(store.writeSnapshot('snap_1', invalid)).rejects.toBeInstanceOf(
      ReviewNotFoundError,
    );
    await store.close();
  });

  it('rejects a malformed manifest on a v2 snapshot', async () => {
    const root = await tempRoot();
    const store = await ReviewStore.open(root);
    const invalid = {
      ...snapshotFixture(),
      schemaVersion: 2,
      manifest: { schemaVersion: 1, files: 'nope' },
    } as unknown as Snapshot;

    await expect(store.writeSnapshot('snap_1', invalid)).rejects.toBeInstanceOf(
      ReviewNotFoundError,
    );
    await store.close();
  });
});

describe('fold', () => {
  it('is pure and rejects duplicate rounds and comments', () => {
    const initial = fold(baseReview(), created());
    expect(initial.version).toBe(1);
    const withRound = fold(initial, event('round/created', { round: round() }, 'evt_round'));
    expect(withRound.rounds).toHaveLength(1);

    expect(() => fold(withRound, event('round/created', { round: round() }, 'evt_round2'))).toThrow(
      /duplicate round/i,
    );
    const withComment = fold(
      withRound,
      event('comment/added', { comment: comment() }, 'evt_comment'),
    );
    expect(() =>
      fold(withComment, event('comment/added', { comment: comment() }, 'evt_comment2')),
    ).toThrow(/duplicate comment/i);
    expect(initial.rounds).toHaveLength(0);
    expect(withRound.comments).toHaveLength(0);
  });

  it('folds review metadata edits and preserves the immutable fields', () => {
    let state = fold(baseReview(), created());
    state = fold(
      state,
      event(
        'review/updated',
        { title: 'Corrected title', reviewer: { backend: 'worker' } },
        'evt_updated',
      ),
    );

    expect(state.title).toBe('Corrected title');
    expect(state.reviewer).toEqual({ backend: 'worker' });
    expect(state.repoRoot).toBe('/tmp/repo');
    expect(state.updatedAt).toBe(at);
    expect(state.updatedBy).toEqual(actor);
    expect(state.version).toBe(2);
  });

  it('folds review soft deletion', () => {
    let state = fold(baseReview(), created());
    state = fold(state, event('review/deleted', { reason: 'duplicate' }, 'evt_deleted'));

    expect(state.deletedAt).toBe(at);
    expect(state.deletedBy).toEqual(actor);
    expect(state.status).toBe('open');
  });

  it('folds comment edits and soft deletion', () => {
    let state = fold(baseReview(), created());
    state = fold(state, event('comment/added', { comment: comment() }, 'evt_comment'));
    state = fold(
      state,
      event('comment/edited', { commentId: 'cmt_1', body: 'Corrected body.' }, 'evt_edit'),
    );

    expect(state.comments[0]).toMatchObject({
      body: 'Corrected body.',
      editedAt: at,
      editedBy: actor,
    });

    state = fold(state, event('comment/deleted', { commentId: 'cmt_1' }, 'evt_delete'));
    expect(state.comments[0]).toMatchObject({ deletedAt: at, deletedBy: actor });
    expect(state.comments[0]?.body).toBe('Corrected body.');
  });

  it('rejects edits of unknown comments', () => {
    const state = fold(baseReview(), created());
    expect(() =>
      fold(state, event('comment/edited', { commentId: 'cmt_missing', body: 'x' }, 'evt_edit')),
    ).toThrow(/unknown comment/i);
  });

  it('rejects a created event whose payload belongs to another review', () => {
    const mismatched = {
      ...created(),
      data: { review: baseReview({ id: 'rev_other' }) },
    } as ReviewEvent;
    expect(() => fold(baseReview(), mismatched)).toThrow(/belongs to/i);
  });

  it('replaces an anchor for the same round and does not duplicate an applied outcome', () => {
    let state = fold(baseReview(), created());
    state = fold(state, event('round/created', { round: round() }, 'evt_round'));
    state = fold(state, event('comment/added', { comment: comment() }, 'evt_comment'));
    state = fold(
      state,
      event('comment/anchor', { commentId: 'cmt_1', anchor: anchor() }, 'evt_anchor1'),
    );
    state = fold(
      state,
      event(
        'comment/anchor',
        { commentId: 'cmt_1', anchor: { ...anchor(), lineStart: 9, lineEnd: 9 } },
        'evt_anchor2',
      ),
    );
    expect(state.comments[0]?.anchors).toHaveLength(1);
    expect(state.comments[0]?.anchors[0]?.lineStart).toBe(9);

    state = fold(
      state,
      event('suggestion/applied', { commentId: 'cmt_1', round: 1 }, 'evt_apply1'),
    );
    state = fold(
      state,
      event('suggestion/applied', { commentId: 'cmt_1', round: 1 }, 'evt_apply2'),
    );
    expect(state.comments[0]?.outcomes).toEqual([
      { round: 1, status: 'applied', confidence: 'high' },
    ]);
  });
});
