import { randomBytes } from 'node:crypto';
import { open, readdir, readFile, mkdir, rename, rm, truncate, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isReviewEvent, ReviewEventError } from './events.js';
import type { ReviewEvent } from './events.js';
import { fold } from './fold.js';
import type { Snapshot } from '../types.js';
import type { Comment, ReviewId, ReviewState, ReviewStatus, ReviewSummary } from './types.js';

export interface ReviewStoreOptions {
  now?: () => Date;
  newId?: (prefix: string) => string;
}

interface CacheEntry {
  state: ReviewState;
  eventCount: number;
  events?: ReviewEvent[];
}

interface SnapshotCache {
  reviewId: ReviewId;
  eventCount: number;
  state: ReviewState;
}

interface LockFile {
  pid: number;
  createdAt: string;
}

export class ReviewStoreLockedError extends Error {
  readonly pid?: number;
  readonly stale: boolean;
  readonly lockPath: string;

  constructor(message: string, options: { pid?: number; stale: boolean; lockPath: string }) {
    super(message);
    this.name = 'ReviewStoreLockedError';
    this.pid = options.pid;
    this.stale = options.stale;
    this.lockPath = options.lockPath;
  }
}

export class ReviewStoreCorruptionError extends Error {
  readonly reviewId: ReviewId;
  readonly line: number;

  constructor(message: string, reviewId: ReviewId, line: number) {
    super(message);
    this.name = 'ReviewStoreCorruptionError';
    this.reviewId = reviewId;
    this.line = line;
  }
}

export class ReviewNotFoundError extends Error {
  readonly reviewId: ReviewId;

  constructor(reviewId: ReviewId) {
    super(`review not found: ${reviewId}`);
    this.name = 'ReviewNotFoundError';
    this.reviewId = reviewId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

const REVIEW_STATUSES = new Set<ReviewStatus>(['open', 'closed']);

function isComment(value: unknown): value is Comment {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.reviewId === 'string' &&
    isTimestamp(value.createdAt) &&
    typeof value.body === 'string' &&
    (value.state === 'open' || value.state === 'resolved' || value.state === 'dismissed') &&
    Array.isArray(value.replies) &&
    Array.isArray(value.anchors) &&
    Array.isArray(value.outcomes)
  );
}

function isReviewState(value: unknown): value is ReviewState {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.repoRoot === 'string' &&
    typeof value.status === 'string' &&
    REVIEW_STATUSES.has(value.status as ReviewStatus) &&
    isTimestamp(value.createdAt) &&
    Array.isArray(value.rounds) &&
    Array.isArray(value.comments) &&
    value.comments.every(isComment) &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version >= 0 &&
    (value.warnings === undefined ||
      (Array.isArray(value.warnings) && value.warnings.every((item) => typeof item === 'string')))
  );
}

function safeReviewId(reviewId: ReviewId): string {
  if (
    typeof reviewId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(reviewId) ||
    reviewId.length > 200
  ) {
    throw new ReviewNotFoundError(reviewId);
  }
  return reviewId;
}

function safeSnapshotId(snapshotId: string): string {
  if (typeof snapshotId !== 'string' || !/^snap_[A-Za-z0-9]+$/.test(snapshotId)) {
    throw new ReviewNotFoundError(snapshotId);
  }
  return snapshotId;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!isRecord(value.scope) || typeof value.scope.baseSha !== 'string') return false;
  if (!Array.isArray(value.files)) return false;
  if (!isRecord(value.totals) || !Array.isArray(value.warnings)) return false;
  return value.files.every(
    (file) => isRecord(file) && typeof file.path === 'string' && Array.isArray(file.hunks),
  );
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function parseLock(raw: string): Partial<LockFile> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {};
    return {
      ...(typeof value.pid === 'number' ? { pid: value.pid } : {}),
      ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    };
  } catch {
    return {};
  }
}

async function readLock(lockPath: string): Promise<Partial<LockFile> | null> {
  try {
    const raw = await readFile(lockPath, 'utf8');
    return parseLock(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return {};
  }
}

function corrupt(reviewId: ReviewId, line: number, detail: string): ReviewStoreCorruptionError {
  return new ReviewStoreCorruptionError(
    `review ${reviewId} is corrupt at line ${line}: ${detail}`,
    reviewId,
    line,
  );
}

function splitEventLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  return lines;
}

