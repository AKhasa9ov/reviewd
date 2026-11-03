import { isCoverageComplete, promotePendingToLight, summarizeCoverage } from './coverage.js';
import type { ReviewEvent } from './events.js';
import type { AgentStatus, Comment, ReviewState } from './types.js';

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
      const expected = next.rounds.length + 1;
      if (event.data.round.no !== expected) {
        throw new ReviewFoldError(`round order: expected ${expected}, got ${event.data.round.no}`);
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
    case 'comment/edited': {
      const comment = findComment(next, event.data.commentId);
      comment.body = event.data.body;
      comment.editedAt = event.at;
      comment.editedBy = structuredClone(event.actor);
      break;
    }
    case 'comment/deleted': {
      const comment = findComment(next, event.data.commentId);
      comment.deletedAt = event.at;
      comment.deletedBy = structuredClone(event.actor);
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
    case 'suggestion/state': {
      findComment(next, event.data.commentId).suggestionState = event.data.state;
      break;
    }
    case 'fix/claim': {
      next.fixClaims ??= [];
      next.fixClaims.push(...structuredClone(event.data.claims));
      break;
    }
    case 'finding/decision': {
      next.findingDecisions ??= [];
      next.findingDecisions.push(structuredClone(event.data.decision));
      if (event.data.comment !== undefined) {
        const comment = event.data.comment;
        if (next.comments.some((candidate) => candidate.id === comment.id)) {
          throw new ReviewFoldError(`duplicate comment: ${comment.id}`);
        }
        next.comments.push(structuredClone(comment));
      }
      if (event.data.deletedCommentId !== undefined) {
        const comment = findComment(next, event.data.deletedCommentId);
        if (comment.deletedAt === undefined) {
          comment.deletedAt = event.at;
          comment.deletedBy = structuredClone(event.actor);
        }
      }
      break;
    }
    case 'review/updated': {
      if (event.data.title !== undefined) next.title = event.data.title;
      if (event.data.reviewer !== undefined) {
        next.reviewer = structuredClone(event.data.reviewer);
      }
      next.updatedAt = event.at;
      next.updatedBy = structuredClone(event.actor);
      break;
    }
    case 'review/deleted': {
      next.deletedAt = event.at;
      next.deletedBy = structuredClone(event.actor);
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
        comment.suggestionState = 'applied';
      }
      break;
    }
    case 'review/closed': {
      next.status = 'closed';
      next.closedAt ??= event.at;
      next.closeVerdict = event.data.verdict;
      break;
    }
    case 'review/submitted': {
      const submission = structuredClone(event.data.submission);
      next.submissions ??= [];
      if (next.submissions.some((item) => item.submissionId === submission.submissionId)) {
        throw new ReviewFoldError(`duplicate submission: ${submission.submissionId}`);
      }
      next.submissions.push(submission);
      if (submission.verdict === 'approve') {
        next.status = 'closed';
        next.closedAt ??= event.at;
        next.closeVerdict ??= 'approved';
      }
      break;
    }
    case 'agent/coverage': {
      next.agent = {
        status: 'queued',
        round: event.data.round,
        coverage: structuredClone(event.data.coverage),
        findings: [],
        shards: [],
      };
      break;
    }
    case 'agent/started': {
      next.agent = {
        ...(next.agent?.coverage === undefined ? {} : { coverage: next.agent.coverage }),
        ...(next.agent?.shards === undefined ? {} : { shards: next.agent.shards }),
        status: 'running',
        jobId: event.data.jobId,
        round: event.data.round,
        startedAt: event.at,
        findings: [],
      };
      break;
    }
    case 'agent/shard': {
      next.agent ??= { status: 'running', findings: [] };
      next.agent.shards ??= [];
      const index = next.agent.shards.findIndex((shard) => shard.shardId === event.data.shardId);
      const shard = {
        shardId: event.data.shardId,
        shardIndex: event.data.shardIndex,
        shardCount: event.data.shardCount,
        round: event.data.round,
        report: structuredClone(event.data.report),
      };
      if (index < 0) next.agent.shards.push(shard);
      else next.agent.shards[index] = shard;
      if (next.agent.coverage !== undefined && event.data.paths !== undefined) {
        const covered = new Set(event.data.paths);
        const tier = event.data.tier ?? 'deep';
        const files = next.agent.coverage.files.map((file) => {
          if (!covered.has(file.path) || file.status !== 'pending') return file;
          const nextFile = {
            ...file,
            status: tier === 'deep' ? ('deep-reviewed' as const) : ('light-reviewed' as const),
          };
          delete nextFile.reason;
          return nextFile;
        });
        next.agent.coverage = {
          ...next.agent.coverage,
          files,
          totals: summarizeCoverage(files),
        };
      }
      break;
    }
    case 'agent/finding': {
      next.agent ??= { status: 'running', findings: [] };
      next.agent.findings ??= [];
      next.agent.findings.push(structuredClone(event.data.finding));
      break;
    }
    case 'agent/report': {
      const reportSkipped = event.data.report.skipped === true;
      const coverage =
        event.data.coverage !== undefined
          ? structuredClone(event.data.coverage)
          : reportSkipped || next.agent?.coverage === undefined
            ? next.agent?.coverage
            : promotePendingToLight(next.agent.coverage);
      let status: AgentStatus;
      if (reportSkipped) status = 'skipped';
      else if (coverage === undefined) status = 'done';
      else status = isCoverageComplete(coverage) ? 'done' : 'partial';
      next.report = structuredClone(event.data.report);
      next.agent = {
        ...(next.agent ?? {}),
        status,
        round: event.data.report.round,
        findings: structuredClone(event.data.report.findings),
        ...(coverage === undefined ? {} : { coverage }),
      };
      break;
    }
    case 'agent/failed': {
      next.agent = {
        ...(next.agent ?? {}),
        status: 'failed',
        error: event.data.message,
      };
      break;
    }
    case 'agent/retry': {
      const agent = next.agent ?? { status: 'queued' as const, findings: [] };
      const retryShards = new Set(event.data.shardIds);
      let coverage = agent.coverage;
      if (coverage !== undefined) {
        const files = coverage.files.map((file) => {
          if (
            file.shardId === undefined ||
            !retryShards.has(file.shardId) ||
            (file.status !== 'failed' && file.status !== 'pending')
          ) {
            return file;
          }
          const retried = { ...file, status: 'pending' as const };
          delete retried.reason;
          return retried;
        });
        coverage = { ...coverage, files, totals: summarizeCoverage(files) };
      }
      next.agent = {
        ...agent,
        status: 'queued',
        round: event.data.round,
        ...(coverage === undefined ? {} : { coverage }),
      };
      delete next.agent.jobId;
      delete next.agent.startedAt;
      delete next.agent.error;
      break;
    }
  }

  return next;
}
