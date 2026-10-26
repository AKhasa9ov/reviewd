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

export class EventHub {
  private readonly service: Pick<ReviewService, 'events'>;
  private readonly reviews = new Map<string, ReviewEvent[]>();
  private readonly global: Array<{ reviewId: string; event: ReviewEvent }> = [];
  private readonly waiters = new Set<Waiter>();
  private readonly listeners = new Set<(event: ReviewEvent, reviewId: string) => void>();

  constructor(service: Pick<ReviewService, 'events'>) {
    this.service = service;
  }

  async sync(reviewId: string): Promise<ReviewEvent[]> {
    const events = await this.service.events(reviewId, 0);
    const known = this.reviews.get(reviewId) ?? [];
    const seen = new Set(known.map((event) => event.seq ?? 0));
    const fresh = events.filter((event) => !seen.has(event.seq ?? 0));
    if (fresh.length === 0) return [];
    const next = [...known, ...fresh].slice(-BUFFER_LIMIT);
    this.reviews.set(reviewId, next);
    for (const event of fresh) {
      this.global.push({ reviewId, event });
      if (this.global.length > BUFFER_LIMIT) this.global.shift();
      for (const listener of this.listeners) listener(event, reviewId);
    }
    this.flush();
    return fresh;
  }

  eventsAfter(reviewId: string, after: number): ReviewEvent[] {
    return (this.reviews.get(reviewId) ?? []).filter((event) => (event.seq ?? 0) > after);
  }

  globalAfter(after: number): Array<{ reviewId: string; event: ReviewEvent }> {
    return this.global.filter((item) => (item.event.seq ?? 0) > after);
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

  waitGlobal(
    after: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Array<{ reviewId: string; event: ReviewEvent }>> {
    const ready = this.globalAfter(after);
    if (ready.length > 0) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        resolve([]);
      }, timeoutMs);
      const listener = (event: ReviewEvent, reviewId: string): void => {
        if ((event.seq ?? 0) <= after) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve([{ reviewId, event }]);
      };
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve([]);
        },
        { once: true },
      );
      this.listeners.add(listener);
    });
  }

  subscribe(listener: (event: ReviewEvent, reviewId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

function frame(reviewId: string, event: ReviewEvent): string {
  const id = `${reviewId}:${event.seq ?? 0}`;
  return `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function openSse(
  req: IncomingMessage,
  res: ServerResponse,
  hub: EventHub,
  options: { reviewId?: string; after: number; heartbeatMs: number },
): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const prefix = ': connected\n\n';
  res.write(prefix);
  const existing =
    options.reviewId === undefined
      ? hub.globalAfter(options.after).map((item) => frame(item.reviewId, item.event))
      : hub
          .eventsAfter(options.reviewId, options.after)
          .map((event) => frame(options.reviewId ?? '', event));
  for (const payload of existing) res.write(payload);
  const unsubscribe = hub.subscribe((event, reviewId) => {
    if (options.reviewId !== undefined && reviewId !== options.reviewId) return;
    res.write(frame(reviewId, event));
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
}
