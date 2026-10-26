import { describe, expect, it } from 'vitest';
import {
  clearDraft,
  draftStorageKey,
  readDraft,
  writeDraft,
  type DraftStorage,
} from '../src/review/drafts.js';

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const draft = {
  path: 'src/app.ts',
  side: 'new' as const,
  lineStart: 2,
  lineEnd: 3,
  body: 'This should be configurable.',
  suggestionEnabled: false,
  original: '',
  replacement: '',
  updatedAt: 1_000,
};

describe('local comment drafts', () => {
  it('round-trips a draft per review without touching other reviews', () => {
    const storage = memoryStorage();
    expect(writeDraft('rev_a', draft, storage, 1_000)).toBe(true);
    expect(writeDraft('rev_b', { ...draft, body: 'other' }, storage, 1_000)).toBe(true);
    expect(readDraft('rev_a', storage, 1_000)).toEqual({ ...draft, version: 1 });
    expect(readDraft('rev_b', storage, 1_000)?.body).toBe('other');
  });

  it('discards expired and malformed entries', () => {
    const storage = memoryStorage();
    writeDraft('rev_expired', draft, storage, 1_000);
    expect(readDraft('rev_expired', storage, 1_000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(storage.map.has(draftStorageKey('rev_expired'))).toBe(false);

    storage.setItem(draftStorageKey('rev_bad'), '{not json');
    expect(readDraft('rev_bad', storage, 1_000)).toBeNull();
    expect(storage.map.has(draftStorageKey('rev_bad'))).toBe(false);
  });

  it('rejects impossible ranges and oversized bodies before writing', () => {
    const storage = memoryStorage();
    expect(writeDraft('rev', { ...draft, lineStart: 4, lineEnd: 3 }, storage, 1_000)).toBe(false);
    expect(writeDraft('rev', { ...draft, body: 'x'.repeat(32_001) }, storage, 1_000)).toBe(false);
    expect(readDraft('rev', storage, 1_000)).toBeNull();
  });

  it('clears a draft and tolerates storage failures', () => {
    const storage = memoryStorage();
    writeDraft('rev', draft, storage, 1_000);
    clearDraft('rev', storage);
    expect(readDraft('rev', storage, 1_000)).toBeNull();

    const failing: DraftStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(readDraft('rev', failing, 1_000)).toBeNull();
    expect(writeDraft('rev', draft, failing, 1_000)).toBe(false);
    expect(() => clearDraft('rev', failing)).not.toThrow();
  });
});
