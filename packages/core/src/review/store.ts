import { randomBytes } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  link,
  open,
  readdir,
  readFile,
  stat,
  mkdir,
  rename,
  rm,
  truncate,
  unlink,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isReviewEvent, ReviewEventError } from './events.js';
import type { ReviewEvent } from './events.js';
import { fold } from './fold.js';
import type { Snapshot } from '../types.js';
import type {
  Actor,
  Comment,
  FindingDecision,
  ReviewId,
  ReviewState,
  ReviewStatus,
  ReviewSummary,
} from './types.js';

export interface ReviewStoreOptions {
  now?: () => Date;
  newId?: (prefix: string) => string;
}

interface CacheEntry {
  state: ReviewState;
  eventCount: number;
  /** Exact byte length of the log prefix this state was folded from. */
  bytes?: number;
  events?: ReviewEvent[];
}

interface SnapshotCache {
  reviewId: ReviewId;
  eventCount: number;
  /** Size of events.jsonl when this cache was written; detects a stale cache. */
  eventBytes?: number;
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

function isActor(value: unknown): value is Actor {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    (value.kind === 'human' || value.kind === 'agent' || value.kind === 'system')
  );
}

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
    Array.isArray(value.outcomes) &&
    (value.editedAt === undefined || isTimestamp(value.editedAt)) &&
    (value.editedBy === undefined || isActor(value.editedBy)) &&
    (value.deletedAt === undefined || isTimestamp(value.deletedAt)) &&
    (value.deletedBy === undefined || isActor(value.deletedBy))
  );
}

