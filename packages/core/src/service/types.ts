import type { DiffScope, Snapshot } from '../types.js';
import type { GcResult } from '../review/store.js';
import type { AgentReport } from '../reviewer/types.js';
import type { IdPrefix } from '../review/ids.js';
import type { ReviewEvent } from '../review/events.js';
import type { ReviewLifecycle } from '../review/lifecycle.js';
import type { ReviewStore } from '../review/store.js';
import type {
  Actor,
  AddCommentInput,
  Comment,
  FixClaimRecord,
  CommentState,
  ReviewId,
  ReviewState,
  ReviewSummary,
  Initiator,
  RoundNo,
  SubmissionRecord,
} from '../review/types.js';
import type {
  GitStatusRunner,
  ReviewQuestion,
  ReviewerBackend,
  ReviewerConfig,
  Verification,
} from '../reviewer/types.js';

export interface CallContext {
  actor: Actor;
  requestId?: string;
}

export type ReviewErrorCode =
  'not-found' | 'validation' | 'conflict' | 'agent-busy' | 'stale-review' | 'internal';

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ReviewErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ReviewError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export interface ServiceCreateInput {
  repoRoot: string;
  title: string;
  scope: DiffScope;
  reviewer?: ReviewerConfig;
  initiator?: Initiator;
}

export interface ReviewView {
  review: ReviewState;
  latestSnapshot: Snapshot | null;
  report: AgentReport | null;
}

export interface CommentView {
  comment: Comment;
}

export interface ReviewFilter {
  status?: 'open' | 'closed';
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReplyInput {
  body: string;
}

export interface SubmitInput {
  verdict: 'approve' | 'request-changes' | 'comment';
  summary?: string;
  includeResolved?: boolean;
}

export interface FeedbackFinding {
  id: string;
  severity: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  title: string;
  rationale: string;
  evidence: string;
}

export interface FeedbackComment {
  commentId: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  body: string;
  suggestion?: { original: string; replacement: string };
}

export interface FeedbackSuggestion {
  commentId: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  original: string;
  replacement: string;
}

export interface FeedbackJson {
  schemaVersion: 1;
  reviewId: ReviewId;
  round: RoundNo;
  verdict: SubmitInput['verdict'];
  title: string;
  scope: {
    baseSha: string;
    headSha: string | null;
    label: string;
  };
  deliveryKey: string;
  summary?: string;
  findings: FeedbackFinding[];
  humanComments: FeedbackComment[];
  appliedSuggestions: FeedbackSuggestion[];
  acceptedSuggestions: FeedbackSuggestion[];
  questions: ReviewQuestion[];
  verification: Verification[];
  resolved: {
    count: number;
    commentIds: string[];
  };
  /** Set when the JSON package was reduced to the 100 KiB budget. */
  truncated?: boolean;
  notice?: string;
}

export interface FeedbackPackage {
  markdown: string;
  json: FeedbackJson;
  deliveryKey: string;
}

export interface SubmissionView {
  reviewId: ReviewId;
  round: RoundNo;
  verdict: SubmitInput['verdict'];
  feedback: FeedbackPackage;
  deliveryKey: string;
}

export interface SuggestionActionInput {
  action: 'accept' | 'decline' | 'apply';
}

export interface FixStatusInput {
  items: Array<{ commentId: string; status: FixClaimRecord['status']; evidence?: string }>;
}

export interface RefreshInput {
  /** Omit to rebuild the latest scope; pass a scope after new commits. */
  scope?: DiffScope;
}

export interface LatestFeedbackView {
  submission: SubmissionRecord;
  feedback: FeedbackPackage;
}

export interface ServiceSnapshotView {
  snapshot: Snapshot;
  round: RoundNo;
  file?: string;
}

export interface ReviewService {
  create(input: ServiceCreateInput, ctx: CallContext): Promise<ReviewView>;
  list(filter?: ReviewFilter): Promise<Page<ReviewSummary>>;
  get(id: ReviewId): Promise<ReviewView>;
  snapshot(id: ReviewId, round: RoundNo, file?: string): Promise<ServiceSnapshotView>;
  addComment(id: ReviewId, input: AddCommentInput, ctx: CallContext): Promise<CommentView>;
  reply(id: ReviewId, commentId: string, input: ReplyInput, ctx: CallContext): Promise<CommentView>;
  setCommentState(
    id: ReviewId,
    commentId: string,
    state: CommentState,
    ctx: CallContext,
  ): Promise<CommentView>;
  events(id: ReviewId, after?: number): Promise<ReviewEvent[]>;
  suggestionAction(
    id: ReviewId,
    commentId: string,
    action: SuggestionActionInput['action'],
    ctx: CallContext,
  ): Promise<CommentView>;
  refresh(id: ReviewId, input: RefreshInput, ctx: CallContext): Promise<ReviewView>;
  close(id: ReviewId, verdict: 'approved' | 'closed', ctx: CallContext): Promise<ReviewView>;
  claimFixStatus(id: ReviewId, input: FixStatusInput, ctx: CallContext): Promise<void>;
  latestFeedback(id: ReviewId): Promise<LatestFeedbackView | null>;
  gc(olderThanDays: number): Promise<GcResult>;
  submit(id: ReviewId, input: SubmitInput, ctx: CallContext): Promise<SubmissionView>;
  runReviewer(id: ReviewId, ctx: CallContext): Promise<AgentReport>;
  cancelAgent(id: ReviewId, ctx: CallContext): Promise<void>;
}

export interface ReviewServiceImplDeps {
  lifecycle: ReviewLifecycle;
  store: ReviewStore;
  snapshots: {
    build(input: { repoRoot: string; scope: DiffScope }): Promise<Snapshot>;
  };
  now?: () => Date;
  newId?: (prefix: IdPrefix) => string;
  backendFactory?: (config: ReviewerConfig) => ReviewerBackend;
  runGit?: GitStatusRunner;
  /** Upper bound for the in-memory request-id cache. */
  idempotencyLimit?: number;
}
