import { describe, expect, it } from 'vitest';
import { createEvent } from '@dsh-code-review/core';
import type { Page, ReviewEvent, ReviewSummary } from '@dsh-code-review/core';
import { EventHub } from '../../src/daemon/sse.js';

class FakeService {
  private readonly byId = new Map<string, ReviewEvent[]>();
  delayMs = 0;

  set(reviewId: string, count: number): void {
    this.byId.set(
      reviewId,
      Array.from({ length: count }, (_, index) => event(reviewId, index + 1)),
    );
  }

  async events(reviewId: string, after = 0): Promise<ReviewEvent[]> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return (this.byId.get(reviewId) ?? []).filter((entry) => (entry.seq ?? 0) > after);
  }

  async list(): Promise<Page<ReviewSummary>> {
    const items: ReviewSummary[] = [...this.byId.keys()].map((id) => ({
      id,
      title: id,
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      roundCount: 1,
      commentCount: 0,
      openCommentCount: 0,
    }));
    return { items, total: items.length, limit: 100, offset: 0 };
  }
}

function event(reviewId: string, seq: number): ReviewEvent {
  return {
    ...createEvent({
      reviewId,
      type: 'review/closed',
      actor: { kind: 'system', name: 'test' },
      data: { verdict: 'closed' },
    }),
    seq,
  };
}

describe('EventHub global cursor', () => {
  it('assigns each global entry its own monotonic sequence', async () => {
    const service = new FakeService();
    service.set('rev_a', 1);
    service.set('rev_b', 1);
    const hub = new EventHub(service);

    await hub.sync('rev_a');
    await hub.sync('rev_b');

    const all = hub.globalAfter(0);
    expect(all.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(hub.globalAfter(1).map((entry) => entry.reviewId)).toEqual(['rev_b']);

    const waited = await hub.waitGlobal(1, 20);
    expect(waited.map((entry) => entry.reviewId)).toEqual(['rev_b']);
  });

  it('does not replay events that fell out of the bounded buffer', async () => {
    const service = new FakeService();
    service.set('rev_a', 1100);
    const hub = new EventHub(service);

    await hub.sync('rev_a');
    const cursor = hub.globalAfter(0).at(-1)?.seq;
    expect(cursor).toBe(1100);

    await expect(hub.sync('rev_a')).resolves.toEqual([]);
    expect(hub.globalAfter(0)).toHaveLength(1000);
    expect(hub.globalAfter(0).at(-1)?.seq).toBe(cursor);
  });

  it('serializes concurrent syncs so an event is buffered once', async () => {
    const service = new FakeService();
    service.set('rev_a', 1);
    service.delayMs = 10;
    const hub = new EventHub(service);

    const [first, second] = await Promise.all([hub.sync('rev_a'), hub.sync('rev_a')]);
    expect([...first, ...second]).toHaveLength(1);
    expect(hub.globalAfter(0)).toHaveLength(1);
  });

  it('syncs every review before replaying a global stream', async () => {
    const service = new FakeService();
    service.set('rev_a', 2);
    service.set('rev_b', 1);
    const hub = new EventHub(service);

    await hub.syncAll();

    expect(hub.globalAfter(0)).toHaveLength(3);
    expect(hub.globalAfter(0).map((entry) => entry.reviewId)).toEqual(['rev_a', 'rev_a', 'rev_b']);
  });
});
