import type { ReviewApi } from './api.js';
import type { ReviewConfig } from './config.js';

export interface ToolAgent {
  id: string;
  session?: { id?: string; header?: { cwd?: string } };
}

export interface ToolExec {
  agent?: ToolAgent;
  signal: AbortSignal;
}

interface ToolRuntime {
  register(definition: unknown): () => void;
}

export interface PluginContext {
  tools: ToolRuntime;
  workingDirectory?: { get(session: unknown): string };
  logger?: { info?(message: string): void; warn?(message: string): void };
}

interface ToolSuccess {
  ok: true;
  [key: string]: unknown;
}
interface ToolFailure {
  ok: false;
  error: { code: string; message: string };
}

type ToolResult = ToolSuccess | ToolFailure;

const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true } as const;

function textResult(value: ToolResult): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

function failure(error: unknown): ToolFailure {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'tool-error';
  const message = error instanceof Error ? error.message : 'review tool failed';
  return { ok: false, error: { code, message } };
}

function tool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  run: (args: Record<string, unknown>, exec: ToolExec) => Promise<ToolResult>,
) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args: unknown, value: unknown) => textResult(value as ToolResult),
    },
    async execute(args: unknown, exec: ToolExec): Promise<ToolResult> {
      try {
        return await run(args as Record<string, unknown>, exec);
      } catch (error) {
        return failure(error);
      }
    },
  };
}

function repoFor(ctx: PluginContext, config: ReviewConfig, agent: ToolAgent | undefined): string {
  if (config.repoHint !== undefined) return config.repoHint;
  if (config.cwd !== undefined) return config.cwd;
  if (ctx.workingDirectory !== undefined && agent?.session !== undefined) {
    try {
      return ctx.workingDirectory.get(agent.session);
    } catch {
      // fall through
    }
  }
  if (agent?.session?.header?.cwd !== undefined) return agent.session.header.cwd;
  return process.cwd();
}

function initiatorFor(
  config: ReviewConfig,
  agent: ToolAgent | undefined,
  cwd: string,
): Record<string, unknown> | undefined {
  const sessionId = agent?.session?.id ?? config.sessionId;
  if (sessionId === undefined) return undefined;
  return {
    harness: 'dsh',
    sessionId,
    cwd,
    ...(config.reviewerPreset === undefined ? {} : { agentPreset: config.reviewerPreset }),
  };
}

function scopeFrom(args: Record<string, unknown>, base: string): Record<string, unknown> {
  if (typeof args.commit === 'string') return { kind: 'commit', commit: args.commit };
  if (typeof args.head === 'string') return { kind: 'range', baseRef: base, headRef: args.head };
  return { kind: 'worktree', baseRef: base };
}

export function createReviewTools(
  ctx: PluginContext,
  config: ReviewConfig,
  api: ReviewApi,
): Array<() => void> {
  return [
    ctx.tools.register(
      tool(
        'review_start',
        'Start a code review of the current workspace or a git range. Returns the review id and review URL.',
        {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short review title.' },
            repo: {
              type: 'string',
              description: 'Absolute repository path; defaults to the session workspace.',
            },
            base: { type: 'string', description: 'Base ref, default main.' },
            head: { type: 'string', description: 'Head ref for a committed range.' },
            commit: { type: 'string', description: 'Review one commit.' },
            reviewer: {
              type: 'object',
              properties: {
                backend: { type: 'string', enum: ['worker', 'command', 'none'] },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        async (args, exec) => {
          const repo =
            typeof args.repo === 'string' && args.repo !== ''
              ? args.repo
              : repoFor(ctx, config, exec.agent);
          const base = typeof args.base === 'string' && args.base !== '' ? args.base : 'main';
          const initiator = initiatorFor(config, exec.agent, repo);
          const body = {
            repoRoot: repo,
            title: typeof args.title === 'string' && args.title !== '' ? args.title : 'Code review',
            scope: scopeFrom(args, base),
            reviewer: args.reviewer ?? { backend: config.reviewerBackend },
            ...(initiator === undefined ? {} : { initiator }),
          };
          const created = await api.post<{ review: { review: { id: string } }; url?: string }>(
            '/api/reviews',
            body,
            exec.signal,
          );
          return {
            ok: true,
            reviewId: created.review.review.id,
            url: created.url ?? null,
            status: 'open',
          };
        },
      ),
    ),
    ctx.tools.register(
      tool(
        'review_status',
        'Read one review, including rounds, comments and agent status.',
        {
          type: 'object',
          properties: { reviewId: { type: 'string' } },
          required: ['reviewId'],
          additionalProperties: false,
        },
        async (args, exec) => {
          if (typeof args.reviewId !== 'string' || args.reviewId === '') {
            return { ok: false, error: { code: 'validation', message: 'reviewId is required' } };
          }
          const view = await api.get<{ review: Record<string, unknown>; report?: unknown }>(
            `/api/reviews/${encodeURIComponent(args.reviewId)}`,
            exec.signal,
          );
          const review = view.review as Record<string, unknown>;
          return {
            ok: true,
            reviewId: review.id,
            title: review.title,
            status: review.status,
            rounds: Array.isArray(review.rounds) ? review.rounds.length : 0,
            comments: Array.isArray(review.comments) ? review.comments.length : 0,
            agent: review.agent ?? null,
            report: view.report ?? null,
          };
        },
      ),
    ),
    ctx.tools.register(
      tool(
        'review_refresh',
        'Create the next review round from the current workspace state, re-anchor comments and queue reviewer verification.',
        {
          type: 'object',
          properties: { reviewId: { type: 'string' } },
          required: ['reviewId'],
          additionalProperties: false,
        },
        async (args, exec) => {
          if (typeof args.reviewId !== 'string' || args.reviewId === '') {
            return { ok: false, error: { code: 'validation', message: 'reviewId is required' } };
          }
          const view = await api.post<{ review: { rounds?: unknown[]; id?: string } }>(
            `/api/reviews/${encodeURIComponent(args.reviewId)}/refresh`,
            {},
            exec.signal,
          );
          return {
            ok: true,
            reviewId: args.reviewId,
            rounds: Array.isArray(view.review.rounds) ? view.review.rounds.length : 0,
          };
        },
      ),
    ),
    ctx.tools.register(
      tool(
        'review_feedback',
        'Read the latest submitted feedback for a review without delivering it again.',
        {
          type: 'object',
          properties: { reviewId: { type: 'string' } },
          required: ['reviewId'],
          additionalProperties: false,
        },
        async (args, exec) => {
          if (typeof args.reviewId !== 'string' || args.reviewId === '') {
            return { ok: false, error: { code: 'validation', message: 'reviewId is required' } };
          }
          const view = await api.get<{ feedback?: { markdown?: string; json?: unknown } }>(
            `/api/reviews/${encodeURIComponent(args.reviewId)}/feedback`,
            exec.signal,
          );
          return {
            ok: true,
            reviewId: args.reviewId,
            markdown: view.feedback?.markdown ?? '',
            json: view.feedback?.json ?? null,
          };
        },
      ),
    ),
  ];
}