function parseReview(
  content: string,
  reviewId: ReviewId,
): { state: ReviewState; eventCount: number; events: ReviewEvent[] } {
  const hasTrailingNewline = content.endsWith('\n');
  const lines = splitEventLines(content);
  if (lines.length === 0) throw new ReviewNotFoundError(reviewId);

  let state: ReviewState | undefined;
  let eventCount = 0;
  let torn = false;
  const events: ReviewEvent[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const lineNo = index + 1;
    const isLast = index === lines.length - 1;

    if (line.trim() === '') {
      if (isLast) {
        torn = true;
        continue;
      }
      throw corrupt(reviewId, lineNo, 'empty line');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (isLast) {
        torn = true;
        continue;
      }
      throw corrupt(reviewId, lineNo, 'invalid JSON');
    }

    if (!isReviewEvent(parsed) || parsed.reviewId !== reviewId) {
      // A missing newline always means the write was torn. A newline means the
      // line is complete, so invalid event fields are real corruption.
      if (isLast && !hasTrailingNewline) {
        torn = true;
        continue;
      }
      throw corrupt(reviewId, lineNo, 'invalid review event');
    }

    parsed.seq ??= lineNo;
    events.push(structuredClone(parsed));

    try {
      if (state === undefined) {
        if (parsed.type !== 'review/created') {
          throw new Error('first event must be review/created');
        }
        state = fold(parsed.data.review, parsed);
      } else {
        state = fold(state, parsed);
      }
    } catch (error) {
      throw corrupt(reviewId, lineNo, (error as Error).message);
    }
    eventCount += 1;
  }

  if (state === undefined) throw new ReviewNotFoundError(reviewId);
  if (torn) state.warnings = [...(state.warnings ?? []), 'torn-tail'];
  return { state, eventCount, events };
}

function shortSha(sha: string | null): string {
  return sha === null ? 'worktree' : sha.slice(0, 8);
}

function summary(state: ReviewState): ReviewSummary {
  const latest = state.rounds.at(-1);
  const latestClaims = new Map<string, string>();
  for (const claim of state.fixClaims ?? []) latestClaims.set(claim.commentId, claim.status);
  return {
    id: state.id,
    title: state.title,
    status: state.status,
    createdAt: state.createdAt,
    roundCount: state.rounds.length,
    commentCount: state.comments.length,
    openCommentCount: state.comments.filter((comment) => comment.state === 'open').length,
    ...(latest === undefined
      ? { scope: 'no rounds' }
      : { scope: `${shortSha(latest.baseSha)} → ${shortSha(latest.headSha)}` }),
    ...(state.createdBy === undefined ? {} : { author: state.createdBy.name }),
    notFixedCount: [...latestClaims.values()].filter((status) => status === 'not-fixed').length,
  };
}

/**
 * One process writes a review store. JSONL is the source of truth; the
 * atomically replaced snapshot.json is only a replay cache.
 */

export interface GcResult {
  removedReviews: ReviewId[];
  removedSnapshots: number;
}

export class ReviewStore {
  readonly root: string;
  readonly lockPath: string;
  private readonly lockCreatedAt: string;
  private readonly entries = new Map<ReviewId, CacheEntry>();
  private closed = false;

  private constructor(root: string, lockCreatedAt: string) {
    this.root = root;
    this.lockPath = join(root, 'lock');
    this.lockCreatedAt = lockCreatedAt;
  }

