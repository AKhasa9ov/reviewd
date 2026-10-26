import { randomUUID } from 'node:crypto';
import type { ReviewApi } from './api.js';
import type { ReviewConfig } from './config.js';

export interface WorkerAgent {
  id?: string;
  session?: { id?: string };
  followup(message: unknown): void;
  whenIdle(): Promise<void>;
  cancel(cause: unknown): void;
  snapshotEvents?(): readonly unknown[];
  ctx?: { tools?: { restrict(filter: { deny?: string[]; allow?: string[] }): () => void } };
}

export interface WorkerAgentHandle {
  agent: WorkerAgent;
  dispose?(): Promise<void>;
}

export interface WorkerDeps {
  config: ReviewConfig;
  api: ReviewApi;
  agents?: {
    create(options: Record<string, unknown>): Promise<WorkerAgentHandle>;
  };
  sessionController?: {
    resolveAgent(
      sessionId: string,
    ): Promise<{ agent?: WorkerAgent; error?: { code?: string; message?: string } }>;
  };
  logger?: { warn?(message: string): void; info?(message: string): void };
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  randomId?: () => string;
}

export interface WorkerJob {
  id: string;
  attemptId: string;
  reviewId: string;
  round: number;
  kind?: string;
}

export interface JobLease {
  job: WorkerJob;
  bundle: { prompt: string; diff?: unknown; schema?: unknown; meta?: Record<string, unknown> };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text'
        ? String((part as { text?: unknown }).text ?? '')
        : '',
    )
    .join('\n');
}

/** Extract the last assistant text from a reviewer session, then its JSON report. */
export function extractReviewerReport(
  events: readonly unknown[],
): Record<string, unknown> | undefined {
  let lastText = '';
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue;
    const record = event as { type?: unknown; data?: { message?: { content?: unknown } } };
    if (record.type !== 'assistant/message') continue;
    const text = textOfContent(record.data?.message?.content);
    if (text.trim() !== '') lastText = text;
  }
  if (lastText === '') return undefined;
  const fenced = [...lastText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].at(-1);
  const candidate = fenced?.[1] ?? lastText;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function userMessage(text: string): Record<string, unknown> {
  return {
    id: `msg_${randomUUID()}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  };
}

async function runJob(deps: WorkerDeps, lease: JobLease, signal: AbortSignal): Promise<void> {
  const { job, bundle } = lease;
  if (deps.agents === undefined) {
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        attemptId: job.attemptId,
        code: 'worker-unavailable',
        message: 'agent service unavailable',
        retryable: true,
      },
      signal,
    );
    return;
  }
  let parent: WorkerAgent | undefined;
  if (deps.config.sessionId !== undefined && deps.sessionController !== undefined) {
    const resolved = await deps.sessionController.resolveAgent(deps.config.sessionId);
    parent = resolved.agent;
  }
  const cwd =
    (typeof bundle.meta?.cwd === 'string' && bundle.meta.cwd !== ''
      ? bundle.meta.cwd
      : undefined) ??
    deps.config.cwd ??
    deps.config.repoHint ??
    process.cwd();
  const sessionId = `review_${randomUUID()}`;
  let handle: WorkerAgentHandle;
  try {
    handle = await deps.agents.create({
      sessionId,
      ...(parent === undefined ? {} : { parentAgent: parent }),
      meta: {
        cwd,
        origin: 'subagent',
        delegationDepth: 1,
        ...(deps.config.reviewerPreset === undefined
          ? {}
          : { agentPreset: deps.config.reviewerPreset }),
        reviewId: job.reviewId,
        round: job.round,
      },
      ...(deps.config.reviewerModel === undefined
        ? {}
        : { agentOptions: deps.config.reviewerModel }),
    });
  } catch (error) {
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        attemptId: job.attemptId,
        code: 'agent-create-failed',
        message: error instanceof Error ? error.message : 'cannot create reviewer agent',
        retryable: true,
      },
      signal,
    );
    return;
  }
  const agent = handle.agent;
  const release = agent.ctx?.tools?.restrict({
    // The reviewer is strictly read-only: it must not mutate the workspace,
    // spawn agents that could bypass this policy, or start/refresh reviews.
    deny: [
      'bash',
      'write',
      'edit',
      'apply_patch',
      'workflow',
      'subagent_fork',
      'subagent',
      'review_start',
      'review_refresh',
    ],
  });
  const timeoutMs = 10 * 60 * 1000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onAbort = (): void => agent.cancel({ kind: 'disposed' });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    agent.followup(userMessage(bundle.prompt));
    await Promise.race([
      agent.whenIdle(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('reviewer timed out')), timeoutMs);
      }),
    ]);
    const events = agent.snapshotEvents?.() ?? [];
    const report = extractReviewerReport(events);
    if (report === undefined) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: 'invalid-output',
          message: 'reviewer returned no JSON report',
          retryable: false,
        },
        signal,
      );
      return;
    }
    const findings = Array.isArray(report.findings) ? report.findings : [];
    if (findings.length > 0) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/findings`,
        {
          attemptId: job.attemptId,
          findings,
        },
        signal,
      );
    }
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/report`,
      {
        attemptId: job.attemptId,
        report,
      },
      signal,
    );
    await deps.api.post(
      `/api/jobs/${encodeURIComponent(job.id)}/ack`,
      {
        attemptId: job.attemptId,
      },
      signal,
    );
  } catch (error) {
    await deps.api
      .post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: 'reviewer-failed',
          message: error instanceof Error ? error.message : 'reviewer failed',
          retryable: true,
        },
        signal,
      )
      .catch(() => undefined);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
    release?.();
  }
}

/** Register, long-poll, heartbeat, and run jobs until the signal aborts. */
export async function runWorkerLoop(deps: WorkerDeps, signal: AbortSignal): Promise<void> {
  if (deps.agents === undefined) {
    deps.logger?.warn?.('code-review: worker enabled but ctx.agents is unavailable');
    return;
  }
  const sleep = deps.sleep ?? wait;
  const randomId = deps.randomId ?? (() => `wkr_${randomUUID()}`);
  let workerId: string;
  try {
    const registered = await deps.api.post<{ id: string }>(
      '/api/workers/register',
      {
        id: randomId(),
        name: 'dsh-code-review',
        harness: 'dsh',
      },
      signal,
    );
    workerId = registered.id;
  } catch (error) {
    deps.logger?.warn?.(
      `code-review: worker registration failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return;
  }
  const heartbeat = setInterval(() => {
    void deps.api
      .post(`/api/workers/${encodeURIComponent(workerId)}/heartbeat`, {}, signal)
      .catch(() => undefined);
  }, deps.config.heartbeatMs);
  heartbeat.unref?.();
  try {
    while (!signal.aborted) {
      try {
        const lease = await deps.api.get<JobLease | null>(
          `/api/jobs/next?workerId=${encodeURIComponent(workerId)}&wait=25`,
          signal,
        );
        if (lease === null) continue;
        await runJob(deps, lease, signal);
      } catch (error) {
        if (signal.aborted) return;
        deps.logger?.warn?.(
          `code-review: worker poll failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        await sleep(deps.config.pollMs, signal);
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
}
