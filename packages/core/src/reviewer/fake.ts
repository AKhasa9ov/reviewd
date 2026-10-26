import type {
  Finding,
  FindingSink,
  ReviewerBackend,
  ReviewerJob,
  ReviewerReport,
} from './types.js';

export interface FakeReviewerOptions {
  report?: ReviewerReport | ((job: ReviewerJob) => ReviewerReport);
  findings?: Finding[];
}

function emptyReport(job: ReviewerJob): ReviewerReport {
  return {
    schemaVersion: 1,
    summary: `Fake review of ${job.reviewId} round ${job.round}`,
    riskLevel: 'low',
    findings: [],
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
  };
}

/** Deterministic in-process reviewer used by tests and local smoke runs. */
export class FakeReviewer implements ReviewerBackend {
  readonly kind = 'fake' as const;
  private readonly options: FakeReviewerOptions;

  constructor(options: FakeReviewerOptions = {}) {
    this.options = options;
  }

  async run(job: ReviewerJob, sink: FindingSink, signal: AbortSignal): Promise<ReviewerReport> {
    if (signal.aborted) throw new Error('reviewer cancelled');
    const report =
      typeof this.options.report === 'function'
        ? this.options.report(job)
        : (this.options.report ?? emptyReport(job));
    const findings = this.options.findings ?? report.findings;
    for (const finding of findings) {
      if (signal.aborted) throw new Error('reviewer cancelled');
      await sink(finding);
    }
    return {
      ...structuredClone(report),
      findings: structuredClone(findings),
    };
  }
}
