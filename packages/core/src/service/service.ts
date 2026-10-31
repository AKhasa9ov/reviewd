import { createHash } from 'node:crypto';
import { createId } from '../review/ids.js';
import { ReviewNotFoundError } from '../review/store.js';
import type { GcResult } from '../review/store.js';
import { ReviewLifecycleError } from '../review/lifecycle.js';
import { createEvent } from '../review/events.js';
import type { ReviewEvent } from '../review/events.js';
import type {
  AddCommentInput,
  CommentState,
  FindingDecision,
  ReviewId,
  ReviewState,
  ReviewSummary,
  Round,
  RoundNo,
  SubmissionRecord,
} from '../review/types.js';
import type { DiffScope, Snapshot } from '../types.js';
import { manifestFromSnapshot } from '../diff/manifest.js';
import { CommandReviewer } from '../reviewer/command.js';
import { FakeReviewer } from '../reviewer/fake.js';
import { ReviewerError } from '../reviewer/types.js';
import type { IdPrefix } from '../review/ids.js';
import type {
  AgentReport,
  ReviewerBackend,
  ReviewerConfig,
  ReviewerJob,
  ReviewerReport,
} from '../reviewer/types.js';
import { validateReport, ReportValidationError } from '../reviewer/validate.js';
import { isFinalReviewReport } from '../review/final.js';
import { buildFeedback } from './feedback.js';
import { ReviewError } from './types.js';
import type {
  BulkFindingDecisionInput,
  BulkFindingDecisionView,
  CallContext,
  TransferAcceptedFindingsView,
  CommentEditInput,
  CommentView,
  FindingDecisionInput,
  FindingDecisionView,
  Page,
  ReviewFilter,
  ReviewServiceImplDeps,
  ReviewService,
  ReviewUpdateInput,
  ReviewView,
  ServiceCreateInput,
  ServiceSnapshotView,
  SubmissionView,
  SubmitInput,
  SuggestionActionInput,
  FixStatusInput,
  RefreshInput,
  LatestFeedbackView,
} from './types.js';

const IDEMPOTENCY_LIMIT = 1000;
const MAX_BULK_FINDING_IDS = 1000;
const VERDICTS = new Set(['approve', 'request-changes', 'comment']);

function normalizeBulkFindingIds(ids: unknown, reviewId: ReviewId): Set<string> {
  if (!Array.isArray(ids)) {
    throw new ReviewError('validation', 'findingIds must be an array', { id: reviewId });
  }
  if (ids.length === 0) {
    throw new ReviewError('validation', 'findingIds must not be empty', { id: reviewId });
  }
  if (ids.length > MAX_BULK_FINDING_IDS) {
    throw new ReviewError(
      'validation',
      `findingIds must contain at most ${MAX_BULK_FINDING_IDS} entries`,
      { id: reviewId },
    );
  }
  const selected = new Set<string>();
  for (const findingId of ids) {
    if (typeof findingId !== 'string' || findingId.trim() === '') {
      throw new ReviewError('validation', 'findingIds must contain non-empty strings', {
        id: reviewId,
      });
    }
    selected.add(findingId);
  }
  return selected;
}

function bulkSelectionKey(selected: Set<string> | null): string {
  if (selected === null) return 'all';
  return createHash('sha256')
    .update([...selected].sort().join('\u0000'))
    .digest('hex');
}
const COMMENT_STATES = new Set<CommentState>(['open', 'resolved', 'dismissed']);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function agentIsActive(review: ReviewState): boolean {
  return review.agent?.status === 'queued' || review.agent?.status === 'running';
}

function scopeFromSnapshot(snapshot: Snapshot): DiffScope {
  const scope = snapshot.scope;
  if (scope.kind === 'worktree') return { kind: 'worktree', baseRef: scope.baseRef ?? 'HEAD' };
  if (scope.kind === 'commit') {
    return { kind: 'commit', sha: scope.headSha ?? scope.baseSha };
  }
  if (scope.kind === 'commits') {
    return { kind: 'commits', shas: scope.shas ?? [] };
  }
  return {
    kind: 'range',
    baseRef: scope.baseSha,
    headRef: scope.headRef ?? scope.headSha ?? 'HEAD',
  };
}

function scopeKey(scope: DiffScope): string {
  if (scope.kind === 'range') {
    return `range:${scope.baseRef}\u0000${scope.headRef}\u0000${scope.twoDot === true}`;
  }
  if (scope.kind === 'worktree') return `worktree:${scope.baseRef}`;
  if (scope.kind === 'commit') return `commit:${scope.sha}`;
  return `commits:${scope.shas.join('\u0000')}`;
}

