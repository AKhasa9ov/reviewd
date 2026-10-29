/**
 * Scoped tool that gives the reviewer agent a typed way to submit its final
 * report. It is registered on the reviewer agent's own context, so ordinary
 * DSH sessions never see it. The daemon still validates the captured object:
 * this schema prevents common JSON-shape drift, it does not replace review
 * validation.
 */
export const REVIEW_REPORT_TOOL_NAME = 'review_report';

export type ReviewReportCapture = (report: Record<string, unknown>) => void;

const FINDING_PARAMETERS = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique finding id, for example f1.' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    category: {
      type: 'string',
      enum: [
        'security',
        'correctness',
        'tests',
        'performance',
        'maintainability',
        'api',
        'concurrency',
        'docs',
        'other',
      ],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    kind: { type: 'string', enum: ['issue', 'question', 'praise'] },
    file: { type: 'string', description: 'Changed path exactly as it appears in the diff.' },
    lineStart: { type: 'integer' },
    lineEnd: { type: 'integer' },
    title: { type: 'string' },
    rationale: { type: 'string' },
    evidence: { type: 'string', description: 'Exact code quote from the diff.' },
    suggestion: {
      type: 'object',
      properties: {
        original: { type: 'string' },
        replacement: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  required: ['severity', 'file', 'lineStart', 'title', 'evidence'],
  additionalProperties: true,
} as const;

const QUESTION_PARAMETERS = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'integer' },
    question: { type: 'string' },
    why: { type: 'string' },
  },
  required: ['file', 'line', 'question'],
  additionalProperties: true,
} as const;

const REPORT_PARAMETERS = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'integer', enum: [1], default: 1 },
    summary: { type: 'string', description: 'What changed and the main risks.' },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    findings: { type: 'array', items: FINDING_PARAMETERS },
    questions: { type: 'array', items: QUESTION_PARAMETERS },
    tests: {
      type: 'object',
      properties: {
        ran: { type: 'boolean' },
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              result: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
              summary: { type: 'string' },
            },
            required: ['command', 'result', 'summary'],
            additionalProperties: true,
          },
        },
      },
      required: ['ran', 'commands'],
      additionalProperties: true,
    },
    verification: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          commentId: { type: 'string' },
          status: { type: 'string', enum: ['fixed', 'not-fixed', 'unclear'] },
          evidence: { type: 'string' },
        },
        required: ['commentId', 'status', 'evidence'],
        additionalProperties: true,
      },
    },
  },
  required: ['summary', 'riskLevel', 'findings'],
  additionalProperties: true,
} as const;

const RECEIPT = { ok: true, received: true };

export function createReviewReportTool(capture: ReviewReportCapture): {
  name: string;
  description: string;
  parameters: typeof REPORT_PARAMETERS;
  output: {
    schema: { type: 'object'; additionalProperties: true };
    render: (_args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>;
  };
  execute: (
    args: unknown,
    exec: { signal: AbortSignal },
  ) => Promise<{ ok: true; received: true } | { ok: false; error: { code: string; message: string } }>;
} {
  return {
    name: REVIEW_REPORT_TOOL_NAME,
    description:
      'Submit the final structured code-review report. Call this exactly once when the review is complete. The report must match the provided schema.',
    parameters: REPORT_PARAMETERS,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: () => [{ type: 'text' as const, text: JSON.stringify(RECEIPT) }],
    },
    async execute(args) {
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        return {
          ok: false,
          error: { code: 'validation', message: 'review_report requires a JSON object' },
        };
      }
      // Some models omit the version even when they follow the rest of the
      // schema. Normalize it here, before the daemon sees the captured report.
      capture({ ...(args as Record<string, unknown>), schemaVersion: 1 });
      return { ok: true, received: true };
    },
  };
}
