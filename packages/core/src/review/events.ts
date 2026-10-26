import type { AgentReport, Finding, ReviewerBackendKind } from '../reviewer/types.js';
import type {
  Actor,
  ActorKind,
  Anchor,
  Comment,
  CommentState,
  Outcome,
  Reply,
  ReviewState,
  Round,
  ReviewId,
  SubmissionRecord,
} from './types.js';
import { createId } from './ids.js';
import type { IdPrefix } from './ids.js';

export interface ReviewCreatedData {
  review: ReviewState;
}

export interface RoundCreatedData {
  round: Round;
}

export interface CommentAddedData {
  comment: Comment;
}

export interface CommentRepliedData {
  commentId: string;
  reply: Reply;
}

export interface CommentStateData {
  commentId: string;
  state: CommentState;
}

export interface CommentAnchorData {
  commentId: string;
  anchor: Anchor;
  outcome?: Outcome;
}

export interface SuggestionAppliedData {
  commentId: string;
  round: number;
  sha?: string;
  result?: string;
}

export interface ReviewClosedData {
  verdict: 'approved' | 'closed';
}

export interface ReviewSubmittedData {
  submission: SubmissionRecord;
  feedback: {
    markdown: string;
    json: unknown;
    deliveryKey: string;
  };
}

export interface AgentStartedData {
  jobId: string;
  round: number;
  backend: ReviewerBackendKind;
}

export interface AgentFindingData {
  finding: Finding;
  round: number;
}

export interface AgentReportData {
  report: AgentReport;
}

export interface AgentFailedData {
  code: string;
  message: string;
}

export interface ReviewEventDataMap {
  'review/created': ReviewCreatedData;
  'round/created': RoundCreatedData;
  'comment/added': CommentAddedData;
  'comment/replied': CommentRepliedData;
  'comment/state': CommentStateData;
  'comment/anchor': CommentAnchorData;
  'suggestion/applied': SuggestionAppliedData;
  'review/closed': ReviewClosedData;
  'review/submitted': ReviewSubmittedData;
  'agent/started': AgentStartedData;
  'agent/finding': AgentFindingData;
  'agent/report': AgentReportData;
  'agent/failed': AgentFailedData;
}

export type ReviewEventType = keyof ReviewEventDataMap;

export const REVIEW_EVENT_TYPES: readonly ReviewEventType[] = [
  'review/created',
  'round/created',
  'comment/added',
  'comment/replied',
  'comment/state',
  'comment/anchor',
  'suggestion/applied',
  'review/closed',
  'review/submitted',
  'agent/started',
  'agent/finding',
  'agent/report',
  'agent/failed',
];

export interface ReviewEventBase<T extends ReviewEventType = ReviewEventType> {
  v: 1;
  id: string;
  /** 1-based append position in the review's JSONL log. Older logs are backfilled on read. */
  seq?: number;
  reviewId: ReviewId;
  type: T;
  at: string;
  actor: Actor;
  data: ReviewEventDataMap[T];
}

export type ReviewEvent = {
  [T in ReviewEventType]: ReviewEventBase<T>;
}[ReviewEventType];

export interface CreateEventInput<T extends ReviewEventType> {
  reviewId: ReviewId;
  type: T;
  actor: Actor;
  data: ReviewEventDataMap[T];
  now?: () => Date;
  newId?: (prefix: IdPrefix) => string;
}

export type ReviewEventErrorCode =
  'unknown-type' | 'invalid-actor' | 'invalid-review-id' | 'invalid-event' | 'invalid-id';

export class ReviewEventError extends Error {
  readonly code: ReviewEventErrorCode;

  constructor(code: ReviewEventErrorCode, message: string) {
    super(message);
    this.name = 'ReviewEventError';
    this.code = code;
  }
}

const ACTOR_KINDS = new Set<ActorKind>(['human', 'agent', 'system']);
const EVENT_TYPE_SET = new Set<string>(REVIEW_EVENT_TYPES);

export function isReviewEventType(value: unknown): value is ReviewEventType {
  return typeof value === 'string' && EVENT_TYPE_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isActor(value: unknown): value is Actor {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.kind === 'string' &&
    ACTOR_KINDS.has(value.kind as ActorKind)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isEventId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('evt_') && value.length > 4;
}

export function createEvent<T extends ReviewEventType>(
  input: CreateEventInput<T>,
): ReviewEventBase<T> {
  if (!isReviewEventType(input.type)) {
    throw new ReviewEventError('unknown-type', `unknown event type: ${String(input.type)}`);
  }
  if (!isActor(input.actor)) {
    throw new ReviewEventError('invalid-actor', 'event actor must have a non-empty name');
  }
  if (typeof input.reviewId !== 'string' || input.reviewId.trim() === '') {
    throw new ReviewEventError('invalid-review-id', 'event reviewId must be non-empty');
  }
  if (!isRecord(input.data)) {
    throw new ReviewEventError('invalid-event', 'event data must be an object');
  }

  const now = input.now ?? (() => new Date());
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new ReviewEventError('invalid-event', 'event clock returned an invalid date');
  }

  const id = (input.newId ?? ((prefix: IdPrefix) => createId(prefix, now)))('evt');
  if (!isEventId(id)) {
    throw new ReviewEventError('invalid-id', 'event id must start with evt_');
  }

  return {
    v: 1,
    id,
    reviewId: input.reviewId,
    type: input.type,
    at: date.toISOString(),
    actor: input.actor,
    data: input.data,
  };
}

export function isReviewEvent(value: unknown): value is ReviewEvent {
  if (!isRecord(value)) return false;
  if (value.v !== 1) return false;
  if (!isReviewEventType(value.type)) return false;
  if (!isEventId(value.id)) return false;
  if (typeof value.reviewId !== 'string' || value.reviewId.trim() === '') return false;
  if (!isIsoTimestamp(value.at)) return false;
  if (!isActor(value.actor)) return false;
  if (!isRecord(value.data)) return false;
  if (
    value.seq !== undefined &&
    (typeof value.seq !== 'number' || !Number.isInteger(value.seq) || value.seq < 1)
  ) {
    return false;
  }
  return true;
}