function assertContext(ctx: CallContext): void {
  if (ctx === undefined || ctx.actor === undefined) {
    throw new ReviewError('validation', 'CallContext with an actor is required');
  }
}

function validateInitiator(value: ServiceCreateInput['initiator']): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null) {
    throw new ReviewError('validation', 'initiator must be an object');
  }
  if (typeof value.harness !== 'string' || value.harness.trim() === '') {
    throw new ReviewError('validation', 'initiator.harness must be a non-empty string');
  }
  if (typeof value.sessionId !== 'string' || value.sessionId.trim() === '') {
    throw new ReviewError('validation', 'initiator.sessionId must be a non-empty string');
  }
  for (const field of ['cwd', 'agentPreset'] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && (typeof fieldValue !== 'string' || fieldValue.trim() === '')) {
      throw new ReviewError('validation', `initiator.${field} must be a non-empty string`);
    }
  }
}

function validateReviewer(config: ReviewerConfig): void {
  if (!['fake', 'command', 'none', 'worker'].includes(config.backend)) {
    throw new ReviewError('validation', `unknown reviewer backend: ${config.backend}`);
  }
  if (config.backend === 'command') {
    if (!Array.isArray(config.command) || config.command.length === 0) {
      throw new ReviewError('validation', 'command reviewer requires a non-empty argv array');
    }
    if (config.command.some((part) => typeof part !== 'string' || part === '')) {
      throw new ReviewError(
        'validation',
        'command reviewer argv entries must be non-empty strings',
      );
    }
  }
}

function mapLifecycleCode(code: ReviewLifecycleError['code']): ReviewError['code'] {
  switch (code) {
    case 'not-found':
    case 'comment-not-found':
    case 'finding-not-found':
      return 'not-found';
    case 'closed':
    case 'duplicate-round':
    case 'round-order':
      return 'conflict';
    case 'no-rounds':
    case 'snapshot-mismatch':
    case 'invalid-input':
      return 'validation';
  }
}

/**
 * Application service for reviews. Transports map requests to these methods;
 * every mutation is serialized by the store and idempotent by request id.
 */
export class ReviewServiceImpl implements ReviewService {
  private readonly lifecycle: ReviewServiceImplDeps['lifecycle'];
  private readonly store: ReviewServiceImplDeps['store'];
  private readonly snapshots: ReviewServiceImplDeps['snapshots'];
  private readonly now: () => Date;
  private readonly newId: (prefix: IdPrefix) => string;
  private readonly backendFactory?: ReviewServiceImplDeps['backendFactory'];
  private readonly runGit?: ReviewServiceImplDeps['runGit'];
  private readonly idempotencyLimit: number;
  private readonly results = new Map<string, unknown>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly running = new Set<ReviewId>();
  private readonly active = new Map<
    ReviewId,
    { controller: AbortController; backend?: ReviewerBackend }
  >();

  constructor(deps: ReviewServiceImplDeps) {
    this.lifecycle = deps.lifecycle;
    this.store = deps.store;
    this.snapshots = deps.snapshots;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? ((prefix) => createId(prefix, this.now));
    this.backendFactory = deps.backendFactory;
    this.runGit = deps.runGit;
    this.idempotencyLimit = deps.idempotencyLimit ?? IDEMPOTENCY_LIMIT;
  }

