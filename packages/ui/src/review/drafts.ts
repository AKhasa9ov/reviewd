import type { Side } from '@dsh-code-review/core';

const PREFIX = 'dsh-code-review:comment-draft:';
const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 32_000;
const MAX_SNIPPET = 100_000;

/** A comment the reviewer typed but has not posted yet. */
export interface StoredCommentDraft {
  version: 1;
  path: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
  body: string;
  suggestionEnabled: boolean;
  original: string;
  replacement: string;
  updatedAt: number;
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storageOrUndefined(): DraftStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function draftStorageKey(reviewId: string): string {
  return `${PREFIX}${reviewId}`;
}

function isLine(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000;
}

function isStoredDraft(value: unknown): value is StoredCommentDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<StoredCommentDraft>;
  return (
    draft.version === VERSION &&
    typeof draft.path === 'string' &&
    draft.path.length > 0 &&
    draft.path.length <= 4096 &&
    (draft.side === 'new' || draft.side === 'old') &&
    isLine(draft.lineStart) &&
    isLine(draft.lineEnd) &&
    draft.lineStart <= draft.lineEnd &&
    typeof draft.body === 'string' &&
    draft.body.length <= MAX_BODY &&
    typeof draft.suggestionEnabled === 'boolean' &&
    typeof draft.original === 'string' &&
    draft.original.length <= MAX_SNIPPET &&
    typeof draft.replacement === 'string' &&
    draft.replacement.length <= MAX_SNIPPET &&
    typeof draft.updatedAt === 'number' &&
    Number.isFinite(draft.updatedAt)
  );
}

/** Read one review's local draft; malformed or expired entries are discarded. */
export function readDraft(
  reviewId: string,
  storage: DraftStorage | undefined = storageOrUndefined(),
  now: number = Date.now(),
): StoredCommentDraft | null {
  if (storage === undefined) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(draftStorageKey(reviewId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDraft(reviewId, storage);
    return null;
  }
  if (!isStoredDraft(parsed) || now - parsed.updatedAt > MAX_AGE_MS) {
    clearDraft(reviewId, storage);
    return null;
  }
  return parsed;
}

/** Persist a draft, replacing any older draft for the same review. */
export function writeDraft(
  reviewId: string,
  draft: Omit<StoredCommentDraft, 'version' | 'updatedAt'> & { updatedAt?: number },
  storage: DraftStorage | undefined = storageOrUndefined(),
  now: number = Date.now(),
): boolean {
  if (storage === undefined) return false;
  const record: StoredCommentDraft = {
    ...draft,
    version: VERSION,
    updatedAt: draft.updatedAt ?? now,
  };
  if (!isStoredDraft(record)) return false;
  try {
    storage.setItem(draftStorageKey(reviewId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(
  reviewId: string,
  storage: DraftStorage | undefined = storageOrUndefined(),
): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(draftStorageKey(reviewId));
  } catch {
    // Private-mode or quota failures must never break the review surface.
  }
}
