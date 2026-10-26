import type { AgentReport, Finding, ReviewerConfig } from '../reviewer/types.js';

export type ReviewId = string;
export type RoundNo = number;
export type CommentId = string;

export type ActorKind = 'human' | 'agent' | 'system';

export interface Actor {
  name: string;
  kind: ActorKind;
}

export type Side = 'old' | 'new';
export type ReviewStatus = 'open' | 'closed';
export type CommentState = 'open' | 'resolved' | 'dismissed';
export type AnchorState = 'active' | 'ambiguous' | 'outdated';
export type OutcomeStatus = 'applied' | 'addressed' | 'unchanged' | 'outdated' | 'moved';
export type Confidence = 'high' | 'medium' | 'low';

export interface AnchorPosition {
  round: RoundNo;
  path: string;
  lineStart: number;
  lineEnd: number;
}

export interface Anchor {
  id: string;
  round: RoundNo;
  path: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
  quote: string;
  contextBefore: string[];
  contextAfter: string[];
  hunkHeader: string;
  contentHash: string;
  state: AnchorState;
  previous?: AnchorPosition;
}

export interface Suggestion {
  original: string;
  replacement: string;
}

export interface Reply {
  id: string;
  author: Actor;
  body: string;
  createdAt: string;
}

export interface Outcome {
  round: RoundNo;
  status: OutcomeStatus;
  confidence: Confidence;
}

export interface Comment {
  id: CommentId;
  reviewId: ReviewId;
  createdAt: string;
  author: Actor;
  body: string;
  suggestion?: Suggestion;
  state: CommentState;
  replies: Reply[];
  anchors: Anchor[];
  outcomes: Outcome[];
}

export interface Round {
  no: RoundNo;
  snapshotId: string;
  createdAt: string;
  baseSha: string;
  headSha: string | null;
  path: string;
}

export interface SubmissionRecord {
  submissionId: string;
  round: RoundNo;
  verdict: 'approve' | 'request-changes' | 'comment';
  deliveryKey: string;
  createdAt: string;
}

export type AgentStatus = 'running' | 'done' | 'failed' | 'skipped';

export interface AgentState {
  status: AgentStatus;
  jobId?: string;
  round?: RoundNo;
  startedAt?: string;
  error?: string;
  findings?: Finding[];
}

export interface ReviewState {
  id: ReviewId;
  title: string;
  repoRoot: string;
  status: ReviewStatus;
  createdAt: string;
  rounds: Round[];
  comments: Comment[];
  version: number;
  /** Non-fatal recovery notices, e.g. a torn final JSONL line. */
  warnings?: string[];
  /** Reviewer configuration captured at creation (defaults to none). */
  reviewer?: ReviewerConfig;
  /** Latest validated reviewer report, if any. */
  report?: AgentReport;
  /** Reviewer run lifecycle for concurrency and UI. */
  agent?: AgentState;
  /** Submissions in append order; one per round. */
  submissions?: SubmissionRecord[];
}

export interface ReviewSummary {
  id: ReviewId;
  title: string;
  status: ReviewStatus;
  createdAt: string;
  roundCount: number;
  commentCount: number;
  openCommentCount: number;
}

export interface CreateReviewInput {
  title: string;
  repoRoot: string;
  actor: Actor;
  reviewer?: ReviewerConfig;
}

export interface AddCommentInput {
  body: string;
  path: string;
  side: Side;
  lineStart: number;
  lineEnd?: number;
  suggestion?: Suggestion;
}
