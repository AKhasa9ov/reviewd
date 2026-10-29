import type {
  AddCommentInput,
  CommentState,
  CommentView,
  CreateReviewInput,
  DiffScope,
  FileDiff,
  FindingDecisionInput,
  FindingDecisionView,
  LatestFeedbackView,
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
  FileDiff,
  FindingDecisionInput,
  FindingDecisionView,
  LatestFeedbackView,
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

export interface RepositorySetting {
  name: string;
  path: string;
  defaultTarget?: string;
}

export interface RepositoriesResponse {
  repositories: RepositorySetting[];
}

export interface RepoBranchesResponse {
  repoRoot: string;
  branches: string[];
}

export interface RepoCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  subject: string;
}

export interface RepoCommitsResponse {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  mergeBase: string;
  headSha: string;
  /** Oldest first, matching the `commits` scope convention. */
  commits: RepoCommit[];
}

export interface DirectoryBreadcrumb {
  name: string;
  path: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isGit: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  breadcrumbs: DirectoryBreadcrumb[];
  entries: DirectoryEntry[];
  truncated: boolean;
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
