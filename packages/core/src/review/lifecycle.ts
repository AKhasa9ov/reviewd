import { captureAnchor, AnchorError, reanchor } from './anchors.js';
import { createEvent } from './events.js';
import { createId } from './ids.js';
import { ReviewNotFoundError } from './store.js';
import type { ReviewStore } from './store.js';
import type {
  Actor,
  AddCommentInput,
  Anchor,
  Comment,
  CommentState,
  CreateReviewInput,
  ReviewId,
  ReviewState,
  ReviewSummary,
  Round,
} from './types.js';
import type { Snapshot } from '../types.js';

export type ReviewLifecycleErrorCode =
  | 'not-found'
  | 'closed'
  | 'no-rounds'
  | 'duplicate-round'
  | 'round-order'
  | 'comment-not-found'
  | 'snapshot-mismatch';

export class ReviewLifecycleError extends Error {
  readonly code: ReviewLifecycleErrorCode;
  readonly reviewId?: ReviewId;
  readonly commentId?: string;

  constructor(
    code: ReviewLifecycleErrorCode,
    message: string,
    details: { reviewId?: ReviewId; commentId?: string } = {},
  ) {
    super(message);
    this.name = 'ReviewLifecycleError';
    this.code = code;
    if (details.reviewId !== undefined) this.reviewId = details.reviewId;
    if (details.commentId !== undefined) this.commentId = details.commentId;
  }
}

function findComment(state: ReviewState, commentId: string): Comment {
  const comment = state.comments.find((candidate) => candidate.id === commentId);
  if (comment === undefined) {
    throw new ReviewLifecycleError('comment-not-found', `unknown comment: ${commentId}`, {
      reviewId: state.id,
      commentId,
    });
  }
  return comment;
}

/**
 * Domain-level mutations for one review. Every method appends an event; the
 * aggregate is always reloaded through the store so callers never observe a
 * state that has not been folded from the log.
 */
export class ReviewLifecycle {
  private readonly store: ReviewStore;
  private readonly now: () => Date;

  constructor(store: ReviewStore, now: () => Date = () => new Date()) {
    this.store = store;
    this.now = now;
  }

  async create(input: CreateReviewInput): Promise<ReviewState> {
    const id = createId('rev', this.now);
    const state: ReviewState = {
      id,
      title: input.title,
      repoRoot: input.repoRoot,
      status: 'open',
      createdAt: this.now().toISOString(),
      rounds: [],
      comments: [],
      version: 0,
    };
    await this.store.append(
      id,
      createEvent({
        reviewId: id,
        type: 'review/created',
        actor: input.actor,
        data: { review: state },
        now: this.now,
      }),
    );
    return this.get(id);
  }

  async get(reviewId: ReviewId): Promise<ReviewState> {
    try {
      return await this.store.load(reviewId);
    } catch (error) {
      if (error instanceof ReviewNotFoundError) {
        throw new ReviewLifecycleError('not-found', error.message, { reviewId });
      }
      throw error;
    }
  }

  async list(): Promise<ReviewSummary[]> {
    return this.store.list();
  }

