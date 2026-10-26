import { describe, expect, it } from 'vitest';
import {
  createEvent,
  createId,
  isReviewEvent,
  isReviewEventType,
  ReviewEventError,
  ReviewIdError,
} from '../../src/index.js';
import type { Actor, ReviewEvent, ReviewState } from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const fixedNow = () => new Date('2026-10-26T12:00:00.000Z');
const bytes = (length: number, fill: number): Uint8Array => Uint8Array.from({ length }, () => fill);

const review: ReviewState = {
  id: 'rev_01K8Z000000000000000000000',
  title: 'Test review',
  repoRoot: '/tmp/repo',
  status: 'open',
  createdAt: '2026-10-26T12:00:00.000Z',
  rounds: [],
  comments: [],
  version: 0,
};

describe('createId', () => {
  it('creates a prefixed, fixed-width Crockford id', () => {
    const id = createId('rev', fixedNow, (length) => bytes(length, 0));
    expect(id).toMatch(/^rev_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('is deterministic for an injected clock and randomness', () => {
    const random = (length: number): Uint8Array => bytes(length, 7);
    expect(createId('cmt', fixedNow, random)).toBe(createId('cmt', fixedNow, random));
  });

  it('is lexicographically sortable by time', () => {
    const early = createId(
      'rnd',
      () => new Date('2026-10-26T12:00:00.000Z'),
      (n) => bytes(n, 0),
    );
    const late = createId(
      'rnd',
      () => new Date('2026-10-26T12:00:01.000Z'),
      (n) => bytes(n, 0),
    );
    expect(early < late).toBe(true);
  });

  it('uses different randomness to produce unique ids in the same millisecond', () => {
    const first = createId('evt', fixedNow, (n) => bytes(n, 1));
    const second = createId('evt', fixedNow, (n) => bytes(n, 2));
    expect(first).not.toBe(second);
  });

  it('rejects unknown prefixes and invalid times', () => {
    expect(() => createId('nope' as never, fixedNow)).toThrow(ReviewIdError);
    expect(() => createId('rev', () => new Date(Number.NaN))).toThrow(ReviewIdError);
    expect(() => createId('rev', () => new Date(-1))).toThrow(ReviewIdError);
  });

  it('asks for 10 random bytes (80 bits)', () => {
    let requested = -1;
    createId('snap', fixedNow, (length) => {
      requested = length;
      return bytes(length, 0);
    });
    expect(requested).toBe(10);
  });
});

describe('createEvent', () => {
  it('builds a versioned event with injected time and id', () => {
    let counter = 0;
    const event = createEvent({
      reviewId: review.id,
      type: 'review/created',
      actor,
      data: { review },
      now: fixedNow,
      newId: () => `evt_fixed_${counter++}`,
    });

    expect(event).toEqual({
      v: 1,
      id: 'evt_fixed_0',
      reviewId: review.id,
      type: 'review/created',
      at: '2026-10-26T12:00:00.000Z',
      actor,
      data: { review },
    });
    expect(isReviewEvent(event)).toBe(true);
  });

  it('gives every default event a unique evt_ id', () => {
    const first = createEvent({
      reviewId: review.id,
      type: 'review/closed',
      actor,
      data: { verdict: 'approved' },
      now: fixedNow,
    });
    const second = createEvent({
      reviewId: review.id,
      type: 'review/closed',
      actor,
      data: { verdict: 'approved' },
      now: fixedNow,
    });

    expect(first.id).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(first.id).not.toBe(second.id);
  });

  it('rejects unknown event types', () => {
    expect(() =>
      createEvent({
        reviewId: review.id,
        type: 'review/exploded' as never,
        actor,
        data: {} as never,
      }),
    ).toThrow(ReviewEventError);
    expect(isReviewEventType('review/exploded')).toBe(false);
  });

  it('rejects an empty or whitespace-only actor name', () => {
    for (const name of ['', '   ']) {
      expect(() =>
        createEvent({
          reviewId: review.id,
          type: 'review/closed',
          actor: { name, kind: 'human' },
          data: { verdict: 'approved' },
        }),
      ).toThrow(ReviewEventError);
    }
  });

  it('rejects an empty review id and an unknown actor kind', () => {
    expect(() =>
      createEvent({
        reviewId: '',
        type: 'review/closed',
        actor,
        data: { verdict: 'approved' },
      }),
    ).toThrow(ReviewEventError);

    expect(() =>
      createEvent({
        reviewId: review.id,
        type: 'review/closed',
        actor: { name: 'Ada', kind: 'robot' as never },
        data: { verdict: 'approved' },
      }),
    ).toThrow(ReviewEventError);
  });
});

describe('isReviewEvent', () => {
  const valid = createEvent({
    reviewId: review.id,
    type: 'review/closed',
    actor,
    data: { verdict: 'approved' },
    now: fixedNow,
    newId: () => 'evt_valid',
  });

  it('rejects non-objects, wrong versions and malformed ids', () => {
    expect(isReviewEvent(null)).toBe(false);
    expect(isReviewEvent('event')).toBe(false);
    expect(isReviewEvent({ ...valid, v: 2 })).toBe(false);
    expect(isReviewEvent({ ...valid, id: 'not-an-event' })).toBe(false);
    expect(isReviewEvent({ ...valid, at: 'yesterday' })).toBe(false);
    expect(isReviewEvent({ ...valid, reviewId: '' })).toBe(false);
  });

  it('rejects unknown types, empty actors and non-object data', () => {
    expect(isReviewEvent({ ...valid, type: 'bogus' })).toBe(false);
    expect(isReviewEvent({ ...valid, actor: { name: '', kind: 'human' } })).toBe(false);
    expect(isReviewEvent({ ...valid, actor: { name: 'Ada', kind: 'robot' } })).toBe(false);
    expect(isReviewEvent({ ...valid, data: null })).toBe(false);
  });

  it('narrows a valid event', () => {
    const value: unknown = valid;
    if (!isReviewEvent(value)) throw new Error('expected valid event');
    const event: ReviewEvent = value;
    expect(event.type).toBe('review/closed');
  });
});
