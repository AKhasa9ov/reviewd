import { randomUUID } from 'node:crypto';
import { ReviewApiError } from './api.js';
import type { ReviewApiLike } from './api.js';
import type { ReviewConfig } from './config.js';
import { createReviewReportTool } from './report-tool.js';

/** Tools a reviewer may execute; everything else is denied by the guard. */
const READ_ONLY_REVIEWER_TOOLS = new Set([
  'read',
  'grep',
  'glob',
  'review_status',
  'review_feedback',
  'review_report',
]);

export interface WorkerAgent {
  id?: string;
  session?: { id?: string; snapshotEvents?(): readonly unknown[] };
  followup(message: unknown): void;
  whenIdle(): Promise<void>;
  cancel(cause: unknown): void;
  /** Older harness versions exposed the log directly on the agent. */
  snapshotEvents?(): readonly unknown[];
  ctx?: {
    get?(name: string): unknown;
    tools?: {
      restrict?(filter: { deny?: string[]; allow?: string[] }): () => void;
      guard?(guard: (execution: { name: string }) => string | undefined): () => void;
      register?(definition: unknown): () => void;
    };
  };
}

export interface WorkerAgentHandle {
  agent: WorkerAgent;
  dispose?(): Promise<void>;
}

export interface WorkerDeps {
  config: ReviewConfig;
  api: ReviewApiLike;
  agents?: {
    create(options: Record<string, unknown>): Promise<WorkerAgentHandle>;
  };
  sessionController?: {
    resolveAgent(
      sessionId: string,
    ): Promise<{ agent?: WorkerAgent; error?: { code?: string; message?: string } }>;
  };
  /** DSH's default model selection, applied to reviewer agents. */
  defaultModel?: {
    currentSelection(): Record<string, unknown>;
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
  bundle: {
    prompt: string;
    diff?: unknown;
    /** Complete changed-file manifest; the shape is owned by core and not validated here. */
    manifest?: unknown;
    schema?: unknown;
    meta?: Record<string, unknown>;
  };
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

function reportFromText(text: string): Record<string, unknown> | undefined {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].at(-1);
  const candidate = fenced?.[1] ?? text;
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

/**
 * Extract the newest parseable JSON report from a reviewer session. Prefer the
 * last assistant message, but fall back to an earlier complete report when the
 * final message is prose or a truncated fragment.
 */
export function extractReviewerReport(
  events: readonly unknown[],
): Record<string, unknown> | undefined {
  const texts: string[] = [];
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue;
    const record = event as { type?: unknown; data?: { message?: { content?: unknown } } };
    if (record.type !== 'assistant/message') continue;
    const text = textOfContent(record.data?.message?.content);
    if (text.trim() !== '') texts.push(text);
  }
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const parsed = reportFromText(texts[index] as string);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
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
    const selection = deps.defaultModel?.currentSelection();
    const agentOptions = {
      ...Object.fromEntries(
        Object.entries(selection ?? {}).filter(([, value]) => value !== undefined),
      ),
      ...(deps.config.reviewerModel === undefined ? {} : deps.config.reviewerModel),
    };
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
      ...(Object.keys(agentOptions).length === 0 ? {} : { agentOptions }),
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
  if (parent === undefined && deps.config.reviewerPreset !== undefined) {
    const preset = deps.config.reviewerPreset;
    const presets = agent.ctx?.get?.('agentPresets') as
      { mount?(ctx: unknown, id: string): Promise<unknown> } | undefined;
    try {
      if (presets?.mount === undefined) throw new Error('agent preset service is unavailable');
      await presets.mount(agent.ctx, preset);
    } catch (error) {
      await deps.api
        .post(
          `/api/jobs/${encodeURIComponent(job.id)}/fail`,
          {
            attemptId: job.attemptId,
            code: 'reviewer-preset',
            message: error instanceof Error ? error.message : `cannot mount preset ${preset}`,
            retryable: false,
          },
          signal,
        )
        .catch(() => undefined);
      await handle.dispose?.().catch(() => undefined);
      return;
    }
  }
  let release: (() => void) | undefined;
  let releaseReportTool: (() => void) | undefined;
  let capturedReport: Record<string, unknown> | undefined;
  try {
    const tools = agent.ctx?.tools;
    if (tools?.guard === undefined) throw new Error('reviewer tool service is unavailable');
    // `restrict()` only filters global tools and cannot hide preset-scoped
    // tools, so enforce a read-only allowlist on every actual execution.
    release = tools.guard((execution) =>
      READ_ONLY_REVIEWER_TOOLS.has(execution.name)
        ? undefined
        : `reviewer is read-only: ${execution.name} is not allowed`,
    );
    if (tools.register !== undefined) {
      try {
        releaseReportTool = tools.register(
          createReviewReportTool((report) => {
            capturedReport = report;
          }),
        );
      } catch (error) {
        // The fenced-JSON fallback still works when an older harness has no
        // scoped tool registry. Do not fail the whole review for that alone.
        deps.logger?.warn?.(
          `code-review: cannot register review_report tool: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  } catch (error) {
    // Fail closed: never run a reviewer with the default tool surface.
    await deps.api
      .post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: 'reviewer-tools',
          message: error instanceof Error ? error.message : 'cannot restrict reviewer tools',
          retryable: false,
        },
        signal,
      )
      .catch(() => undefined);
    await handle.dispose?.().catch(() => undefined);
    return;
  }
  const timeoutMs = deps.config.reviewerTimeoutMs;
  const timeoutError = new Error('reviewer timed out');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const cancel = (cause: unknown): void => {
    if (cancelled) return;
    cancelled = true;
    agent.cancel(cause);
  };
  const onAbort = (): void => cancel({ kind: 'disposed' });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    agent.followup(userMessage(bundle.prompt));
    await Promise.race([
      agent.whenIdle(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          cancel({ kind: 'timeout' });
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
    const events = agent.session?.snapshotEvents?.() ?? agent.snapshotEvents?.() ?? [];
    const report = capturedReport ?? extractReviewerReport(events);
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
    if (report.schemaVersion !== 1) {
      await deps.api.post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: 'invalid-output',
          message: `reviewer report must use schemaVersion 1 (received ${String(report.schemaVersion)})`,
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
    const timedOut = error === timeoutError;
    await deps.api
      .post(
        `/api/jobs/${encodeURIComponent(job.id)}/fail`,
        {
          attemptId: job.attemptId,
          code: timedOut ? 'reviewer-timeout' : 'reviewer-failed',
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
    releaseReportTool?.();
    // The handle owns the reviewer session; release it exactly once so timed-out
    // and failed runs do not leak agents between jobs.
    const disposal = handle.dispose?.();
    if (disposal !== undefined) await disposal.catch(() => undefined);
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
  const baseId = randomId();

  const register = async (): Promise<string | undefined> => {
    let delayMs = 1_000;
    for (let attempt = 1; !signal.aborted; attempt += 1) {
      try {
        const registered = await deps.api.post<{ id: string }>(
          '/api/workers/register',
          {
            id: baseId,
            name: 'dsh-code-review',
            harness: 'dsh',
          },
          signal,
        );
        return registered.id;
      } catch (error) {
        if (signal.aborted) return undefined;
        deps.logger?.warn?.(
          `code-review: worker registration failed (attempt ${attempt}, retrying in ${delayMs}ms): ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
        await sleep(delayMs, signal);
        delayMs = Math.min(delayMs * 2, 30_000);
      }
    }
    return undefined;
  };

  while (!signal.aborted) {
    const workerId = await register();
    if (workerId === undefined) return;
    const heartbeat = setInterval(() => {
      void deps.api
        .post(`/api/workers/${encodeURIComponent(workerId)}/heartbeat`, {}, signal)
        .catch(() => undefined);
    }, deps.config.heartbeatMs);
    heartbeat.unref?.();
    let stale = false;
    try {
      while (!signal.aborted) {
        try {
          const lease = await deps.api.get<JobLease | null>(
            `/api/jobs/next?workerId=${encodeURIComponent(workerId)}&wait=25`,
            signal,
          );
          if (lease === null) {
            if (!signal.aborted) await sleep(deps.config.pollMs, signal);
            continue;
          }
          await runJob(deps, lease, signal);
        } catch (error) {
          if (signal.aborted) return;
          if (
            error instanceof ReviewApiError &&
            (error.status === 401 || error.status === 404 || error.code === 'unauthorized')
          ) {
            stale = true;
            break;
          }
          deps.logger?.warn?.(
            `code-review: worker poll failed: ${error instanceof Error ? error.message : 'unknown'}`,
          );
          await sleep(deps.config.pollMs, signal);
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
    if (!stale) return;
    deps.logger?.warn?.('code-review: worker registration is stale; registering again');
  }
}
