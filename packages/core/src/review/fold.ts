import type { ReviewEvent } from './events.js';
import type { Comment, ReviewState } from './types.js';

export class ReviewFoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewFoldError';
  }
}

function findComment(state: ReviewState, commentId: string): Comment {
  const comment = state.comments.find((candidate) => candidate.id === commentId);
  if (comment === undefined) {
    throw new ReviewFoldError(`unknown comment: ${commentId}`);
  }
  return comment;
}

/**
 * Pure reduction of one event into review state. The input is never mutated;
 * callers replay events in append order. `review/created` seeds the aggregate
 * (and resets the version to 1); every other event advances it by one.
 */
export function fold(state: ReviewState, event: ReviewEvent): ReviewState {
  if (event.reviewId !== state.id) {
    throw new ReviewFoldError(`event ${event.id} belongs to ${event.reviewId}, not ${state.id}`);
  }

  if (event.type === 'review/created') {
    if (event.data.review.id !== event.reviewId) {
      throw new ReviewFoldError(
        `review payload ${event.data.review.id} belongs to a different review than ${event.reviewId}`,
      );
    }
    return {
      ...structuredClone(event.data.review),
      version: 1,
      warnings: [],
    };
  }

  const next = structuredClone(state);
  next.version += 1;
  next.warnings ??= [];

  switch (event.type) {
    case 'round/created': {
      if (next.rounds.some((round) => round.no === event.data.round.no)) {
        throw new ReviewFoldError(`duplicate round: ${event.data.round.no}`);
      }
      next.rounds.push(structuredClone(event.data.round));
      break;
    }
    case 'comment/added': {
      if (next.comments.some((comment) => comment.id === event.data.comment.id)) {
        throw new ReviewFoldError(`duplicate comment: ${event.data.comment.id}`);
      }
      next.comments.push(structuredClone(event.data.comment));
      break;
    }
    case 'comment/replied': {
      const comment = findComment(next, event.data.commentId);
      comment.replies.push(structuredClone(event.data.reply));
      break;
    }
    case 'comment/state': {
      findComment(next, event.data.commentId).state = event.data.state;
      break;
    }
    case 'comment/anchor': {
      const comment = findComment(next, event.data.commentId);
      const anchor = structuredClone(event.data.anchor);
      const index = comment.anchors.findIndex((candidate) => candidate.round === anchor.round);
      if (index < 0) comment.anchors.push(anchor);
      else comment.anchors[index] = anchor;
      if (event.data.outcome !== undefined) {
        comment.outcomes.push(structuredClone(event.data.outcome));
      }
      break;
    }
    case 'suggestion/applied': {
      const comment = findComment(next, event.data.commentId);
      const alreadyApplied = comment.outcomes.some(
        (outcome) => outcome.round === event.data.round && outcome.status === 'applied',
      );
      if (!alreadyApplied) {
        comment.outcomes.push({
          round: event.data.round,
          status: 'applied',
          confidence: 'high',
        });
      }
      break;
    }
    case 'review/closed': {
      next.status = 'closed';
      break;
    }
  }

  return next;
}
