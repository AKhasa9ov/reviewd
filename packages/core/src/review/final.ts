import { isCoverageComplete } from './coverage.js';
import type { ReviewState } from './types.js';

/**
 * True when the stored report is the final report for the latest round.
 *
 * A queued, running, failed, skipped or coverage-partial run does not make its
 * report final, even when a previous run left a report in place. Legacy states
 * without an agent still qualify because their report is all we have.
 */
export function isFinalReviewReport(
  review: ReviewState,
  report: ReviewState['report'] = review.report,
): boolean {
  const latestRound = review.rounds.at(-1);
  if (report === undefined || latestRound === undefined || report.round !== latestRound.no) {
    return false;
  }
  const agent = review.agent;
  if (agent === undefined) return true;
  if (agent.status !== 'done') return false;
  return agent.coverage === undefined || isCoverageComplete(agent.coverage);
}