  static async open(root: string, options: ReviewStoreOptions = {}): Promise<ReviewStore> {
    const absolute = resolve(root);
    await mkdir(absolute, { recursive: true });
    const lockPath = join(absolute, 'lock');
    const createdAt = (options.now ?? (() => new Date()))().toISOString();

    let handle;
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt }));
      await handle.sync();
      await handle.close();
    } catch (error) {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

      const existing = await readLock(lockPath);
      const pid = existing?.pid;
      if (pid !== undefined && isPidAlive(pid)) {
        throw new ReviewStoreLockedError(`review store is locked by pid ${pid}`, {
          pid,
          stale: false,
          lockPath,
        });
      }
      const message =
        pid === undefined
          ? `stale lock: unreadable lock file ${lockPath}; remove it manually`
          : `stale lock: pid ${pid} is not running; remove ${lockPath} manually`;
      throw new ReviewStoreLockedError(message, {
        ...(pid === undefined ? {} : { pid }),
        stale: true,
        lockPath,
      });
    }

    return new ReviewStore(absolute, createdAt);
  }

  async append(reviewId: ReviewId, event: ReviewEvent): Promise<ReviewEvent> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeReviewId(reviewId);
    if (!isReviewEvent(event)) {
      throw new ReviewEventError('invalid-event', 'append requires a valid review event');
    }
    if (event.reviewId !== id) {
      throw new ReviewEventError(
        'invalid-review-id',
        `event belongs to ${event.reviewId}, not ${id}`,
      );
    }

    const dir = this.reviewDir(id);
    await mkdir(dir, { recursive: true });
    const eventsPath = join(dir, 'events.jsonl');
    await this.repairTornTail(eventsPath);

    let entry: CacheEntry | undefined = this.entries.get(id);
    if (entry === undefined) {
      try {
        entry = await this.readEntry(id);
      } catch (error) {
        if (!(error instanceof ReviewNotFoundError)) throw error;
      }
    }
    if (entry === undefined) {
      if (event.type !== 'review/created') throw new ReviewNotFoundError(id);
      entry = { state: event.data.review, eventCount: 0 };
    }

    // Validate against the aggregate before touching the log: a rejected event
    // must not leave a line that makes every later replay fail.
    const state = fold(entry.state, event);
    const sequenced = { ...event, seq: entry.eventCount + 1 } as ReviewEvent;
    const payload = `${JSON.stringify(sequenced)}\n`;
    const handle = await open(eventsPath, 'a');
    try {
      const result = await handle.write(payload);
      if (result.bytesWritten !== Buffer.byteLength(payload)) {
        throw new Error('short event write');
      }
      await handle.sync();
    } finally {
      await handle.close();
    }

    const next = { state, eventCount: entry.eventCount + 1 };
    this.entries.set(id, next);
    await this.writeCache(id, next);
    return structuredClone(sequenced);
  }

  async load(reviewId: ReviewId): Promise<ReviewState> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeReviewId(reviewId);
    const entry = await this.readEntry(id);
    this.entries.set(id, entry);
    return structuredClone(entry.state);
  }

  async events(reviewId: ReviewId, after = 0): Promise<ReviewEvent[]> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeReviewId(reviewId);
    if (!Number.isInteger(after) || after < 0) {
      throw new ReviewEventError('invalid-event', 'after must be a non-negative integer');
    }
    const entry = await this.readEntry(id);
    this.entries.set(id, entry);
    return structuredClone((entry.events ?? []).filter((event) => (event.seq ?? 0) > after));
  }

  async list(): Promise<ReviewSummary[]> {
    if (this.closed) throw new Error('review store is closed');
    const reviewsRoot = join(this.root, 'reviews');
    let entries;
    try {
      entries = await readdir(reviewsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const summaries: ReviewSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const cache = await this.readCache(entry.name).catch(() => null);
      if (cache === null || cache.state.id !== entry.name) continue;
      summaries.push(summary(cache.state));
    }
    summaries.sort((left, right) => {
      if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    return summaries;
  }

  async writeSnapshot(snapshotId: string, snapshot: Snapshot): Promise<void> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeSnapshotId(snapshotId);
    if (!isSnapshot(snapshot)) {
      throw new ReviewNotFoundError(id);
    }

    const dir = join(this.root, 'snapshots');
    await mkdir(dir, { recursive: true });
    const target = join(dir, `${id}.json`);
    const temp = join(dir, `.${id}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(JSON.stringify(snapshot));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  }

  async readSnapshot(snapshotId: string): Promise<Snapshot> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeSnapshotId(snapshotId);
    let raw: string;
    try {
      raw = await readFile(join(this.root, 'snapshots', `${id}.json`), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ReviewNotFoundError(id);
      }
      throw error;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ReviewNotFoundError(id);
    }
    if (!isSnapshot(value)) throw new ReviewNotFoundError(id);
    return structuredClone(value);
  }

  /**
   * Removes closed reviews older than `olderThanDays` and snapshots that no
   * remaining review references. Open reviews are never touched.
   */
  async gc(olderThanDays: number, now: Date = new Date()): Promise<GcResult> {
    if (this.closed) throw new Error('review store is closed');
    if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
      throw new RangeError('olderThanDays must be a non-negative number');
    }
    const cutoff = now.getTime() - olderThanDays * 24 * 60 * 60 * 1000;
    const summaries = await this.list();
    const all = new Map<ReviewId, ReviewState>();
    for (const summary of summaries) {
      const entry = await this.readEntry(summary.id).catch(() => null);
      if (entry !== null) all.set(summary.id, entry.state);
    }

    const removedReviews: ReviewId[] = [];
    for (const [id, state] of all) {
      if (state.status !== 'closed') continue;
      if (new Date(state.createdAt).getTime() >= cutoff) continue;
      removedReviews.push(id);
      await rm(this.reviewDir(id), { recursive: true, force: true });
      this.entries.delete(id);
      all.delete(id);
    }

    const referenced = new Set<string>();
    for (const state of all.values()) {
      for (const round of state.rounds) referenced.add(round.snapshotId);
    }
    let removedSnapshots = 0;
    let entries: string[] = [];
    try {
      entries = await readdir(join(this.root, 'snapshots'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const snapshotId = entry.slice(0, -'.json'.length);
      if (referenced.has(snapshotId)) continue;
      try {
        await unlink(join(this.root, 'snapshots', entry));
        removedSnapshots += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return { removedReviews, removedSnapshots };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.entries.clear();
    const existing = await readLock(this.lockPath);
    if (existing?.pid === process.pid && existing.createdAt === this.lockCreatedAt) {
      await unlink(this.lockPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }

  private reviewDir(reviewId: ReviewId): string {
    return join(this.root, 'reviews', reviewId);
  }

  private async repairTornTail(eventsPath: string): Promise<void> {
    let content: string;
    try {
      content = await readFile(eventsPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (content === '' || content.endsWith('\n')) return;
    const lastNewline = content.lastIndexOf('\n');
    await truncate(eventsPath, lastNewline < 0 ? 0 : lastNewline + 1);
  }

  private async readEntry(reviewId: ReviewId): Promise<CacheEntry> {
    const dir = this.reviewDir(reviewId);
    let content: string;
    try {
      content = await readFile(join(dir, 'events.jsonl'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ReviewNotFoundError(reviewId);
      }
      throw error;
    }

    const { state, eventCount, events } = parseReview(content, reviewId);
    const cache = await this.readCache(reviewId);
    if (
      cache !== null &&
      cache.eventCount === eventCount &&
      cache.state.version === state.version &&
      cache.state.id === reviewId
    ) {
      return {
        state: {
          ...structuredClone(cache.state),
          warnings: [...(state.warnings ?? [])],
        },
        eventCount,
        events,
      };
    }

    const entry = { state, eventCount, events };
    await this.writeCache(reviewId, entry);
    return entry;
  }

  private async readCache(reviewId: ReviewId): Promise<SnapshotCache | null> {
    let raw: string;
    try {
      raw = await readFile(join(this.reviewDir(reviewId), 'snapshot.json'), 'utf8');
    } catch {
      return null;
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (!isRecord(value)) return null;
      if (value.reviewId !== reviewId) return null;
      if (typeof value.eventCount !== 'number' || !Number.isInteger(value.eventCount)) return null;
      if (!isReviewState(value.state)) return null;
      return {
        reviewId,
        eventCount: value.eventCount,
        state: value.state,
      };
    } catch {
      return null;
    }
  }

  private async writeCache(reviewId: ReviewId, entry: CacheEntry): Promise<void> {
    const dir = this.reviewDir(reviewId);
    const target = join(dir, 'snapshot.json');
    const temp = join(dir, `.snapshot.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    const payload: SnapshotCache = {
      reviewId,
      eventCount: entry.eventCount,
      state: entry.state,
    };
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(JSON.stringify(payload));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  }
}
