import type { ReviewApiLike } from './api.js';
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

function reviewVerdict(review: Record<string, unknown>): string {
  if (review.closeVerdict === 'approved') return 'approve';
  if (typeof review.closeVerdict === 'string') return review.closeVerdict;
  const submissions = Array.isArray(review.submissions) ? review.submissions : [];
  let latest: { round: number; verdict: string } | undefined;
  for (const raw of submissions) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.verdict !== 'string') continue;
    const round = typeof item.round === 'number' ? item.round : 0;
    if (latest === undefined || round >= latest.round) {
      latest = { round, verdict: item.verdict };
    }
  }
  if (latest !== undefined) return latest.verdict;
  return review.status === 'closed' ? 'closed' : 'open';
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

/**
 * Browser-facing review URL. Embedded mode serves the SPA on the DSH origin, so
 * the daemon's loopback URL is never returned to an agent or command. External
 * mode keeps `publicUrl` when configured and the daemon URL otherwise.
 */
export function reviewUrlFor(
  config: ReviewConfig,
  reviewId: string,
  fallback: string | undefined,
): string | null {
  const path = `/review/${encodeURIComponent(reviewId)}`;
  if (config.embedded) {
    const base = config.uiBase === '/' ? '' : config.uiBase.replace(/\/+$/, '');
    return `${base}${path}`;
  }
  if (config.publicUrl !== undefined) return `${config.publicUrl.replace(/\/+$/, '')}${path}`;
  return fallback ?? null;
}

function scopeFrom(args: Record<string, unknown>, base: string): Record<string, unknown> {
  if (typeof args.commit === 'string') return { kind: 'commit', commit: args.commit };
  if (typeof args.head === 'string') return { kind: 'range', baseRef: base, headRef: args.head };
  return { kind: 'worktree', baseRef: base };
}

export function createReviewTools(
  ctx: PluginContext,
  config: ReviewConfig,
  api: ReviewApiLike,
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
            url: reviewUrlFor(config, created.review.review.id, created.url),
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
          const verdict = reviewVerdict(review);
          return {
            ok: true,
            reviewId: review.id,
            title: review.title,
            status: review.status,
            verdict,
            approved: verdict === 'approve' || verdict === 'approved',
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
        'review_comments_list',
        'List open review comments with their ids. Call this after review_refresh, then use review_resolve_comment for comments you actually fixed.',
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
          const view = await api.get<{ review: Record<string, unknown> }>(
            `/api/reviews/${encodeURIComponent(args.reviewId)}`,
            exec.signal,
          );
          const rawComments = Array.isArray(view.review.comments) ? view.review.comments : [];
          const comments = rawComments.flatMap((raw) => {
            if (typeof raw !== 'object' || raw === null) return [];
            const item = raw as Record<string, unknown>;
            if (
              item.state !== 'open' ||
              item.deletedAt !== undefined ||
              typeof item.id !== 'string'
            ) {
              return [];
            }
            const anchors = Array.isArray(item.anchors) ? item.anchors : [];
            const last = anchors.at(-1);
            const anchor =
              typeof last === 'object' && last !== null
                ? (last as Record<string, unknown>)
                : undefined;
            const rawAuthor =
              typeof item.author === 'object' && item.author !== null
                ? (item.author as Record<string, unknown>)
                : {};
            return [
              {
                commentId: item.id,
                state: 'open',
                author: {
                  name: typeof rawAuthor.name === 'string' ? rawAuthor.name : 'unknown',
                  kind: typeof rawAuthor.kind === 'string' ? rawAuthor.kind : 'agent',
                },
                ...(typeof anchor?.path === 'string' ? { path: anchor.path } : {}),
                ...(typeof anchor?.lineStart === 'number' ? { lineStart: anchor.lineStart } : {}),
                ...(typeof anchor?.lineEnd === 'number' ? { lineEnd: anchor.lineEnd } : {}),
                body: typeof item.body === 'string' ? item.body : '',
                ...(typeof item.sourceFindingId === 'string'
                  ? { sourceFindingId: item.sourceFindingId }
                  : {}),
              },
            ];
          });
          return {
            ok: true,
            reviewId: args.reviewId,
            total: comments.length,
            comments,
          };
        },
      ),
    ),
    ctx.tools.register(
      tool(
        'review_resolve_comment',
        'Mark one review comment as resolved after you have fixed the reported issue. This records the action as an AI agent.',
        {
          type: 'object',
          properties: {
            reviewId: { type: 'string' },
            commentId: { type: 'string' },
          },
          required: ['reviewId', 'commentId'],
          additionalProperties: false,
        },
        async (args, exec) => {
          if (typeof args.reviewId !== 'string' || args.reviewId === '') {
            return { ok: false, error: { code: 'validation', message: 'reviewId is required' } };
          }
          if (typeof args.commentId !== 'string' || args.commentId === '') {
            return { ok: false, error: { code: 'validation', message: 'commentId is required' } };
          }
          const view = await api.post<{ comment?: { id?: string; state?: string } }>(
            `/api/reviews/${encodeURIComponent(args.reviewId)}/comments/${encodeURIComponent(args.commentId)}/resolve`,
            {},
            exec.signal,
          );
          return {
            ok: true,
            reviewId: args.reviewId,
            commentId: view.comment?.id ?? args.commentId,
            state: view.comment?.state ?? 'resolved',
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