  async create(input: ServiceCreateInput, ctx: CallContext): Promise<ReviewView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.title !== 'string' || input.title.trim() === '') {
          throw new ReviewError('validation', 'title must be non-empty');
        }
        if (typeof input.repoRoot !== 'string' || input.repoRoot.trim() === '') {
          throw new ReviewError('validation', 'repoRoot must be non-empty');
        }
        if (typeof input.scope !== 'object' || input.scope === null) {
          throw new ReviewError('validation', 'scope is required');
        }
        const reviewer = input.reviewer ?? { backend: 'none' as const };
        validateReviewer(reviewer);
        validateInitiator(input.initiator);

        let snapshot: Snapshot;
        try {
          snapshot = await this.snapshots.build({ repoRoot: input.repoRoot, scope: input.scope });
        } catch (error) {
          throw this.translate(error);
        }

        let state: ReviewState;
        try {
          state = await this.lifecycle.create({
            title: input.title,
            repoRoot: input.repoRoot,
            actor: ctx.actor,
            reviewer,
            ...(input.initiator === undefined ? {} : { initiator: input.initiator }),
          });
          await this.lifecycle.addRound(state.id, snapshot, ctx.actor);
        } catch (error) {
          throw this.translate(error);
        }
        return await this.get(state.id);
      },
      'reviews.create',
      ctx.requestId,
    );
  }

  async updateReview(
    id: ReviewId,
    input: ReviewUpdateInput,
    ctx: CallContext,
  ): Promise<ReviewView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (
          input.title === undefined &&
          input.reviewer === undefined &&
          input.scope === undefined
        ) {
          throw new ReviewError('validation', 'review update is empty');
        }
        if (input.title !== undefined && typeof input.title !== 'string') {
          throw new ReviewError('validation', 'title must be a string');
        }
        if (input.title !== undefined && input.title.trim() === '') {
          throw new ReviewError('validation', 'title must be non-empty');
        }
        if (input.reviewer !== undefined) validateReviewer(input.reviewer);
        const review = await this.requireReview(id);
        if (review.status === 'closed') {
          throw new ReviewError('conflict', `review is closed: ${id}`, { id });
        }

        let snapshot: Snapshot | undefined;
        if (input.scope !== undefined) {
          if (this.running.has(id) || agentIsActive(review)) {
            throw new ReviewError('agent-busy', `a reviewer is active for ${id}`, { id });
          }
          const latest = await this.latestSnapshotOrThrow(review);
          if (scopeKey(input.scope) !== scopeKey(scopeFromSnapshot(latest))) {
            try {
              snapshot = await this.snapshots.build({
                repoRoot: review.repoRoot,
                scope: input.scope,
              });
            } catch (error) {
              throw this.translate(error);
            }
          }
        }

        if (input.title !== undefined || input.reviewer !== undefined) {
          try {
            await this.lifecycle.updateReview(
              id,
              {
                ...(input.title === undefined ? {} : { title: input.title }),
                ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
              },
              ctx.actor,
            );
          } catch (error) {
            throw this.translate(error);
          }
        }
        if (snapshot !== undefined) {
          try {
            await this.lifecycle.refresh(id, snapshot, ctx.actor);
          } catch (error) {
            throw this.translate(error);
          }
        }
        return await this.get(id);
      },
      `review.update:${id}`,
      ctx.requestId,
    );
  }

  async deleteReview(id: ReviewId, ctx: CallContext, reason?: string): Promise<void> {
    assertContext(ctx);
    await this.idempotent(
      async () => {
        let review: ReviewState;
        try {
          review = await this.lifecycle.get(id);
        } catch (error) {
          throw this.translate(error);
        }
        if (review.deletedAt !== undefined) return;
        const active = this.active.get(id);
        active?.controller.abort();
        active?.backend?.cancel?.();
        try {
          await this.lifecycle.deleteReview(id, ctx.actor, reason);
        } catch (error) {
          throw this.translate(error);
        }
      },
      `review.delete:${id}`,
      ctx.requestId,
    );
  }

  async get(id: ReviewId): Promise<ReviewView> {
    let review: ReviewState;
    try {
      review = await this.lifecycle.get(id);
    } catch (error) {
      throw this.translate(error);
    }
    if (review.deletedAt !== undefined) {
      throw new ReviewError('not-found', `review not found: ${id}`, { id });
    }
    const latestSnapshot = await this.readLatestSnapshot(review);
    return {
      review,
      latestSnapshot,
      report: review.report ?? null,
    };
  }

  async list(filter: ReviewFilter = {}): Promise<Page<ReviewSummary>> {
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 50), 1), 100);
    const offset = Math.max(Math.trunc(filter.offset ?? 0), 0);
    let items: ReviewSummary[];
    try {
      items = await this.lifecycle.list();
    } catch (error) {
      throw this.translate(error);
    }
    if (filter.status !== undefined) {
      items = items.filter((item) => item.status === filter.status);
    }
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
    };
  }

  async snapshot(id: ReviewId, round: RoundNo, file?: string): Promise<ServiceSnapshotView> {
    const review = await this.requireReview(id);
    const target = review.rounds.find((item) => item.no === round);
    if (target === undefined) {
      throw new ReviewError('not-found', `round ${round} not found for ${id}`, { id, round });
    }
    let snapshot: Snapshot;
    try {
      snapshot = await this.store.readSnapshot(target.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
    if (file !== undefined) {
      const selected = snapshot.files.find((item) => item.path === file);
      if (selected === undefined) {
        throw new ReviewError('not-found', `file not found in round ${round}: ${file}`, {
          id,
          round,
          file,
        });
      }
      // The file query bounds the rendered view, not the manifest or its totals.
      snapshot = { ...snapshot, files: [clone(selected)] };
    }
    return { snapshot, round, ...(file === undefined ? {} : { file }) };
  }

  async addComment(id: ReviewId, input: AddCommentInput, ctx: CallContext): Promise<CommentView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.body !== 'string' || input.body.trim() === '') {
          throw new ReviewError('validation', 'comment body must be non-empty');
        }
        try {
          const comment = await this.lifecycle.addComment(id, input, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.add:${id}`,
      ctx.requestId,
    );
  }

  async editComment(
    id: ReviewId,
    commentId: string,
    input: CommentEditInput,
    ctx: CallContext,
  ): Promise<CommentView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.body !== 'string' || input.body.trim() === '') {
          throw new ReviewError('validation', 'comment body must be non-empty');
        }
        try {
          const comment = await this.lifecycle.editComment(id, commentId, input.body, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.edit:${id}:${commentId}`,
      ctx.requestId,
    );
  }

  async deleteComment(id: ReviewId, commentId: string, ctx: CallContext): Promise<CommentView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        try {
          const comment = await this.lifecycle.deleteComment(id, commentId, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.delete:${id}:${commentId}`,
      ctx.requestId,
    );
  }

  async reply(
    id: ReviewId,
    commentId: string,
    input: { body: string },
    ctx: CallContext,
  ): Promise<CommentView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (typeof input.body !== 'string' || input.body.trim() === '') {
          throw new ReviewError('validation', 'reply body must be non-empty');
        }
        try {
          const comment = await this.lifecycle.reply(id, commentId, input.body, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.reply:${id}:${commentId}`,
      ctx.requestId,
    );
  }

  async setCommentState(
    id: ReviewId,
    commentId: string,
    state: CommentState,
    ctx: CallContext,
  ): Promise<CommentView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (!COMMENT_STATES.has(state)) {
          throw new ReviewError('validation', `unknown comment state: ${String(state)}`);
        }
        try {
          const comment = await this.lifecycle.setCommentState(id, commentId, state, ctx.actor);
          return { comment };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `comment.state:${id}:${commentId}`,
      ctx.requestId,
    );
  }

  async decideFinding(
    id: ReviewId,
    findingId: string,
    input: FindingDecisionInput,
    ctx: CallContext,
  ): Promise<FindingDecisionView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        try {
          const decision = await this.lifecycle.decideFinding(id, findingId, input, ctx.actor);
          return { decision };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `finding.decision:${id}:${findingId}`,
      ctx.requestId,
    );
  }

  async decideFindings(
    id: ReviewId,
    input: BulkFindingDecisionInput,
    ctx: CallContext,
  ): Promise<BulkFindingDecisionView> {
    assertContext(ctx);
    const selected =
      input.findingIds === undefined ? null : normalizeBulkFindingIds(input.findingIds, id);
    return await this.idempotent(
      async () => {
        if (input.state !== 'accepted' && input.state !== 'dismissed') {
          throw new ReviewError('validation', `unknown finding decision: ${String(input.state)}`, {
            id,
          });
        }

        let review: ReviewState;
        try {
          review = await this.lifecycle.get(id);
        } catch (error) {
          throw this.translate(error);
        }
        if (review.deletedAt !== undefined) {
          throw new ReviewError('not-found', `review not found: ${id}`, { id });
        }
        if (review.status === 'closed') {
          throw new ReviewError('conflict', `review is closed: ${id}`, { id });
        }

        const latestRound = review.rounds.at(-1);
        const report = review.report;
        if (report === undefined || latestRound === undefined) {
          throw new ReviewError('validation', `review has no reviewer report: ${id}`, { id });
        }
        if (report.round !== latestRound.no) {
          throw new ReviewError(
            'validation',
            `reviewer report is from round ${report.round}, latest is ${latestRound.no}`,
            { id },
          );
        }
        if (!isFinalReviewReport(review)) {
          throw new ReviewError('validation', `reviewer report is not final: ${id}`, { id });
        }

        const decided = new Set(
          (review.findingDecisions ?? [])
            .filter((decision) => decision.round === report.round)
            .map((decision) => decision.findingId),
        );
        const targets = report.findings.filter(
          (finding) =>
            finding.kind !== 'praise' &&
            !decided.has(finding.id) &&
            (selected === null || selected.has(finding.id)),
        );
        const decisions: FindingDecision[] = [];
        try {
          for (const finding of targets) {
            const decision = await this.lifecycle.decideFindingIfUndecided(
              id,
              finding.id,
              { state: input.state },
              ctx.actor,
            );
            if (decision !== null) decisions.push(decision);
          }
        } catch (error) {
          throw this.translate(error);
        }

        return {
          decisions,
          skipped:
            selected === null
              ? report.findings.length - decisions.length
              : selected.size - decisions.length,
        };
      },
      `finding.decisions:${id}:${input.state}:${bulkSelectionKey(selected)}`,
      ctx.requestId,
    );
  }

  async transferAcceptedFindings(
    id: ReviewId,
    ctx: CallContext,
  ): Promise<TransferAcceptedFindingsView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        try {
          const comments = await this.lifecycle.transferAcceptedFindings(id, ctx.actor);
          return { transferred: comments.length };
        } catch (error) {
          throw this.translate(error);
        }
      },
      `finding.transfer:${id}`,
      ctx.requestId,
    );
  }

  async events(id: ReviewId, after = 0): Promise<ReviewEvent[]> {
    if (!Number.isInteger(after) || after < 0) {
      throw new ReviewError('validation', 'after must be a non-negative integer');
    }
    // The event log outlives soft deletion: the SSE hub replays the delete event,
    // and GET /api/events guards visibility at the route level. latestFeedback()
    // still calls requireReview() to hide deleted reviews.
    try {
      return await this.store.events(id, after);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async suggestionAction(
    id: ReviewId,
    commentId: string,
    action: SuggestionActionInput['action'],
    ctx: CallContext,
  ): Promise<CommentView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (!['accept', 'decline', 'apply'].includes(action)) {
          throw new ReviewError('validation', `unknown suggestion action: ${String(action)}`);
        }
        const review = await this.requireReview(id);
        if (review.status === 'closed') {
          throw new ReviewError('conflict', `review is closed: ${id}`, { id });
        }
        const comment = review.comments.find((candidate) => candidate.id === commentId);
        if (comment === undefined) {
          throw new ReviewError('not-found', `unknown comment: ${commentId}`, { id, commentId });
        }
        if (comment.suggestion === undefined) {
          throw new ReviewError('validation', `comment has no suggestion: ${commentId}`, {
            id,
            commentId,
          });
        }
        if (action === 'apply') {
          const round = review.rounds.at(-1);
          if (round === undefined)
            throw new ReviewError('validation', `review has no rounds: ${id}`);
          try {
            await this.store.append(
              id,
              createEvent({
                reviewId: id,
                type: 'suggestion/applied',
                actor: ctx.actor,
                data: { commentId, round: round.no },
                now: this.now,
              }),
            );
          } catch (error) {
            throw this.translate(error);
          }
        } else {
          const state = action === 'accept' ? 'accepted' : 'declined';
          try {
            await this.store.append(
              id,
              createEvent({
                reviewId: id,
                type: 'suggestion/state',
                actor: ctx.actor,
                data: { commentId, state },
                now: this.now,
              }),
            );
          } catch (error) {
            throw this.translate(error);
          }
        }
        return await this.getComment(id, commentId);
      },
      `comment.suggestion:${id}:${commentId}`,
      ctx.requestId,
    );
  }

  async refresh(id: ReviewId, input: RefreshInput, ctx: CallContext): Promise<ReviewView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        const review = await this.requireReview(id);
        if (review.status === 'closed') {
          throw new ReviewError('conflict', `review is closed: ${id}`, { id });
        }
        if (this.running.has(id) || agentIsActive(review)) {
          throw new ReviewError('agent-busy', `a reviewer is active for ${id}`, { id });
        }
        const latest = await this.latestSnapshotOrThrow(review);
        const scope = input.scope ?? scopeFromSnapshot(latest);
        let snapshot: Snapshot;
        try {
          snapshot = await this.snapshots.build({ repoRoot: review.repoRoot, scope });
        } catch (error) {
          throw this.translate(error);
        }
        try {
          await this.lifecycle.refresh(id, snapshot, ctx.actor);
        } catch (error) {
          throw this.translate(error);
        }
        return await this.get(id);
      },
      `review.refresh:${id}`,
      ctx.requestId,
    );
  }

  async close(id: ReviewId, verdict: 'approved' | 'closed', ctx: CallContext): Promise<ReviewView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (verdict !== 'approved' && verdict !== 'closed') {
          throw new ReviewError('validation', `unknown close verdict: ${String(verdict)}`);
        }
        try {
          await this.lifecycle.close(id, verdict, ctx.actor);
        } catch (error) {
          throw this.translate(error);
        }
        return await this.get(id);
      },
      `review.close:${id}`,
      ctx.requestId,
    );
  }

  async claimFixStatus(id: ReviewId, input: FixStatusInput, ctx: CallContext): Promise<void> {
    assertContext(ctx);
    await this.idempotent(
      async () => {
        if (!Array.isArray(input.items) || input.items.length === 0) {
          throw new ReviewError('validation', 'items must be a non-empty array');
        }
        const review = await this.requireReview(id);
        if (review.status === 'closed') {
          throw new ReviewError('conflict', `review is closed: ${id}`, { id });
        }
        const known = new Set(review.comments.map((comment) => comment.id));
        const claims = input.items.map((item) => {
          if (!['fixed', 'not-fixed', 'unclear'].includes(item.status)) {
            throw new ReviewError('validation', `unknown fix status: ${String(item.status)}`);
          }
          if (!known.has(item.commentId)) {
            throw new ReviewError('not-found', `unknown comment: ${item.commentId}`, {
              id,
              commentId: item.commentId,
            });
          }
          if (item.evidence !== undefined && typeof item.evidence !== 'string') {
            throw new ReviewError('validation', 'evidence must be a string');
          }
          return {
            commentId: item.commentId,
            status: item.status,
            ...(item.evidence === undefined ? {} : { evidence: item.evidence }),
            by: ctx.actor,
            at: this.now().toISOString(),
          };
        });
        await this.store.append(
          id,
          createEvent({
            reviewId: id,
            type: 'fix/claim',
            actor: ctx.actor,
            data: { claims },
            now: this.now,
          }),
        );
      },
      `review.fix-status:${id}`,
      ctx.requestId,
    );
  }

  async latestFeedback(id: ReviewId): Promise<LatestFeedbackView | null> {
    await this.requireReview(id);
    const events = await this.events(id, 0);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== 'review/submitted') continue;
      return {
        submission: event.data.submission,
        feedback: event.data.feedback as LatestFeedbackView['feedback'],
      };
    }
    return null;
  }

  async gc(olderThanDays: number): Promise<GcResult> {
    const result = await this.store.gc(olderThanDays, this.now());
    this.results.clear();
    return result;
  }

  async submit(id: ReviewId, input: SubmitInput, ctx: CallContext): Promise<SubmissionView> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (!VERDICTS.has(input.verdict)) {
          throw new ReviewError('validation', `unknown verdict: ${String(input.verdict)}`);
        }
        if (input.summary !== undefined && typeof input.summary !== 'string') {
          throw new ReviewError('validation', 'summary must be a string');
        }
        const review = await this.requireReview(id);
        if (review.status === 'closed') {
          throw new ReviewError('conflict', `review is closed: ${id}`, { id });
        }
        const round = review.rounds.at(-1);
        if (round === undefined) {
          throw new ReviewError('validation', `review has no rounds: ${id}`, { id });
        }
        if ((review.submissions ?? []).some((submission) => submission.round === round.no)) {
          throw new ReviewError('conflict', `round ${round.no} was already submitted`, {
            id,
            round: round.no,
          });
        }
        let snapshot: Snapshot;
        try {
          snapshot = await this.store.readSnapshot(round.snapshotId);
        } catch (error) {
          throw this.translate(error);
        }
        const report =
          review.report !== undefined && review.report.round === round.no ? review.report : null;
        const submissionId = this.newId('sub');
        const deliveryKey = `${id}:${round.no}:${submissionId}`;
        const feedback = buildFeedback({
          review,
          snapshot,
          report,
          round: round.no,
          verdict: input.verdict,
          deliveryKey,
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          ...(input.includeResolved === undefined
            ? {}
            : { includeResolved: input.includeResolved }),
        });
        const submission: SubmissionRecord = {
          submissionId,
          round: round.no,
          verdict: input.verdict,
          deliveryKey,
          createdAt: this.now().toISOString(),
        };
        try {
          await this.store.append(
            id,
            createEvent({
              reviewId: id,
              type: 'review/submitted',
              actor: ctx.actor,
              data: {
                submission,
                feedback: {
                  markdown: feedback.markdown,
                  json: feedback.json,
                  deliveryKey,
                },
              },
              now: this.now,
            }),
          );
        } catch (error) {
          throw this.translate(error);
        }
        return {
          reviewId: id,
          round: round.no,
          verdict: input.verdict,
          feedback,
          deliveryKey,
        };
      },
      `review.submit:${id}`,
      ctx.requestId,
    );
  }

  async runReviewer(id: ReviewId, ctx: CallContext): Promise<AgentReport> {
    assertContext(ctx);
    return await this.idempotent(
      async () => {
        if (this.running.has(id)) {
          throw new ReviewError('agent-busy', `a reviewer is already running for ${id}`, { id });
        }
        this.running.add(id);
        try {
          return await this.runReviewerOnce(id, ctx);
        } finally {
          this.running.delete(id);
        }
      },
      `review.run:${id}`,
      ctx.requestId,
    );
  }

  async cancelAgent(id: ReviewId, ctx: CallContext): Promise<void> {
    assertContext(ctx);
    const active = this.active.get(id);
    if (active === undefined) {
      const review = await this.requireReview(id);
      if (agentIsActive(review)) {
        throw new ReviewError('conflict', `reviewer is not owned by this service instance`, {
          id,
        });
      }
      return;
    }
    active.controller.abort();
    active.backend?.cancel?.();
  }

  private async runReviewerOnce(id: ReviewId, ctx: CallContext): Promise<AgentReport> {
    const review = await this.requireReview(id);
    if (review.status === 'closed') {
      throw new ReviewError('stale-review', `review is closed: ${id}`, { id });
    }
    if (agentIsActive(review)) {
      throw new ReviewError('agent-busy', `a reviewer is already running for ${id}`, { id });
    }
    const round = review.rounds.at(-1);
    if (round === undefined) {
      throw new ReviewError('validation', `review has no rounds: ${id}`, { id });
    }
    let snapshot: Snapshot;
    try {
      snapshot = await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }

    const config: ReviewerConfig = review.reviewer ?? { backend: 'none' };
    const job: ReviewerJob = {
      id: this.newId('job'),
      reviewId: id,
      round: round.no,
      kind: review.report === undefined ? 'initial' : 'verify',
      repoRoot: review.repoRoot,
      prompt: this.buildPrompt(review, round, snapshot),
      snapshot,
      manifest: manifestFromSnapshot(snapshot),
    };
    const controller = new AbortController();
    this.active.set(id, { controller });

    try {
      await this.store.append(
        id,
        createEvent({
          reviewId: id,
          type: 'agent/started',
          actor: ctx.actor,
          data: { jobId: job.id, round: round.no, backend: config.backend },
          now: this.now,
        }),
      );

      let raw: ReviewerReport;
      if (config.backend === 'none') {
        raw = {
          schemaVersion: 1,
          summary: 'Reviewer backend is none; review skipped.',
          riskLevel: 'low',
          findings: [],
          questions: [],
          tests: { ran: false, commands: [] },
          verification: [],
        };
      } else {
        let backend: ReviewerBackend;
        try {
          backend = this.backendFor(config);
        } catch (error) {
          throw this.translate(error);
        }
        this.active.set(id, { controller, backend });
        if (controller.signal.aborted) {
          throw new ReviewError('conflict', `reviewer was cancelled for ${id}`, { id });
        }
        raw = await backend.run(
          job,
          async (finding) => {
            await this.store.append(
              id,
              createEvent({
                reviewId: id,
                type: 'agent/finding',
                actor: ctx.actor,
                data: { finding, round: round.no },
                now: this.now,
              }),
            );
          },
          controller.signal,
        );
      }

      if (controller.signal.aborted) {
        throw new ReviewError('conflict', `reviewer was cancelled for ${id}`, { id });
      }
      const validation = validateReport(raw, { snapshot });
      const warnings = [...validation.warnings];
      if (raw.dirtyWorktree === true) warnings.push('dirty-worktree');
      const report: AgentReport = {
        ...validation.report,
        reviewId: id,
        round: round.no,
        backend: config.backend,
        rejected: validation.rejected,
        warnings,
        ...(raw.dirtyWorktree === true ? { dirtyWorktree: true } : {}),
        ...(config.backend === 'none' ? { skipped: true } : {}),
      };
      await this.store.append(
        id,
        createEvent({
          reviewId: id,
          type: 'agent/report',
          actor: ctx.actor,
          data: { report },
          now: this.now,
        }),
      );
      return report;
    } catch (error) {
      const reviewError =
        error instanceof ReviewError
          ? error
          : controller.signal.aborted
            ? new ReviewError('conflict', `reviewer was cancelled for ${id}`, { id })
            : new ReviewError('internal', (error as Error).message, { id });
      try {
        await this.store.append(
          id,
          createEvent({
            reviewId: id,
            type: 'agent/failed',
            actor: ctx.actor,
            data: { code: reviewError.code, message: reviewError.message },
            now: this.now,
          }),
        );
      } catch {
        // The original failure is more useful than a secondary log failure.
      }
      throw reviewError;
    } finally {
      this.active.delete(id);
    }
  }

  private backendFor(config: ReviewerConfig): ReviewerBackend {
    if (this.backendFactory !== undefined) return this.backendFactory(config);
    if (config.backend === 'fake') return new FakeReviewer();
    if (config.backend === 'command') {
      return new CommandReviewer({
        command: config.command ?? [],
        ...(this.runGit === undefined ? {} : { runGit: this.runGit }),
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
      });
    }
    throw new ReviewError('validation', `reviewer backend cannot run: ${config.backend}`);
  }

  private buildPrompt(review: ReviewState, round: Round, snapshot: Snapshot): string {
    const files = snapshot.files
      .map((file) => `- ${file.status} ${file.path} (+${file.added}/-${file.deleted})`)
      .join('\n');
    return [
      `# Independent code review: ${review.title}`,
      '',
      `Review: ${review.id}`,
      `Round: ${round.no}`,
      `Repository: ${review.repoRoot}`,
      `Scope: ${snapshot.scope.label} (${snapshot.scope.baseSha}..${snapshot.scope.headSha ?? 'worktree'})`,
      '',
      'You are a read-only reviewer. Do not modify files.',
      'Review the changes and surrounding code, run tests if useful, and report only actionable',
      'findings with file/line anchors and evidence. Return strict JSON (schemaVersion 1), or',
      'write it to output.json / a fenced json block.',
      '',
      '## Files',
      files,
      '',
      '## Instructions',
      '- Blockers and major issues first; no style nitpicks without impact.',
      '- Every finding needs file, lineStart/lineEnd, title, rationale and evidence.',
      '- Put product/intent questions in questions[], not findings[].',
      '- Verification entries use the supplied comment ids when this is a verify round.',
    ].join('\n');
  }

  private async readLatestSnapshot(review: ReviewState): Promise<Snapshot | null> {
    const round = review.rounds.at(-1);
    if (round === undefined) return null;
    try {
      return await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async getComment(id: ReviewId, commentId: string): Promise<CommentView> {
    const review = await this.requireReview(id);
    const comment = review.comments.find((candidate) => candidate.id === commentId);
    if (comment === undefined) {
      throw new ReviewError('not-found', `unknown comment: ${commentId}`, { id, commentId });
    }
    return { comment };
  }

  private async latestSnapshotOrThrow(review: ReviewState): Promise<Snapshot> {
    const round = review.rounds.at(-1);
    if (round === undefined) {
      throw new ReviewError('validation', `review has no rounds: ${review.id}`, { id: review.id });
    }
    try {
      return await this.store.readSnapshot(round.snapshotId);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async requireReview(id: ReviewId): Promise<ReviewState> {
    try {
      const review = await this.lifecycle.get(id);
      if (review.deletedAt !== undefined) {
        throw new ReviewError('not-found', `review not found: ${id}`, { id });
      }
      return review;
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async idempotent<T>(
    operation: () => Promise<T>,
    scope: string,
    requestId?: string,
  ): Promise<T> {
    if (requestId === undefined || requestId === '') return await operation();
    // The request id is only unique per operation (route and review), so a
    // client retry on a different route must not reuse another response.
    const key = `${scope}\u0000${requestId}`;
    if (this.results.has(key)) return clone(this.results.get(key) as T);
    const pending = this.inflight.get(key);
    if (pending !== undefined) return clone((await pending) as T);
    const run = operation();
    this.inflight.set(key, run);
    try {
      const result = await run;
      if (this.results.size >= this.idempotencyLimit) {
        const oldest = this.results.keys().next().value as string | undefined;
        if (oldest !== undefined) this.results.delete(oldest);
      }
      this.results.set(key, clone(result));
      return result;
    } finally {
      if (this.inflight.get(key) === run) this.inflight.delete(key);
    }
  }

  private translate(error: unknown): ReviewError {
    if (error instanceof ReviewError) return error;
    if (error instanceof ReviewLifecycleError) {
      return new ReviewError(mapLifecycleCode(error.code), error.message, {
        ...(error.reviewId === undefined ? {} : { reviewId: error.reviewId }),
        ...(error.commentId === undefined ? {} : { commentId: error.commentId }),
      });
    }
    if (error instanceof ReviewNotFoundError) {
      return new ReviewError('not-found', error.message, { reviewId: error.reviewId });
    }
    if (error instanceof ReviewerError || error instanceof ReportValidationError) {
      return new ReviewError('internal', error.message);
    }
    return new ReviewError('internal', (error as Error).message);
  }
}