  async addRound(reviewId: ReviewId, snapshot: Snapshot, actor: Actor): Promise<Round> {
    const state = await this.requireOpen(reviewId);
    const previous = state.rounds.at(-1);
    // A worktree snapshot has no head commit; its identity is the digest.
    const sameScope = (round: Round): boolean =>
      snapshot.scope.headSha !== null &&
      round.baseSha === snapshot.scope.baseSha &&
      round.headSha === snapshot.scope.headSha;
    const earlier = state.rounds.slice(0, -1).find(sameScope);
    if (earlier !== undefined) {
      throw new ReviewLifecycleError(
        'duplicate-round',
        `snapshot already belongs to round ${earlier.no}`,
        { reviewId },
      );
    }
    if (previous !== undefined && sameScope(previous)) {
      throw new ReviewLifecycleError(
        'duplicate-round',
        `snapshot already belongs to round ${previous.no}`,
        { reviewId },
      );
    }

    const snapshotId = createId('snap', this.now);
    await this.store.writeSnapshot(snapshotId, snapshot);
    const round: Round = {
      no: state.rounds.length + 1,
      snapshotId,
      createdAt: this.now().toISOString(),
      baseSha: snapshot.scope.baseSha,
      headSha: snapshot.scope.headSha,
      path: `snapshots/${snapshotId}.json`,
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'round/created',
        actor,
        data: { round },
        now: this.now,
      }),
    );
    return round;
  }

  async latestSnapshot(reviewId: ReviewId): Promise<Snapshot> {
    const state = await this.get(reviewId);
    const round = state.rounds.at(-1);
    if (round === undefined) {
      throw new ReviewLifecycleError('no-rounds', `review has no rounds: ${reviewId}`, {
        reviewId,
      });
    }
    try {
      return await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      if (error instanceof ReviewNotFoundError) {
        throw new ReviewLifecycleError(
          'snapshot-mismatch',
          `round ${round.no} snapshot is missing or invalid: ${round.snapshotId}`,
          { reviewId },
        );
      }
      throw error;
    }
  }

  async addComment(reviewId: ReviewId, input: AddCommentInput, actor: Actor): Promise<Comment> {
    const state = await this.requireOpen(reviewId);
    const round = state.rounds.at(-1);
    if (round === undefined) {
      throw new ReviewLifecycleError('no-rounds', `review has no rounds: ${reviewId}`, {
        reviewId,
      });
    }
    const snapshot = await this.latestSnapshot(reviewId);

    let anchor: Anchor;
    try {
      anchor = captureAnchor(snapshot, {
        path: input.path,
        side: input.side,
        lineStart: input.lineStart,
        ...(input.lineEnd === undefined ? {} : { lineEnd: input.lineEnd }),
        round: round.no,
        id: createId('anc', this.now),
      });
    } catch (error) {
      if (error instanceof AnchorError) {
        throw new ReviewLifecycleError('snapshot-mismatch', error.message, { reviewId });
      }
      throw error;
    }

    const comment: Comment = {
      id: createId('cmt', this.now),
      reviewId,
      createdAt: this.now().toISOString(),
      author: actor,
      body: input.body,
      state: 'open',
      replies: [],
      anchors: [anchor],
      outcomes: [],
      ...(input.suggestion === undefined ? {} : { suggestion: structuredClone(input.suggestion) }),
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'comment/added',
        actor,
        data: { comment },
        now: this.now,
      }),
    );
    return this.findComment(await this.get(reviewId), comment.id);
  }

  async reply(reviewId: ReviewId, commentId: string, body: string, actor: Actor): Promise<Comment> {
    const state = await this.requireOpen(reviewId);
    findComment(state, commentId);
    if (body.trim() === '') {
      throw new Error('reply body must be non-empty');
    }

    const reply = {
      id: createId('cmt', this.now),
      author: actor,
      body,
      createdAt: this.now().toISOString(),
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'comment/replied',
        actor,
        data: { commentId, reply },
        now: this.now,
      }),
    );
    return this.findComment(await this.get(reviewId), commentId);
  }

  async setCommentState(
    reviewId: ReviewId,
    commentId: string,
    state: CommentState,
    actor: Actor,
  ): Promise<Comment> {
    const review = await this.requireOpen(reviewId);
    findComment(review, commentId);
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'comment/state',
        actor,
        data: { commentId, state },
        now: this.now,
      }),
    );
    return this.findComment(await this.get(reviewId), commentId);
  }

  async close(
    reviewId: ReviewId,
    verdict: 'approved' | 'closed',
    actor: Actor,
  ): Promise<ReviewState> {
    const state = await this.get(reviewId);
    if (state.status === 'closed') {
      throw new ReviewLifecycleError('closed', `review is already closed: ${reviewId}`, {
        reviewId,
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'review/closed',
        actor,
        data: { verdict },
        now: this.now,
      }),
    );
    return this.get(reviewId);
  }

  async refresh(
    reviewId: ReviewId,
    snapshot: Snapshot,
    actor: Actor,
  ): Promise<{ round: Round; comments: Comment[] }> {
    const state = await this.requireOpen(reviewId);
    const round = await this.addRound(reviewId, snapshot, actor);
    const comments = structuredClone(state.comments);

    for (const comment of comments) {
      const previous = comment.anchors.at(-1);
      if (previous === undefined) continue;
      const anchor = reanchor(previous, snapshot, {
        round: round.no,
        id: createId('anc', this.now),
      });
      await this.store.append(
        reviewId,
        createEvent({
          reviewId,
          type: 'comment/anchor',
          actor,
          data: { commentId: comment.id, anchor },
          now: this.now,
        }),
      );
      const index = comment.anchors.findIndex((candidate) => candidate.round === anchor.round);
      if (index < 0) comment.anchors.push(anchor);
      else comment.anchors[index] = anchor;
    }

    return { round, comments };
  }

  private async requireOpen(reviewId: ReviewId): Promise<ReviewState> {
    const state = await this.get(reviewId);
    if (state.status === 'closed') {
      throw new ReviewLifecycleError('closed', `review is closed: ${reviewId}`, { reviewId });
    }
    return state;
  }

  private findComment(state: ReviewState, commentId: string): Comment {
    return findComment(state, commentId);
  }
}
