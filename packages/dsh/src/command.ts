import type { ReviewApiLike } from './api.js';
import type { ReviewConfig } from './config.js';
import type { PluginContext, ToolAgent } from './tools.js';

export interface CommandInvocation {
  agent: ToolAgent;
  rawInput: string;
  signal: AbortSignal;
}

export interface CommandRuntime {
  register(definition: Record<string, unknown>): () => void;
}

export function createReviewCommand(
  ctx: PluginContext & { commands: CommandRuntime },
  config: ReviewConfig,
  api: ReviewApiLike,
): () => void {
  return ctx.commands.register({
    name: 'review',
    description: 'Start a code review for this workspace and return its review URL.',
    async handler(invocation: CommandInvocation) {
      const agent = invocation.agent;
      let repo = config.repoHint ?? config.cwd;
      if (repo === undefined && ctx.workingDirectory !== undefined && agent.session !== undefined) {
        try {
          repo = ctx.workingDirectory.get(agent.session);
        } catch {
          repo = undefined;
        }
      }
      repo ??= agent.session?.header?.cwd ?? process.cwd();
      const sessionId = agent.session?.id ?? config.sessionId;
      const title = invocation.rawInput.trim() === '' ? 'Code review' : invocation.rawInput.trim();
      try {
        const created = await api.post<{ review: { review: { id: string } }; url?: string }>(
          '/api/reviews',
          {
            repoRoot: repo,
            title,
            scope: { kind: 'worktree', baseRef: 'main' },
            reviewer: { backend: config.reviewerBackend },
            ...(sessionId === undefined
              ? {}
              : { initiator: { harness: 'dsh', sessionId, cwd: repo } }),
          },
          invocation.signal,
        );
        const id = created.review.review.id;
        return {
          kind: 'success' as const,
          text: `Review ${id} started${created.url === undefined ? '' : `: ${created.url}`}`,
        };
      } catch (error) {
        return {
          kind: 'error' as const,
          text: `Cannot start review: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    },
  });
}