function isFindingDecision(value: unknown): value is FindingDecision {
  if (!isRecord(value)) return false;
  return (
    typeof value.findingId === 'string' &&
    typeof value.round === 'number' &&
    Number.isInteger(value.round) &&
    value.round > 0 &&
    (value.state === 'accepted' || value.state === 'dismissed') &&
    (value.note === undefined || typeof value.note === 'string') &&
    isRecord(value.by) &&
    typeof value.by.name === 'string' &&
    (value.by.kind === 'human' || value.by.kind === 'agent' || value.by.kind === 'system') &&
    isTimestamp(value.at)
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
    (value.closedAt === undefined || isTimestamp(value.closedAt)) &&
    (value.updatedAt === undefined || isTimestamp(value.updatedAt)) &&
    (value.updatedBy === undefined || isActor(value.updatedBy)) &&
    (value.deletedAt === undefined || isTimestamp(value.deletedAt)) &&
    (value.deletedBy === undefined || isActor(value.deletedBy)) &&
    Array.isArray(value.rounds) &&
    Array.isArray(value.comments) &&
    value.comments.every(isComment) &&
    (value.findingDecisions === undefined ||
      (Array.isArray(value.findingDecisions) && value.findingDecisions.every(isFindingDecision))) &&
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
  const comments = state.comments.filter((comment) => comment.deletedAt === undefined);
  const latestClaims = new Map<string, string>();
  for (const claim of state.fixClaims ?? []) latestClaims.set(claim.commentId, claim.status);
  return {
    id: state.id,
    title: state.title,
    repoRoot: state.repoRoot,
    status: state.status,
    createdAt: state.createdAt,
    roundCount: state.rounds.length,
    commentCount: comments.length,
    openCommentCount: comments.filter((comment) => comment.state === 'open').length,
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
  private readonly locks = new Map<ReviewId, Promise<unknown>>();
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

    // A review's read-fold-append-cache sequence is one critical section. Two
    // concurrent appends must not both read the same event count and write the
    // same sequence number.
    return await this.withReviewLock(id, async () => {
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
      // The event log is the source of truth. A cache failure must not turn a
      // committed mutation into an error; the next read rebuilds the cache.
      await this.writeCache(id, next).catch(() => undefined);
      return structuredClone(sequenced);
    });
  }

  async load(reviewId: ReviewId): Promise<ReviewState> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeReviewId(reviewId);
    return await this.withReviewLock(id, async () => {
      const entry = await this.readEntry(id);
      this.entries.set(id, entry);
      return structuredClone(entry.state);
    });
  }

  async events(reviewId: ReviewId, after = 0): Promise<ReviewEvent[]> {
    if (this.closed) throw new Error('review store is closed');
    const id = safeReviewId(reviewId);
    if (!Number.isInteger(after) || after < 0) {
      throw new ReviewEventError('invalid-event', 'after must be a non-negative integer');
    }
    return await this.withReviewLock(id, async () => {
      const entry = await this.readEntry(id);
      this.entries.set(id, entry);
      return structuredClone((entry.events ?? []).filter((event) => (event.seq ?? 0) > after));
    });
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
      const id = entry.name as ReviewId;
      const cache = await this.readCache(id).catch(() => null);
      const cacheFresh =
        cache !== null &&
        cache.state.id === id &&
        cache.eventBytes !== undefined &&
        (await stat(join(this.reviewDir(id), 'events.jsonl')).catch(() => null))?.size ===
          cache.eventBytes;
      if (cache !== null && cacheFresh) {
        if (cache.state.deletedAt === undefined) summaries.push(summary(cache.state));
        continue;
      }
      // A missing or corrupt cache must not hide the review: replay its JSONL
      // log and write a replacement cache as a side effect.
      const rebuilt = await this.readEntry(id).catch(() => null);
      if (rebuilt === null || rebuilt.state.id !== id) continue;
      this.entries.set(id, rebuilt);
      if (rebuilt.state.deletedAt === undefined) summaries.push(summary(rebuilt.state));
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
      // A hard link publishes the finished file atomically and fails with
      // EEXIST when the snapshot id is already taken, so snapshots are immutable.
      await link(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    await unlink(temp).catch(() => undefined);
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
    const reviewsRoot = join(this.root, 'reviews');
    let reviewEntries: Dirent[] = [];
    try {
      reviewEntries = await readdir(reviewsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    // Scan directories directly instead of trusting list(): a missing or stale
    // cache must not make an old review invisible to garbage collection.
    const all = new Map<ReviewId, ReviewState>();
    for (const entry of reviewEntries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name as ReviewId;
      const loaded = await this.readEntry(id).catch(() => null);
      if (loaded === null) continue;
      all.set(id, loaded.state);
      this.entries.set(id, loaded);
    }

    const removedReviews: ReviewId[] = [];
    for (const [id, state] of all) {
      if (state.status !== 'closed') continue;
      // Newer logs carry the close time; legacy logs fall back to createdAt so
      // their previous collection behavior is preserved.
      const closedTime = new Date(state.closedAt ?? state.createdAt).getTime();
      if (!Number.isFinite(closedTime) || closedTime >= cutoff) continue;
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

  /**
   * Serializes work per review without blocking other reviews. A failed task
   * releases the gate so later appends can still make progress.
   */
  private async withReviewLock<T>(reviewId: ReviewId, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(reviewId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const current: Promise<unknown> = previous.catch(() => undefined).then(() => gate);
    this.locks.set(reviewId, current);
    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(reviewId) === current) this.locks.delete(reviewId);
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
    const eventBytes = Buffer.byteLength(content);
    if (
      cache !== null &&
      cache.eventCount === eventCount &&
      cache.eventBytes === eventBytes &&
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

    const entry = { state, eventCount, bytes: eventBytes, events };
    await this.writeCache(reviewId, entry).catch(() => undefined);
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
      if (value.eventBytes !== undefined && typeof value.eventBytes !== 'number') return null;
      if (!isReviewState(value.state)) return null;
      return {
        reviewId,
        eventCount: value.eventCount,
        ...(typeof value.eventBytes === 'number' ? { eventBytes: value.eventBytes } : {}),
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
    const eventBytes =
      entry.bytes ??
      (await stat(join(dir, 'events.jsonl')).then(
        (info) => info.size,
        () => undefined,
      ));
    const payload: SnapshotCache = {
      reviewId,
      eventCount: entry.eventCount,
      ...(eventBytes === undefined ? {} : { eventBytes }),
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
