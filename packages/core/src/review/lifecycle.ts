import { createHash } from 'node:crypto';
import { captureAnchor, AnchorError, reanchor } from './anchors.js';
import { createEvent } from './events.js';
import { isFinalReviewReport } from './final.js';
import { createId } from './ids.js';
import { deriveOutcome } from './outcomes.js';
import { ReviewNotFoundError } from './store.js';
import type { ReviewStore } from './store.js';
import type {
  Actor,
  AddCommentInput,
  Anchor,
  Comment,
  CommentState,
  CreateReviewInput,
  FindingDecision,
  FindingDecisionState,
  ReviewId,
  ReviewState,
  ReviewSummary,
  Round,
} from './types.js';
import type { Snapshot } from '../types.js';
import type { Finding, ReviewerConfig } from '../reviewer/types.js';

export type ReviewLifecycleErrorCode =
  | 'not-found'
  | 'closed'
  | 'no-rounds'
  | 'duplicate-round'
  | 'round-order'
  | 'comment-not-found'
  | 'finding-not-found'
  | 'snapshot-mismatch'
  | 'invalid-input';

export class ReviewLifecycleError extends Error {
  readonly code: ReviewLifecycleErrorCode;
  readonly reviewId?: ReviewId;
  readonly commentId?: string;
  readonly findingId?: string;

