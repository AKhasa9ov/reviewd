import type { ReviewApiLike } from './api.js';
import type { ReviewConfig } from './config.js';

export interface DeliveryInitiator {
  harness: string;
  sessionId: string;
  cwd?: string;
  agentPreset?: string;
}

export interface DeliveryRecord {
  id: string;
  deliveryKey: string;
  reviewId: string;
  round: number;
  submissionId: string;
  harness: string;
  initiator?: DeliveryInitiator;
  feedback: {
    markdown: string;
    /** The daemon includes the structured package; older records may not. */
    json?: { verdict?: 'approve' | 'request-changes' | 'comment' };
  };
}

export interface SessionControllerLike {
  resolveAgent?(
    sessionId: string,
  ): Promise<{ agent?: unknown; error?: { code?: string; message?: string } }>;
  prompt(request: {
    sessionId: string;
    mode: 'queue' | 'steer';
    content: Array<{ type: 'text'; text: string }>;
    requestId: string;
  }): Promise<unknown>;
}

export interface DeliveryDeps {
  config: ReviewConfig;
  api: ReviewApiLike;
  sessionController?: SessionControllerLike;
  logger?: { warn?(message: string): void; info?(message: string): void };
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const MAX_FEEDBACK_CHARS = 100_000;
/** Failed prompt attempts per delivery before it is reported as failed. */
const MAX_DELIVERY_ATTEMPTS = 3;
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

function contentFor(record: DeliveryRecord): string {
  const verdict = record.feedback.json?.verdict;
  const header = `Code review feedback — ${record.reviewId} round ${String(record.round)}\n\n`;
  if (verdict === 'approve') {
    // An approved submit closes the review; the feedback package still says to
    // apply changes, so do not forward it and start a fix round against a closed review.
    return `${header}The review was approved. No fix round is required.`;
  }
  const action =
    'Start the fix round now: apply the requested changes, run the tests, then call review_refresh and report the result with evidence.';
  const markdown = record.feedback.markdown ?? '';
  return `${header}${action}\n\n${markdown}`.slice(0, MAX_FEEDBACK_CHARS);
}

async function deliverOne(
  deps: DeliveryDeps,
  record: DeliveryRecord,
  signal: AbortSignal,
): Promise<void> {
  const initiator = record.initiator;
  if (initiator?.sessionId === undefined || initiator.sessionId === '') {
    // A legacy/CLI delivery has no session to target. Leave it pending for a human/CLI.
    return;
  }
  if (deps.sessionController === undefined) {
    deps.logger?.warn?.('code-review: delivery pending but sessionController is unavailable');
    return;
  }
  if (deps.sessionController.resolveAgent !== undefined) {
    const resolved = await deps.sessionController.resolveAgent(initiator.sessionId);
    if (resolved.agent === undefined && resolved.error !== undefined) {
      throw new Error(`cannot resume session: ${resolved.error.code ?? 'unknown'}`);
    }
  }
  await deps.sessionController.prompt({
    sessionId: initiator.sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: contentFor(record) }],
    requestId: `cr:${record.deliveryKey}`,
  });
  await deps.api.post(
    `/api/deliveries/${encodeURIComponent(record.id)}/ack`,
    { by: 'dsh' },
    signal,
  );
}

/** Poll pending dsh deliveries, prompt the initiating session, then ack. */
export async function runDeliveryLoop(deps: DeliveryDeps, signal: AbortSignal): Promise<void> {
  const sleep = deps.sleep ?? wait;
  let backoff = 1_000;
  // Attempts survive polls so a session that keeps rejecting prompts cannot be
  // retried forever; a successful ack resets the record's budget.
  const attempts = new Map<string, number>();
  while (!signal.aborted) {
    try {
      const pending = await deps.api.get<{ deliveries: DeliveryRecord[] }>(
        '/api/deliveries/pending?harness=dsh',
        signal,
      );
      for (const record of pending.deliveries ?? []) {
        if (signal.aborted) return;
        try {
          await deliverOne(deps, record, signal);
          attempts.delete(record.id);
          backoff = 1_000;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown';
          const count = (attempts.get(record.id) ?? 0) + 1;
          attempts.set(record.id, count);
          if (count >= MAX_DELIVERY_ATTEMPTS) {
            deps.logger?.warn?.(
              `code-review: delivery ${record.id} failed ${count} times; marking it failed: ${message}`,
            );
            try {
              await deps.api.post(
                `/api/deliveries/${encodeURIComponent(record.id)}/fail`,
                { error: message },
                signal,
              );
              attempts.delete(record.id);
            } catch (failError) {
              // Keep the exhausted count so later polls retry only the fail call.
              deps.logger?.warn?.(
                `code-review: cannot mark delivery ${record.id} failed: ${
                  failError instanceof Error ? failError.message : 'unknown'
                }`,
              );
            }
            continue;
          }
          deps.logger?.warn?.(
            `code-review: delivery ${record.id} failed (attempt ${count}/${MAX_DELIVERY_ATTEMPTS}): ${message}`,
          );
          // Keep it pending and retry with backoff; no partial prompt was acknowledged.
          await sleep(backoff, signal);
          backoff = Math.min(backoff * 2, 30_000);
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      deps.logger?.warn?.(
        `code-review: delivery poll failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, 30_000);
      continue;
    }
    await sleep(deps.config.deliveryPollMs, signal);
  }
}
