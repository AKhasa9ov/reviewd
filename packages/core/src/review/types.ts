import type { AgentReport, Finding, ReviewerConfig } from '../reviewer/types.js';

export type ReviewId = string;
export type RoundNo = number;
export type CommentId = string;

export type ActorKind = 'human' | 'agent' | 'system';

/** Where the review was requested; used to route feedback back to that session. */
export interface Initiator {
  harness: string;
  sessionId: string;
  cwd?: string;
  agentPreset?: string;
}

export interface Actor {
  name: string;
  kind: ActorKind;
}

export type Side = 'old' | 'new';
export type ReviewStatus = 'open' | 'closed';
export type CommentState = 'open' | 'resolved' | 'dismissed';
export type AnchorState = 'active' | 'ambiguous' | 'outdated';
export type OutcomeStatus = 'applied' | 'addressed' | 'unchanged' | 'outdated' | 'moved';
export type SuggestionState = 'proposed' | 'accepted' | 'declined' | 'applied';
export type FixStatus = 'fixed' | 'not-fixed' | 'unclear';
export type FindingDecisionState = 'accepted' | 'dismissed';
export type Confidence = 'high' | 'medium' | 'low';

/** Human triage of one reviewer finding. The latest decision for a finding wins. */
export interface FindingDecision {
  findingId: string;
  round: RoundNo;
  state: FindingDecisionState;
  /** Optional message passed to the agent with the next feedback package. */
  note?: string;
  by: Actor;
  at: string;
}

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
  /** Human decision for the suggestion; apply also records a suggestion/applied outcome. */
  suggestionState?: SuggestionState;
  state: CommentState;
  replies: Reply[];
  anchors: Anchor[];
  outcomes: Outcome[];
  /** Last edit metadata; absent when the body has never been edited. */
  editedAt?: string;
  editedBy?: Actor;
  /** Soft-deletion marker. Deleted comments are hidden from feedback and visible only as tombstones. */
  deletedAt?: string;
  deletedBy?: Actor;
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

export type AgentStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'skipped';

/** Coverage of one changed file in a review round. */
export type CoverageStatus =
  | 'pending'
  | 'deep-reviewed'
  | 'light-reviewed'
  | 'manifest-only'
  | 'skipped'
  | 'deferred'
  | 'failed';

export interface FileCoverage {
  path: string;
  status: CoverageStatus;
  /** Why the file was not deep/light reviewed, when a reason applies. */
  reason?: string;
  /** Shard that owns the file, once review work has been assigned. */
  shardId?: string;
}

export interface CoverageTotals {
  files: number;
  byStatus: Record<CoverageStatus, number>;
}

/** Coverage ledger for every file in the review manifest. */
export interface ReviewCoverage {
  files: FileCoverage[];
  totals: CoverageTotals;
}

export interface AgentState {
  status: AgentStatus;
  jobId?: string;
  round?: RoundNo;
  startedAt?: string;
  error?: string;
  findings?: Finding[];
  /** Coverage ledger for the round; absent on legacy states. */
  coverage?: ReviewCoverage;
}

export interface ReviewState {
  id: ReviewId;
  title: string;
  repoRoot: string;
  status: ReviewStatus;
  createdAt: string;
  /** Set when the review first closes; absent while open and on legacy events. */
  closedAt?: string;
  /** Human or system actor that opened the review; absent on legacy events. */
  createdBy?: Actor;
  /** Initiating harness session, when created by an agent. Absent on legacy events. */
  initiator?: Initiator;
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
  /** Agent/harness claims after a fix round; independent from reviewer verification. */
  fixClaims?: FixClaimRecord[];
  /** Human triage of reviewer findings, in append order. Latest per finding wins. */
  findingDecisions?: FindingDecision[];
  /** Last metadata edit; absent when the review has never been edited. */
  updatedAt?: string;
  updatedBy?: Actor;
  /** Soft-deletion marker. Deleted reviews are hidden from lists and lookups. */
  deletedAt?: string;
  deletedBy?: Actor;
}

export interface ReviewSummary {
  id: ReviewId;
  title: string;
  repoRoot: string;
  status: ReviewStatus;
  createdAt: string;
  roundCount: number;
  commentCount: number;
  openCommentCount: number;
  /** Short base→head label for the latest round. */
  scope?: string;
  /** Actor that created the review. */
  author?: string;
  /** Comments currently claimed as not fixed by an agent. */
  notFixedCount?: number;
}

export interface FixClaimRecord {
  commentId: CommentId;
  status: FixStatus;
  evidence?: string;
  by: Actor;
  at: string;
}

export interface CreateReviewInput {
  title: string;
  repoRoot: string;
  actor: Actor;
  reviewer?: ReviewerConfig;
  initiator?: Initiator;
}

export interface AddCommentInput {
  body: string;
  path: string;
  side: Side;
  lineStart: number;
  lineEnd?: number;
  suggestion?: Suggestion;
}
