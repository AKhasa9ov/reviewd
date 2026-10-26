import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewLifecycle, ReviewStore } from '../../src/index.js';
import type { Actor, FileDiff, Snapshot } from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const reviewer: Actor = { name: 'Reviewer', kind: 'agent' };
const roots: string[] = [];
const stores: ReviewStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(): Promise<{ root: string; store: ReviewStore }> {
  const root = await mkdtemp(join(tmpdir(), 'cr-integration-'));
  roots.push(root);
  const store = await ReviewStore.open(root);
  stores.push(store);
  return { root, store };
}

function fileDiff(path: string, newLines: string[], extra: Partial<FileDiff> = {}): FileDiff {
  return {
    path,
    status: 'modified',
    binary: false,
    oversized: false,
    added: 0,
    deleted: 0,
    hunks: [],
    newLines,
    contentHash: null,
    ...extra,
  };
}

function snapshot(files: FileDiff[], baseSha: string, headSha: string): Snapshot {
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
    files,
    totals: { files: files.length, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

async function coreSources(): Promise<string[]> {
  const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const parent = entry.parentPath ?? entry.path;
    files.push(join(parent, entry.name));
  }
  return files;
}

describe('ReviewLifecycle integration', () => {
  it('refreshes renamed and shifted comments, records a suggestion outcome, and replays the log', async () => {
    const { root, store } = await openStore();
    const lifecycle = new ReviewLifecycle(store);
    const review = await lifecycle.create({
      title: 'Integration refresh',
      repoRoot: '/tmp/repo',
      actor,
    });

    const first = await lifecycle.addRound(
      review.id,
      snapshot(
        [
          fileDiff('src/a.ts', ['one', 'two', 'three', 'four', 'five']),
          fileDiff('src/suggest.ts', ['header', 'const x = 1;', 'footer']),
        ],
        'a'.repeat(40),
        'b'.repeat(40),
      ),
      reviewer,
    );

    const shifted = await lifecycle.addComment(
      review.id,
      { body: 'Keep this line', path: 'src/a.ts', side: 'new', lineStart: 3 },
      actor,
    );
    const suggestion = await lifecycle.addComment(
      review.id,
      {
        body: 'Use two',
        path: 'src/suggest.ts',
        side: 'new',
        lineStart: 2,
        suggestion: { original: 'const x = 1;', replacement: 'const x = 2;' },
      },
      actor,
    );
    await lifecycle.reply(review.id, shifted.id, 'Noted, will adjust.', reviewer);
    await expect(lifecycle.reply(review.id, shifted.id, '   ', actor)).rejects.toMatchObject({
      name: 'ReviewLifecycleError',
      code: 'invalid-input',
    });

    const firstSnapshotPath = join(root, first.path);
    const firstBytes = await readFile(firstSnapshotPath, 'utf8');

    const result = await lifecycle.refresh(
      review.id,
      snapshot(
        [
          fileDiff('src/renamed.ts', ['zero', 'one', 'two', 'three', 'four', 'five'], {
            status: 'renamed',
            oldPath: 'src/a.ts',
          }),
          fileDiff('src/suggest.ts', ['header', '// inserted', 'const x = 2;', 'footer']),
        ],
        'c'.repeat(40),
        'd'.repeat(40),
      ),
      reviewer,
    );

    expect(result.round.no).toBe(2);
    expect(result.comments.map((comment) => comment.id)).toEqual([shifted.id, suggestion.id]);

    const renamed = result.comments[0];
    expect(renamed?.body).toBe('Keep this line');
    expect(renamed?.replies).toHaveLength(1);
    expect(renamed?.replies[0]?.body).toBe('Noted, will adjust.');
    expect(renamed?.anchors).toHaveLength(2);
    expect(renamed?.anchors[1]).toMatchObject({
      round: 2,
      path: 'src/renamed.ts',
      lineStart: 4,
      lineEnd: 4,
      quote: 'three',
      state: 'active',
      previous: { round: 1, path: 'src/a.ts', lineStart: 3, lineEnd: 3 },
    });
    expect(renamed?.outcomes).toEqual([{ round: 2, status: 'moved', confidence: 'high' }]);

    const applied = result.comments[1];
    expect(applied?.body).toBe('Use two');
    expect(applied?.suggestion).toEqual({
      original: 'const x = 1;',
      replacement: 'const x = 2;',
    });
    expect(applied?.anchors).toHaveLength(2);
    expect(applied?.anchors[1]).toMatchObject({
      round: 2,
      path: 'src/suggest.ts',
      lineStart: 3,
      lineEnd: 3,
      quote: 'const x = 2;',
      state: 'active',
      previous: { round: 1, path: 'src/suggest.ts', lineStart: 2, lineEnd: 2 },
    });
    expect(applied?.outcomes).toEqual([{ round: 2, status: 'applied', confidence: 'high' }]);

    const loaded = await lifecycle.get(review.id);
    expect(loaded.comments).toEqual(result.comments);
    expect(loaded.rounds.map((round) => round.no)).toEqual([1, 2]);

    // Replaying events must reproduce the cache exactly. Remove the cache and
    // reopen the store so the second read is forced through events.jsonl.
    expect(await readFile(firstSnapshotPath, 'utf8')).toBe(firstBytes);
    await rm(join(root, 'reviews', review.id, 'snapshot.json'), { force: true });
    await store.close();
    const reopened = await ReviewStore.open(root);
    stores.push(reopened);
    const replayed = await new ReviewLifecycle(reopened).get(review.id);
    expect(replayed).toEqual(loaded);
  });

  it('keeps core free of transport, UI and DSH imports', async () => {
    const forbidden = /from\s+['"](?:node:http|node:https|react|@deepseek-ai\/|cordis)/;
    for (const file of await coreSources()) {
      expect(await readFile(file, 'utf8'), file).not.toMatch(forbidden);
    }
  });
});
