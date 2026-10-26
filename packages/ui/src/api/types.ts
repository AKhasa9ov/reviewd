import type {
  AddCommentInput,
  CommentState,
  CommentView,
  CreateReviewInput,
  DiffScope,
  Page,
  ReviewEvent,
  ReviewSummary,
  ReviewView,
  ServiceSnapshotView,
  SubmissionView,
  SubmitInput,
} from '@dsh-code-review/core';

export type {
  AddCommentInput,
  CommentState,
  CommentView,
  DiffScope,
  Page,
  ReviewEvent,
  ReviewSummary,
  ReviewView,
  ServiceSnapshotView,
  SubmissionView,
  SubmitInput,
};

export interface CreateReviewRequest {
  repoRoot: string;
  title: string;
  scope: DiffScope;
  reviewer?: { backend: 'worker' | 'command' | 'none' | 'fake'; harness?: string };
}

export type CreateReviewResponse = {
  /** The daemon returns the full service view, not only the review record. */
  review: ReviewView;
  url: string;
  warnings: string[];
};

export interface SubmissionDelivery {
  id: string;
  deliveryKey: string;
  reviewId: string;
  round: number;
  harness: string;
}

export interface SubmitResponse {
  submission: SubmissionView;
  delivery: SubmissionDelivery;
}

export interface HealthResponse {
  status: string;
  store: { writable: boolean };
  git: { ok: boolean };
  queue?: Record<string, number>;
  jobs?: Record<string, number>;
  workers?: Record<string, number>;
  version?: string;
}

export interface EventsResponse {
  events: ReviewEvent[];
  latestSeq: number;
}

export type { CreateReviewInput };