  constructor(
    code: ReviewLifecycleErrorCode,
    message: string,
    details: { reviewId?: ReviewId; commentId?: string; findingId?: string } = {},
  ) {
    super(message);
    this.name = 'ReviewLifecycleError';
    this.code = code;
    if (details.reviewId !== undefined) this.reviewId = details.reviewId;
    if (details.commentId !== undefined) this.commentId = details.commentId;
    if (details.findingId !== undefined) this.findingId = details.findingId;
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

function requireLatestReport(
  state: ReviewState,
  reviewId: ReviewId,
): NonNullable<ReviewState['report']> {
  const latestRound = state.rounds.at(-1);
  if (state.report === undefined || latestRound === undefined) {
    throw new ReviewLifecycleError('invalid-input', `review has no reviewer report: ${reviewId}`, {
      reviewId,
    });
  }
  if (state.report.round !== latestRound.no) {
    throw new ReviewLifecycleError(
      'invalid-input',
      `reviewer report is from round ${state.report.round}, latest is ${latestRound.no}`,
      { reviewId },
    );
  }
  return state.report;
}

function requireFinalReport(
  state: ReviewState,
  reviewId: ReviewId,
): NonNullable<ReviewState['report']> {
  const report = requireLatestReport(state, reviewId);
  if (!isFinalReviewReport(state)) {
    throw new ReviewLifecycleError('invalid-input', `reviewer report is not final: ${reviewId}`, {
      reviewId,
    });
  }
  return report;
}

function normalizeDecisionInput(
  input: { state: FindingDecisionState; note?: string },
  reviewId: ReviewId,
): { state: FindingDecisionState; note?: string } {
  if (input.state !== 'accepted' && input.state !== 'dismissed') {
    throw new ReviewLifecycleError('invalid-input', `unknown finding decision: ${input.state}`, {
      reviewId,
    });
  }
  if (input.note !== undefined && typeof input.note !== 'string') {
    throw new ReviewLifecycleError('invalid-input', 'finding decision note must be a string', {
      reviewId,
    });
  }
  const note = input.note?.trim();
  if (note !== undefined && note.length > 4000) {
    throw new ReviewLifecycleError('invalid-input', 'finding decision note is too long', {
      reviewId,
    });
  }
  return {
    state: input.state,
    ...(note === undefined || note === '' ? {} : { note }),
  };
}

function requireFinding(
  report: NonNullable<ReviewState['report']>,
  findingId: string,
  reviewId: ReviewId,
): Finding {
  const finding = report.findings.find((candidate) => candidate.id === findingId);
  if (finding === undefined) {
    throw new ReviewLifecycleError('finding-not-found', `unknown finding: ${findingId}`, {
      reviewId,
      findingId,
    });
  }
  return finding;
}

function activeFindingComment(state: ReviewState, findingId: string): Comment | undefined {
  return state.comments.find(
    (comment) => comment.sourceFindingId === findingId && comment.deletedAt === undefined,
  );
}

function findingAnchor(finding: Finding, round: number, now: () => Date): Anchor {
  return {
    id: createId('anc', now),
    round,
    path: finding.file,
    side: 'new',
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    quote: finding.evidence,
    contextBefore: [],
    contextAfter: [],
    hunkHeader: '',
    contentHash: createHash('sha256').update(finding.evidence, 'utf8').digest('hex'),
    state: 'active',
  };
}

function transferredCommentBody(finding: Finding, note: string | undefined): string {
  return [
    finding.title,
    finding.rationale,
    finding.evidence.trim() === '' ? '' : `Evidence:\n${finding.evidence}`,
    note === undefined ? '' : `Note to the agent: ${note}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

function transferredComment(
  reviewId: ReviewId,
  finding: Finding,
  round: number,
  note: string | undefined,
  now: () => Date,
): Comment {
  return {
    id: createId('cmt', now),
    reviewId,
    createdAt: now().toISOString(),
    author: { name: 'AI', kind: 'agent' },
    body: transferredCommentBody(finding, note),
    ...(finding.suggestion === undefined
      ? {}
      : { suggestion: structuredClone(finding.suggestion) }),
    state: 'open',
    replies: [],
    anchors: [findingAnchor(finding, round, now)],
    outcomes: [],
    sourceFindingId: finding.id,
  };
}

interface DecisionTransfer {
  comment?: Comment;
  deletedCommentId?: string;
  commentId?: string;
}

function decisionTransfer(
  state: ReviewState,
  reviewId: ReviewId,
  finding: Finding,
  round: number,
  decisionState: FindingDecisionState,
  note: string | undefined,
  now: () => Date,
): DecisionTransfer {
  const existing = activeFindingComment(state, finding.id);
  if (decisionState === 'accepted') {
    if (existing !== undefined) return { commentId: existing.id };
    const comment = transferredComment(reviewId, finding, round, note, now);
    return { comment, commentId: comment.id };
  }
  if (existing === undefined) return {};
  return { deletedCommentId: existing.id, commentId: existing.id };
}

function hasDecision(state: ReviewState, findingId: string, round: number): boolean {
  return (state.findingDecisions ?? []).some(
    (decision) => decision.round === round && decision.findingId === findingId,
  );
}

export interface RefreshResult {
  round: Round;
  comments: Comment[];
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
      createdBy: input.actor,
      ...(input.initiator === undefined ? {} : { initiator: input.initiator }),
      rounds: [],
      comments: [],
      version: 0,
      ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
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
    const target = findComment(state, commentId);
    if (target.deletedAt !== undefined) {
      throw new ReviewLifecycleError('comment-not-found', `unknown comment: ${commentId}`, {
        reviewId,
        commentId,
      });
    }
    if (body.trim() === '') {
      throw new ReviewLifecycleError('invalid-input', 'reply body must be non-empty', { reviewId });
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

  async editComment(
    reviewId: ReviewId,
    commentId: string,
    body: string,
    actor: Actor,
  ): Promise<Comment> {
    const state = await this.requireOpen(reviewId);
    const comment = findComment(state, commentId);
    if (comment.deletedAt !== undefined) {
      throw new ReviewLifecycleError('comment-not-found', `unknown comment: ${commentId}`, {
        reviewId,
        commentId,
      });
    }
    const text = body.trim();
    if (text === '') {
      throw new ReviewLifecycleError('invalid-input', 'comment body must be non-empty', {
        reviewId,
        commentId,
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'comment/edited',
        actor,
        data: { commentId, body: text },
        now: this.now,
      }),
    );
    return findComment(await this.get(reviewId), commentId);
  }

  async deleteComment(reviewId: ReviewId, commentId: string, actor: Actor): Promise<Comment> {
    const state = await this.get(reviewId);
    if (state.deletedAt !== undefined) {
      throw new ReviewLifecycleError('not-found', `review not found: ${reviewId}`, { reviewId });
    }
    const comment = findComment(state, commentId);
    if (comment.deletedAt !== undefined) return comment;
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'comment/deleted',
        actor,
        data: { commentId },
        now: this.now,
      }),
    );
    return findComment(await this.get(reviewId), commentId);
  }

  async setCommentState(
    reviewId: ReviewId,
    commentId: string,
    state: CommentState,
    actor: Actor,
  ): Promise<Comment> {
    const review = await this.requireOpen(reviewId);
    const comment = findComment(review, commentId);
    if (comment.deletedAt !== undefined) {
      throw new ReviewLifecycleError('comment-not-found', `unknown comment: ${commentId}`, {
        reviewId,
        commentId,
      });
    }
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

  async decideFinding(
    reviewId: ReviewId,
    findingId: string,
    input: { state: FindingDecisionState; note?: string },
    actor: Actor,
  ): Promise<FindingDecision> {
    const normalized = normalizeDecisionInput(input, reviewId);
    const state = await this.requireOpen(reviewId);
    const report = requireFinalReport(state, reviewId);
    const finding = requireFinding(report, findingId, reviewId);
    const at = this.now().toISOString();
    const transfer = decisionTransfer(
      state,
      reviewId,
      finding,
      report.round,
      normalized.state,
      normalized.note,
      this.now,
    );

    const decision: FindingDecision = {
      findingId,
      round: report.round,
      state: normalized.state,
      ...(normalized.note === undefined ? {} : { note: normalized.note }),
      ...(transfer.commentId === undefined ? {} : { commentId: transfer.commentId }),
      by: actor,
      at,
    };
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'finding/decision',
        actor,
        data: {
          decision,
          ...(transfer.comment === undefined ? {} : { comment: transfer.comment }),
          ...(transfer.deletedCommentId === undefined
            ? {}
            : { deletedCommentId: transfer.deletedCommentId }),
        },
        now: this.now,
      }),
    );
    return decision;
  }

  /**
   * Records a decision only when the finding has no decision for the same
   * report round. The existence check and append share the store's per-review
   * critical section, so two concurrent bulk requests cannot both win.
   * Returns null when another writer decided the finding first.
   */
  async decideFindingIfUndecided(
    reviewId: ReviewId,
    findingId: string,
    input: { state: FindingDecisionState },
    actor: Actor,
  ): Promise<FindingDecision | null> {
    const normalized = normalizeDecisionInput(input, reviewId);
    const state = await this.requireOpen(reviewId);
    const report = requireFinalReport(state, reviewId);
    const finding = requireFinding(report, findingId, reviewId);
    const at = this.now().toISOString();
    const transfer = decisionTransfer(
      state,
      reviewId,
      finding,
      report.round,
      normalized.state,
      normalized.note,
      this.now,
    );

    const decision: FindingDecision = {
      findingId,
      round: report.round,
      state: normalized.state,
      ...(transfer.commentId === undefined ? {} : { commentId: transfer.commentId }),
      by: actor,
      at,
    };
    const appended = await this.store.appendIf(
      reviewId,
      createEvent({
        reviewId,
        type: 'finding/decision',
        actor,
        data: {
          decision,
          ...(transfer.comment === undefined ? {} : { comment: transfer.comment }),
          ...(transfer.deletedCommentId === undefined
            ? {}
            : { deletedCommentId: transfer.deletedCommentId }),
        },
        now: this.now,
      }),
      (current) => {
        if (current.deletedAt !== undefined) {
          throw new ReviewLifecycleError('not-found', `review not found: ${reviewId}`, {
            reviewId,
          });
        }
        if (current.status === 'closed') {
          throw new ReviewLifecycleError('closed', `review is closed: ${reviewId}`, { reviewId });
        }
        const currentReport = requireFinalReport(current, reviewId);
        if (currentReport.round !== decision.round) {
          throw new ReviewLifecycleError(
            'invalid-input',
            `reviewer report is from round ${currentReport.round}, expected ${decision.round}`,
            { reviewId },
          );
        }
        requireFinding(currentReport, findingId, reviewId);
        return !hasDecision(current, findingId, decision.round);
      },
    );
    return appended === null ? null : decision;
  }

  /**
   * Materializes a comment for accepted findings that predate automatic
   * transfer. It is idempotent: an active source comment suppresses a second
   * append, and `appendIf` re-checks the current state inside the review lock.
   */
  async transferAcceptedFindings(reviewId: ReviewId, actor: Actor): Promise<Comment[]> {
    const state = await this.get(reviewId);
    if (state.deletedAt !== undefined || !isFinalReviewReport(state)) return [];
    const report = state.report;
    if (report === undefined) return [];
    const latest = new Map<string, FindingDecision>();
    for (const decision of state.findingDecisions ?? []) {
      if (decision.round === report.round) latest.set(decision.findingId, decision);
    }
    const accepted = new Set(
      [...latest.values()]
        .filter((decision) => decision.state === 'accepted')
        .map((decision) => decision.findingId),
    );
    const transferred: Comment[] = [];
    for (const finding of report.findings) {
      if (!accepted.has(finding.id) || activeFindingComment(state, finding.id) !== undefined) {
        continue;
      }
      const note = latest.get(finding.id)?.note;
      const comment = transferredComment(reviewId, finding, report.round, note, this.now);
      const appended = await this.store.appendIf(
        reviewId,
        createEvent({
          reviewId,
          type: 'comment/added',
          actor,
          data: { comment },
          now: this.now,
        }),
        (current) => {
          if (current.deletedAt !== undefined) return false;
          if (!isFinalReviewReport(current) || current.report?.round !== report.round) {
            return false;
          }
          const decision = [...(current.findingDecisions ?? [])]
            .reverse()
            .find(
              (candidate) => candidate.round === report.round && candidate.findingId === finding.id,
            );
          return (
            decision?.state === 'accepted' &&
            activeFindingComment(current, finding.id) === undefined
          );
        },
      );
      if (appended !== null) transferred.push(comment);
    }
    return transferred;
  }

  async updateReview(
    reviewId: ReviewId,
    input: { title?: string; reviewer?: ReviewerConfig },
    actor: Actor,
  ): Promise<ReviewState> {
    await this.requireOpen(reviewId);
    const title = input.title?.trim();
    if (title === undefined && input.reviewer === undefined) {
      throw new ReviewLifecycleError('invalid-input', 'review update is empty', { reviewId });
    }
    if (title !== undefined && title === '') {
      throw new ReviewLifecycleError('invalid-input', 'review title must be non-empty', {
        reviewId,
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'review/updated',
        actor,
        data: {
          ...(title === undefined ? {} : { title }),
          ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
        },
        now: this.now,
      }),
    );
    return this.get(reviewId);
  }

  async deleteReview(reviewId: ReviewId, actor: Actor, reason?: string): Promise<ReviewState> {
    const state = await this.get(reviewId);
    if (state.deletedAt !== undefined) return state;
    if (reason !== undefined && typeof reason !== 'string') {
      throw new ReviewLifecycleError('invalid-input', 'delete reason must be a string', {
        reviewId,
      });
    }
    await this.store.append(
      reviewId,
      createEvent({
        reviewId,
        type: 'review/deleted',
        actor,
        data: reason === undefined || reason.trim() === '' ? {} : { reason: reason.trim() },
        now: this.now,
      }),
    );
    return this.get(reviewId);
  }

  async close(
    reviewId: ReviewId,
    verdict: 'approved' | 'closed',
    actor: Actor,
  ): Promise<ReviewState> {
    const state = await this.get(reviewId);
    if (state.deletedAt !== undefined) {
      throw new ReviewLifecycleError('not-found', `review not found: ${reviewId}`, { reviewId });
    }
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

  async refresh(reviewId: ReviewId, snapshot: Snapshot, actor: Actor): Promise<RefreshResult> {
    const state = await this.requireOpen(reviewId);
    const round = await this.addRound(reviewId, snapshot, actor);
    const comments = structuredClone(state.comments);

    for (const comment of comments) {
      const previous = comment.anchors.at(-1);
      if (previous === undefined) continue;
      const anchor = reanchor(previous, snapshot, {
        round: round.no,
        id: createId('anc', this.now),
        ...(comment.suggestion === undefined
          ? {}
          : { fallbackQuote: comment.suggestion.replacement }),
      });
      const outcome = deriveOutcome(previous, anchor, snapshot, comment.suggestion);
      await this.store.append(
        reviewId,
        createEvent({
          reviewId,
          type: 'comment/anchor',
          actor,
          data: { commentId: comment.id, anchor, outcome },
          now: this.now,
        }),
      );
      const index = comment.anchors.findIndex((candidate) => candidate.round === anchor.round);
      if (index < 0) comment.anchors.push(anchor);
      else comment.anchors[index] = anchor;
      comment.outcomes.push(outcome);
    }

    return { round, comments };
  }

  private async requireOpen(reviewId: ReviewId): Promise<ReviewState> {
    const state = await this.get(reviewId);
    if (state.deletedAt !== undefined) {
      throw new ReviewLifecycleError('not-found', `review not found: ${reviewId}`, { reviewId });
    }
    if (state.status === 'closed') {
      throw new ReviewLifecycleError('closed', `review is closed: ${reviewId}`, { reviewId });
    }
    return state;
  }

  private findComment(state: ReviewState, commentId: string): Comment {
    return findComment(state, commentId);
  }
}
