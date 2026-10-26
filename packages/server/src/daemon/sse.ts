import type { ServerResponse } from 'node:http';
import type { ReviewEvent, ReviewService } from '@dsh-code-review/core';
import type { IncomingMessage } from 'node:http';

const BUFFER_LIMIT = 1000;

interface Waiter {
  reviewId?: string;
  after: number;
  resolve: (events: ReviewEvent[]) => void;
  timer: NodeJS.Timeout;
}

export interface GlobalEntry {
  reviewId: string;
  event: ReviewEvent;
  /** Position in the daemon-wide stream; independent of the per-review event sequence. */
  seq: number;
}

type Listener = (event: ReviewEvent, reviewId: string, seq?: number) => void;

export class EventHub {
  private readonly service: Pick<ReviewService, 'events' | 'list'>;
  private readonly reviews = new Map<string, ReviewEvent[]>();
  private readonly global: GlobalEntry[] = [];
  private readonly latest = new Map<string, number>();
  private readonly syncs = new Map<string, Promise<ReviewEvent[]>>();
  private readonly waiters = new Set<Waiter>();
  private readonly listeners = new Set<Listener>();
  private globalSeq = 0;

  constructor(service: Pick<ReviewService, 'events' | 'list'>) {
    this.service = service;
  }

  /**
   * Refreshes the in-memory buffer from the event log. Concurrent callers for one
   * review are serialized so an event cannot be buffered twice.
   */
  async sync(reviewId: string): Promise<ReviewEvent[]> {
    const previous = this.syncs.get(reviewId) ?? Promise.resolve<ReviewEvent[]>([]);
    const next = previous.catch(() => [] as ReviewEvent[]).then(() => this.syncOnce(reviewId));
    this.syncs.set(reviewId, next);
    try {
      return await next;
    } finally {
      if (this.syncs.get(reviewId) === next) this.syncs.delete(reviewId);
    }
  }

  /** Replays the event log for every known review into the global stream. */
  async syncAll(): Promise<void> {
    const limit = 100;
    let offset = 0;
    for (;;) {
      const page = await this.service.list({ limit, offset });
      for (const item of page.items) await this.sync(item.id);
      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.total) return;
    }
  }

  eventsAfter(reviewId: string, after: number): ReviewEvent[] {
    return (this.reviews.get(reviewId) ?? []).filter((event) => (event.seq ?? 0) > after);
  }

  globalAfter(after: number): GlobalEntry[] {
    return this.global.filter((item) => item.seq > after);
  }

  wait(
    reviewId: string,
    after: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<ReviewEvent[]> {
    const ready = this.eventsAfter(reviewId, after);
    if (ready.length > 0) return Promise.resolve(ready);
    return new Promise<ReviewEvent[]>((resolve) => {
      const waiter: Waiter = {
        reviewId,
        after,
        resolve: (events) => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          resolve(events);
        },
        timer: setTimeout(() => waiter.resolve([]), timeoutMs),
      };
      signal?.addEventListener(
        'abort',
        () => {
          waiter.resolve([]);
        },
        { once: true },
      );
      this.waiters.add(waiter);
    });
  }

  waitGlobal(after: number, timeoutMs: number, signal?: AbortSignal): Promise<GlobalEntry[]> {
    const ready = this.globalAfter(after);
    if (ready.length > 0) return Promise.resolve(ready);
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const finish = (entries: GlobalEntry[]): void => {
        if (timer !== undefined) clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(entries);
      };
      const listener = (): void => {
        const entries = this.globalAfter(after);
        if (entries.length > 0) finish(entries);
      };
      timer = setTimeout(() => finish([]), timeoutMs);
      signal?.addEventListener(
        'abort',
        () => {
          finish([]);
        },
        { once: true },
      );
      this.listeners.add(listener);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async syncOnce(reviewId: string): Promise<ReviewEvent[]> {
    const events = await this.service.events(reviewId, 0);
    const known = this.reviews.get(reviewId) ?? [];
    const knownLatest = Math.max(
      0,
      ...known.map((event) => event.seq ?? 0),
      this.latest.get(reviewId) ?? 0,
    );
    const fresh = events.filter((event) => (event.seq ?? 0) > knownLatest);
    if (fresh.length === 0) {
      if (knownLatest > 0) this.latest.set(reviewId, knownLatest);
      return [];
    }
    this.reviews.set(reviewId, [...known, ...fresh].slice(-BUFFER_LIMIT));
    const entries: GlobalEntry[] = [];
    for (const event of fresh) {
      const entry: GlobalEntry = { reviewId, event, seq: ++this.globalSeq };
      this.global.push(entry);
      if (this.global.length > BUFFER_LIMIT) this.global.shift();
      entries.push(entry);
      const seq = event.seq ?? 0;
      if (seq > (this.latest.get(reviewId) ?? 0)) this.latest.set(reviewId, seq);
    }
    for (const entry of entries) {
      for (const listener of this.listeners) listener(entry.event, entry.reviewId, entry.seq);
    }
    this.flush();
    return fresh;
  }

  private flush(): void {
    for (const waiter of [...this.waiters]) {
      const events =
        waiter.reviewId === undefined
          ? this.globalAfter(waiter.after).map((item) => item.event)
          : this.eventsAfter(waiter.reviewId, waiter.after);
      if (events.length > 0) waiter.resolve(events);
    }
  }
}

interface Frame {
  id: string;
  payload: string;
}

function frame(reviewId: string, event: ReviewEvent, seq = event.seq ?? 0): Frame {
  const id = `${reviewId}:${seq}`;
  return {
    id,
    payload: `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  };
}

/**
 * Opens an SSE stream. The event log is replayed first so a reconnecting client
 * (and a daemon that just restarted with an empty buffer) still sees history.
 */
export async function openSse(
  req: IncomingMessage,
  res: ServerResponse,
  hub: EventHub,
  options: { reviewId?: string; after: number; heartbeatMs: number },
): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(': connected\n\n');

  let replaying = true;
  const pending = new Map<string, string>();
  const unsubscribe = hub.subscribe((event, reviewId, seq) => {
    if (options.reviewId !== undefined && reviewId !== options.reviewId) return;
    const framed = frame(reviewId, event, options.reviewId === undefined ? seq : (event.seq ?? 0));
    if (replaying) pending.set(framed.id, framed.payload);
    else res.write(framed.payload);
  });
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, options.heartbeatMs);
  const close = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
    if (!res.writableEnded) res.end();
  };
  req.on('close', close);
  res.on('close', close);

  try {
    if (options.reviewId === undefined) await hub.syncAll();
    else await hub.sync(options.reviewId);
  } catch {
    // Keep streaming the events already buffered; a later reconnect can retry.
  }
  if (res.writableEnded) return;

  const existing =
    options.reviewId === undefined
      ? hub.globalAfter(options.after).map((item) => frame(item.reviewId, item.event, item.seq))
      : hub
          .eventsAfter(options.reviewId, options.after)
          .map((event) => frame(options.reviewId ?? '', event));
  const replayed = new Set<string>();
  for (const item of existing) {
    if (pending.has(item.id)) continue;
    res.write(item.payload);
    replayed.add(item.id);
  }
  replaying = false;
  for (const [id, payload] of pending) {
    if (replayed.has(id)) continue;
    res.write(payload);
  }
  pending.clear();
}
