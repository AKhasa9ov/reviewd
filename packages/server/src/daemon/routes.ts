import { randomBytes } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { open, readdir, stat, unlink } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import {
  CORE_VERSION,
  GitError,
  ReviewError,
  createEvent,
  runGit,
  resolveRepoRoot,
  validateFindingItem,
  validateReport,
} from '@dsh-code-review/core';
import type {
  Actor,
  AddCommentInput,
  AgentReport,
  CommentState,
  DiffScope,
  Initiator,
  ReviewEvent,
  ReviewService,
  ReviewerConfig,
  ReviewStore,
  SubmitInput,
} from '@dsh-code-review/core';
import { ApiError } from './errors.js';
import { parsePositiveInt, readForm, readJson, requestId, sendJson } from './http.js';
import type { DeliveryQueue } from './deliveries.js';
import type { JobQueue } from './jobs.js';
import { buildReviewPrompt } from './prompt.js';
import {
  readRepositorySettings,
  writeRepositorySettings,
  type RepositorySetting,
} from './settings.js';
import { serveStatic } from './static.js';
import { openSse } from './sse.js';
import type { EventHub } from './sse.js';
import type { DaemonConfig } from './types.js';

export interface RouteContext {
  config: Required<
    Pick<
      DaemonConfig,
      | 'token'
      | 'trustProxy'
      | 'maxBodyBytes'
      | 'longPollMs'
      | 'heartbeatMs'
      | 'jobLeaseMs'
      | 'jobMaxAttempts'
    >
  > & {
    publicUrl: string;
    webDir: string | null;
    maxBodyBytes: number;
    rateLimit: { mutations: number; reads: number; windowMs: number };
  };
  service: ReviewService;
  store: ReviewStore;
  hub: EventHub;
  jobs: JobQueue;
  deliveries: DeliveryQueue;
  now: () => Date;
}

const systemActor: Actor = { name: 'reviewd', kind: 'system' };

function actorFor(req: IncomingMessage, auth: 'bearer' | 'cookie'): Actor {
  const raw = req.headers['x-review-actor'];
  const name =
    typeof raw === 'string' && raw.trim() !== ''
      ? raw.trim().slice(0, 100)
      : auth === 'cookie'
        ? 'browser'
        : 'api';
  return { name, kind: 'human' };
}

function ctxFor(
  req: IncomingMessage,
  auth: 'bearer' | 'cookie',
): { actor: Actor; requestId?: string } {
  const header = req.headers['idempotency-key'];
  return {
    actor: actorFor(req, auth),
    ...(typeof header === 'string' && header !== '' ? { requestId: header } : {}),
  };
}

export function mapError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ReviewError) {
    switch (error.code) {
      case 'not-found':
        return new ApiError('not-found', error.message, { details: error.details });
      case 'validation':
        return new ApiError('validation', error.message, { details: error.details });
      case 'conflict':
        return new ApiError('conflict', error.message, { details: error.details });
      case 'stale-review':
        return new ApiError('stale-review', error.message, { details: error.details });
      case 'agent-busy':
        return new ApiError('agent-busy', error.message, { details: error.details });
      case 'internal':
        return new ApiError('internal', error.message);
    }
  }
  if (error instanceof RangeError) return new ApiError('validation', error.message);
  if (error instanceof GitError) return new ApiError('validation', error.message);
  return new ApiError('internal', 'internal server error');
}

async function probeStore(store: ReviewStore): Promise<boolean> {
  const probe = join(store.root, `.health-${process.pid}-${randomBytes(6).toString('hex')}`);
  try {
    const handle = await open(probe, 'wx');
    try {
      await handle.writeFile('ok', 'utf8');
    } finally {
      await handle.close();
    }
    await unlink(probe);
    return true;
  } catch {
    await unlink(probe).catch(() => undefined);
    return false;
  }
}

async function probeGit(cwd: string): Promise<boolean> {
  try {
    const result = await runGit(cwd, ['--version'], {
      allowFailure: true,
      maxBytes: 4096,
      maxStderrBytes: 4096,
    });
    return result.code === 0;
  } catch {
    return false;
  }
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError('validation', `${field} must be a non-empty string`);
  }
  return value;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation', `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function append(
  ctx: RouteContext,
  reviewId: string,
  type: Parameters<typeof createEvent>[0]['type'],
  data: unknown,
  actor: Actor = systemActor,
): Promise<void> {
  const event = createEvent({
    reviewId,
    type,
    actor,
    data,
    now: ctx.now,
  } as Parameters<typeof createEvent>[0]) as ReviewEvent;
  await ctx.store.append(reviewId, event);
  await ctx.hub.sync(reviewId);
}

async function enqueueWorkerJob(ctx: RouteContext, reviewId: string): Promise<void> {
  const view = await ctx.service.get(reviewId);
  const round = view.review.rounds.at(-1);
  if (round === undefined || view.review.reviewer?.backend !== 'worker') return;
  const kind = view.report === null ? 'initial' : 'verify';
  const previousRound = round.no > 1 ? round.no - 1 : undefined;
  const unresolved = view.review.comments
    .filter((comment) => comment.state === 'open')
    .flatMap((comment) => {
      const anchor = comment.anchors.at(-1);
      return anchor === undefined
        ? []
        : [
            {
              path: anchor.path,
              lineStart: anchor.lineStart,
              body: comment.body,
              state: comment.state,
            },
          ];
    });
  const { prompt } = buildReviewPrompt({
    title: view.review.title,
    reviewId,
    round: round.no,
    kind,
    files: view.latestSnapshot?.files ?? [],
    ...(kind === 'verify'
      ? {
          context: {
            ...(previousRound === undefined ? {} : { previousRound }),
            ...(view.report === null ? {} : { previousReport: view.report }),
            unresolved,
          },
        }
      : {}),
  });
  const initiator = view.review.initiator;
  ctx.jobs.enqueue({
    reviewId,
    round: round.no,
    kind,
    backend: 'worker',
    prompt,
    diff: view.latestSnapshot,
    meta: {
      reviewId,
      round: round.no,
      // The worker runs the reviewer in the initiator's visible worktree; the
      // daemon's checkout is only a fallback for reviews without an initiator.
      cwd: initiator?.cwd ?? view.review.repoRoot,
      ...(initiator === undefined ? {} : { initiator }),
    },
  });
}

function parseInitiator(value: unknown): Initiator | undefined {
  if (value === undefined) return undefined;
  const input = object(value, 'initiator');
  const harness = str(input.harness, 'initiator.harness');
  const sessionId = str(input.sessionId, 'initiator.sessionId');
  const cwd = input.cwd === undefined ? undefined : str(input.cwd, 'initiator.cwd');
  const agentPreset =
    input.agentPreset === undefined ? undefined : str(input.agentPreset, 'initiator.agentPreset');
  return {
    harness,
    sessionId,
    ...(cwd === undefined ? {} : { cwd }),
    ...(agentPreset === undefined ? {} : { agentPreset }),
  };
}

async function createReview(
  ctx: RouteContext,
  req: IncomingMessage,
  auth: 'bearer' | 'cookie',
  body: Record<string, unknown>,
): Promise<unknown> {
  const reviewer =
    body.reviewer === undefined
      ? undefined
      : (object(body.reviewer, 'reviewer') as unknown as ReviewerConfig);
  const initiator = parseInitiator(body.initiator);
  const view = await ctx.service.create(
    {
      repoRoot: str(body.repoRoot, 'repoRoot'),
      title: str(body.title, 'title'),
      scope: object(body.scope, 'scope') as unknown as DiffScope,
      ...(reviewer === undefined ? {} : { reviewer }),
      ...(initiator === undefined ? {} : { initiator }),
    },
    ctxFor(req, auth),
  );
  await ctx.hub.sync(view.review.id);
  await enqueueWorkerJob(ctx, view.review.id);
  const origin =
    ctx.config.publicUrl.replace(/\/$/, '') || `http://${req.headers.host ?? 'localhost'}`;
  const url = `${origin}/review/${view.review.id}`;
  return { review: view, url, warnings: view.review.warnings ?? [] };
}

export async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
  options: { authenticated: boolean; auth: 'bearer' | 'cookie'; peer: string },
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://daemon');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const id = requestId(req);

  if (method === 'GET' && (await serveStatic(path, res, ctx.config.webDir))) return;

  if (path === '/api/health' && method === 'GET') {
    const queue = ctx.jobs.stats();
    const storeWritable = await probeStore(ctx.store);
    const gitOk = await probeGit(ctx.store.root);
    const healthy = storeWritable && gitOk;
    sendJson(res, healthy ? 200 : 503, {
      status: healthy ? 'ok' : 'degraded',
      store: { writable: storeWritable },
      git: { ok: gitOk },
      queue,
      jobs: { queued: queue.queued, running: queue.leased },
      workers: { online: queue.workers },
      version: CORE_VERSION,
    });
    return;
  }
  if (path === '/api/version' && method === 'GET') {
    sendJson(res, 200, { name: 'reviewd', version: CORE_VERSION, schemaVersion: 1 });
    return;
  }
  if (path === '/api/auth' && method === 'POST') {
    const contentType = String(req.headers['content-type'] ?? '');
    const body = contentType.includes('application/x-www-form-urlencoded')
      ? await readForm(req, ctx.config.maxBodyBytes)
      : await readJson(req, ctx.config.maxBodyBytes);
    const token = str(body.token, 'token');
    const { tokenMatches, sessionCookie } = await import('./auth.js');
    if (!tokenMatches(ctx.config.token, token)) throw new ApiError('unauthorized', 'invalid token');
    const secure = ctx.config.publicUrl.startsWith('https:');
    res.setHeader('set-cookie', sessionCookie(ctx.config.token, { secure }));
    sendJson(res, 200, { ok: true });
    return;
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const { clearCookie } = await import('./auth.js');
    res.setHeader('set-cookie', clearCookie());
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!options.authenticated) throw new ApiError('unauthorized', 'authentication required');

  if (path === '/api/config/public' && method === 'GET') {
    sendJson(res, 200, {
      publicUrl: ctx.config.publicUrl,
      limits: {
        mutationsPerMinute: ctx.config.rateLimit.mutations,
        readsPerMinute: ctx.config.rateLimit.reads,
      },
      defaultBase: 'main',
    });
    return;
  }

  const segments = path.split('/').filter((part) => part !== '');

  if (path === '/api/reviews' && method === 'GET') {
    const status = url.searchParams.get('status');
    const page = await ctx.service.list({
      ...(status === 'open' || status === 'closed' ? { status } : {}),
      limit: parsePositiveInt(url.searchParams.get('limit'), 50),
      offset: parsePositiveInt(url.searchParams.get('offset'), 0),
    });
    sendJson(res, 200, page);
    return;
  }
  if (path === '/api/reviews' && method === 'POST') {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    sendJson(res, 201, await createReview(ctx, req, options.auth, body));
    return;
  }

  if (segments[0] === 'api' && segments[1] === 'reviews' && segments[2] !== undefined) {
    const reviewId = decodeURIComponent(segments[2]);
    const rest = segments.slice(3);
    if (rest.length === 0 && method === 'GET') {
      sendJson(res, 200, await ctx.service.get(reviewId));
      return;
    }
    if (rest[0] === 'snapshot' && method === 'GET') {
      const round = Number(url.searchParams.get('round'));
      if (!Number.isInteger(round) || round <= 0)
        throw new ApiError('validation', 'round is required');
      const file = url.searchParams.get('file') ?? undefined;
      sendJson(res, 200, await ctx.service.snapshot(reviewId, round, file));
      return;
    }
    if (rest[0] === 'events' && method === 'GET') {
      await ctx.service.get(reviewId);
      const afterParam = url.searchParams.get('after') ?? req.headers['last-event-id'] ?? '0';
      const last = String(afterParam).includes(':')
        ? Number(String(afterParam).split(':').at(-1))
        : Number(afterParam);
      const after = Number(Number.isFinite(last) && last >= 0 ? last : 0);
      const accept = String(req.headers.accept ?? '');
      if (accept.includes('text/event-stream')) {
        await openSse(req, res, ctx.hub, {
          reviewId,
          after,
          heartbeatMs: ctx.config.heartbeatMs,
        });
        return;
      }
      await ctx.hub.sync(reviewId);
      const waitSeconds = Math.min(parsePositiveInt(url.searchParams.get('wait'), 25), 25);
      const controller = new AbortController();
      req.on('close', () => controller.abort());
      const events = await ctx.hub.wait(reviewId, after, waitSeconds * 1000, controller.signal);
      sendJson(res, 200, { events, latestSeq: events.at(-1)?.seq ?? after });
      return;
    }
    if (rest[0] === 'comments' && rest.length === 1 && method === 'POST') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const input: AddCommentInput = {
        body: str(body.body, 'body'),
        path: str(body.path, 'path'),
        side: body.side === 'old' ? 'old' : 'new',
        lineStart: parsePositiveInt(String(body.lineStart ?? ''), 0),
        ...(body.lineEnd === undefined
          ? {}
          : { lineEnd: parsePositiveInt(String(body.lineEnd), 0) }),
        ...(body.suggestion === undefined
          ? {}
          : {
              suggestion: object(
                body.suggestion,
                'suggestion',
              ) as unknown as AddCommentInput['suggestion'],
            }),
      };
      const view = await ctx.service.addComment(reviewId, input, ctxFor(req, options.auth));
      await ctx.hub.sync(reviewId);
      sendJson(res, 201, view);
      return;
    }
    if (rest[0] === 'comments' && rest[2] === 'replies' && method === 'POST') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const view = await ctx.service.reply(
        reviewId,
        decodeURIComponent(rest[1] ?? ''),
        { body: str(body.body, 'body') },
        ctxFor(req, options.auth),
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 201, view);
      return;
    }
    if (
      rest[0] === 'comments' &&
      rest[1] !== undefined &&
      rest[2] === 'suggestion' &&
      method === 'POST'
    ) {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const action = body.action;
      if (action !== 'accept' && action !== 'decline' && action !== 'apply') {
        throw new ApiError('validation', 'action must be accept, decline or apply');
      }
      const view = await ctx.service.suggestionAction(
        reviewId,
        decodeURIComponent(rest[1]),
        action,
        ctxFor(req, options.auth),
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (
      rest[0] === 'comments' &&
      rest[1] !== undefined &&
      rest.length === 2 &&
      method === 'PATCH'
    ) {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const state = body.state;
      if (state !== 'open' && state !== 'resolved' && state !== 'dismissed') {
        throw new ApiError('validation', 'state must be open, resolved or dismissed');
      }
      const view = await ctx.service.setCommentState(
        reviewId,
        decodeURIComponent(rest[1]),
        state as CommentState,
        ctxFor(req, options.auth),
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === 'refresh' && method === 'POST') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const scope =
        body.scope === undefined
          ? undefined
          : (object(body.scope, 'scope') as unknown as DiffScope);
      const view = await ctx.service.refresh(
        reviewId,
        scope === undefined ? {} : { scope },
        ctxFor(req, options.auth),
      );
      await enqueueWorkerJob(ctx, reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === 'submit' && method === 'POST') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const verdict = body.verdict;
      if (verdict !== 'approve' && verdict !== 'request-changes' && verdict !== 'comment') {
        throw new ApiError('validation', 'unknown verdict');
      }
      const input: SubmitInput = {
        verdict,
        ...(body.summary === undefined ? {} : { summary: str(body.summary, 'summary') }),
        ...(body.includeResolved === undefined
          ? {}
          : { includeResolved: body.includeResolved === true }),
      };
      const submission = await ctx.service.submit(reviewId, input, ctxFor(req, options.auth));
      const review = await ctx.service.get(reviewId);
      const initiator = review.review.initiator;
      const delivery = await ctx.deliveries.create({
        deliveryKey: submission.deliveryKey,
        reviewId,
        round: submission.round,
        submissionId: submission.deliveryKey.split(':')[2] ?? 'unknown',
        harness:
          initiator?.harness ??
          (typeof body.harness === 'string' && body.harness !== '' ? body.harness : 'dsh'),
        ...(initiator === undefined ? {} : { initiator }),
        feedback: submission.feedback,
      });
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { submission, delivery });
      return;
    }
    if (rest[0] === 'close' && method === 'POST') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      if (body.verdict !== undefined && body.verdict !== 'approved' && body.verdict !== 'closed') {
        throw new ApiError('validation', 'verdict must be approved or closed');
      }
      const verdict = body.verdict === 'approved' ? 'approved' : 'closed';
      const view = await ctx.service.close(reviewId, verdict, ctxFor(req, options.auth));
      ctx.jobs.cancelReview(reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === 'fix-status' && method === 'POST') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      if (!Array.isArray(body.items)) throw new ApiError('validation', 'items must be an array');
      await ctx.service.claimFixStatus(
        reviewId,
        {
          items: body.items.map((item) => object(item, 'item')) as unknown as Array<{
            commentId: string;
            status: 'fixed' | 'not-fixed' | 'unclear';
            evidence?: string;
          }>,
        },
        ctxFor(req, options.auth),
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (rest[0] === 'feedback' && method === 'GET') {
      const feedback = await ctx.service.latestFeedback(reviewId);
      if (feedback === null) throw new ApiError('not-found', 'no submission yet');
      sendJson(res, 200, feedback);
      return;
    }
    if (rest[0] === 'agent' && rest[1] === 'cancel' && method === 'POST') {
      ctx.jobs.cancelReview(reviewId);
      await ctx.service.cancelAgent(reviewId, ctxFor(req, options.auth)).catch((error: unknown) => {
        if (!(error instanceof ReviewError) || error.code !== 'conflict') throw error;
      });
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (path === '/api/events' && method === 'GET') {
    const accept = String(req.headers.accept ?? '');
    const raw = req.headers['last-event-id'] ?? url.searchParams.get('after') ?? '0';
    const after = Number(String(raw).includes(':') ? String(raw).split(':').at(-1) : raw);
    const sequence = Number.isFinite(after) && after >= 0 ? after : 0;
    if (accept.includes('text/event-stream')) {
      await openSse(req, res, ctx.hub, { after: sequence, heartbeatMs: ctx.config.heartbeatMs });
      return;
    }
    await ctx.hub.syncAll();
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    const items = await ctx.hub.waitGlobal(sequence, ctx.config.longPollMs, controller.signal);
    sendJson(res, 200, { events: items });
    return;
  }

  if (path === '/api/workers/register' && method === 'POST') {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const worker = ctx.jobs.register({
      ...(typeof body.id === 'string' ? { id: body.id } : {}),
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.harness === 'string' ? { harness: body.harness } : {}),
    });
    sendJson(res, 201, worker);
    return;
  }
  if (
    segments[0] === 'api' &&
    segments[1] === 'workers' &&
    segments[3] === 'heartbeat' &&
    method === 'POST'
  ) {
    const worker = ctx.jobs.heartbeat(decodeURIComponent(segments[2] ?? ''));
    if (worker === null) throw new ApiError('not-found', 'unknown worker');
    sendJson(res, 200, worker);
    return;
  }

  if (path === '/api/jobs/next' && method === 'GET') {
    const workerId = url.searchParams.get('workerId');
    if (workerId === null || workerId === '')
      throw new ApiError('validation', 'workerId is required');
    const waitSeconds = Math.min(parsePositiveInt(url.searchParams.get('wait'), 25), 25);
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    const lease = await ctx.jobs.next(workerId, waitSeconds * 1000, controller.signal);
    if (lease === null) {
      res.writeHead(204, { 'cache-control': 'no-store', 'x-request-id': id });
      res.end();
      return;
    }
    await append(ctx, lease.reviewId, 'agent/started', {
      jobId: lease.id,
      round: lease.round,
      backend: 'worker',
    } as never);
    sendJson(res, 200, { job: { ...lease, bundle: undefined }, bundle: lease.bundle });
    return;
  }
  if (
    segments[0] === 'api' &&
    segments[1] === 'jobs' &&
    segments[2] !== undefined &&
    method === 'POST'
  ) {
    const jobId = decodeURIComponent(segments[2]);
    const action = segments[3];
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const attemptId = str(body.attemptId, 'attemptId');
    const job = ctx.jobs.attempt(jobId, attemptId);
    if (job === null) throw new ApiError('conflict', 'stale or unknown job attempt');
    if (action === 'ack') {
      sendJson(res, 200, { ok: true, status: job.status });
      return;
    }
    if (action === 'findings') {
      if (!Array.isArray(body.findings))
        throw new ApiError('validation', 'findings must be an array');
      const snapshot = (job.diff ?? { files: [] }) as never;
      const seen = new Set<string>();
      let accepted = 0;
      let rejected = 0;
      for (const raw of body.findings) {
        const validation = validateFindingItem(raw, { snapshot });
        const finding = validation.finding;
        if (finding === null || seen.has(finding.id)) {
          rejected += 1;
          continue;
        }
        seen.add(finding.id);
        if (
          ctx.jobs.hasFinding(jobId, attemptId, finding.id) ||
          ctx.jobs.findingCount(jobId, attemptId) >= 200
        ) {
          rejected += 1;
          continue;
        }
        // Append first: accepting the id before the durable write loses the
        // finding permanently when the store rejects the append. A failed append
        // surfaces as an error so the worker retries; accepted findings are
        // skipped by hasFinding on that retry.
        await append(ctx, job.reviewId, 'agent/finding', {
          finding,
          round: job.round,
        } as never);
        if (ctx.jobs.acceptFinding(jobId, attemptId, finding.id) !== null) {
          accepted += 1;
        } else {
          rejected += 1;
        }
      }
      sendJson(res, 200, { accepted, rejected });
      return;
    }
    if (action === 'report') {
      const report = object(body.report, 'report');
      let validation: ReturnType<typeof validateReport>;
      try {
        validation = validateReport(report as never, {
          snapshot: (job.diff ?? { files: [] }) as never,
        });
      } catch (error) {
        throw new ApiError('validation', error instanceof Error ? error.message : 'invalid report');
      }
      if (ctx.jobs.job(jobId)?.status === 'done') {
        sendJson(res, 200, { accepted: true, duplicate: true });
        return;
      }
      const agentReport: AgentReport = {
        ...validation.report,
        reviewId: job.reviewId,
        round: job.round,
        backend: 'worker',
        rejected: validation.rejected,
        warnings: validation.warnings,
      };
      // The report is durable before the attempt is marked done. If the append
      // fails the worker can retry; the reverse order loses the report.
      await append(ctx, job.reviewId, 'agent/report', { report: agentReport } as never);
      const accepted = ctx.jobs.acceptReport(jobId, attemptId);
      if (accepted === null) {
        if (ctx.jobs.job(jobId)?.status === 'done') {
          sendJson(res, 200, { accepted: true, duplicate: true });
          return;
        }
        throw new ApiError('conflict', 'stale or unknown job attempt');
      }
      sendJson(res, 200, { accepted: true, warnings: validation.warnings });
      return;
    }
    if (action === 'fail') {
      const result = ctx.jobs.fail(jobId, attemptId, body.retryable !== false);
      if (result === null) {
        sendJson(res, 200, { ok: true, duplicate: true });
        return;
      }
      await append(ctx, job.reviewId, 'agent/failed', {
        code: typeof body.code === 'string' ? body.code : 'failed',
        message: typeof body.message === 'string' ? body.message : 'job failed',
      } as never);
      sendJson(res, 200, { ok: true, retried: result.retried, status: result.job.status });
      return;
    }
  }

  if (path === '/api/deliveries/pending' && method === 'GET') {
    const harness = url.searchParams.get('harness') ?? 'dsh';
    sendJson(res, 200, { deliveries: ctx.deliveries.pending(harness) });
    return;
  }
  if (
    segments[0] === 'api' &&
    segments[1] === 'deliveries' &&
    segments[2] !== undefined &&
    method === 'POST'
  ) {
    const deliveryId = decodeURIComponent(segments[2]);
    const action = segments[3];
    const body = await readJson(req, ctx.config.maxBodyBytes);
    if (action === 'ack') {
      const record = await ctx.deliveries.ack(
        deliveryId,
        typeof body.by === 'string' ? body.by : 'unknown',
      );
      if (record === null) throw new ApiError('not-found', 'unknown delivery');
      sendJson(res, 200, record);
      return;
    }
    if (action === 'fail') {
      const record = await ctx.deliveries.fail(
        deliveryId,
        typeof body.error === 'string' ? body.error : 'delivery failed',
      );
      if (record === null) throw new ApiError('not-found', 'unknown delivery');
      sendJson(res, 200, record);
      return;
    }
  }

  if (path === '/api/gc' && method === 'POST') {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const days =
      typeof body.olderThanDays === 'number'
        ? body.olderThanDays
        : Number(body.olderThanDays ?? 90);
    if (!Number.isFinite(days) || days < 0)
      throw new ApiError('validation', 'olderThanDays must be non-negative');
    sendJson(res, 200, await ctx.service.gc(days));
    return;
  }

  if (path === '/api/settings/repositories' && method === 'GET') {
    sendJson(res, 200, await readRepositorySettings(ctx.store.root));
    return;
  }

  if (path === '/api/settings/repositories' && method === 'PUT') {
    const body = await readJson(req, ctx.config.maxBodyBytes);
    const list = body.repositories;
    if (!Array.isArray(list)) {
      throw new ApiError('validation', 'repositories must be an array');
    }
    if (list.length > 100) {
      throw new ApiError('validation', 'at most 100 repositories can be configured');
    }
    const seen = new Set<string>();
    const repositories: RepositorySetting[] = [];
    for (const [index, raw] of list.entries()) {
      const item = object(raw, `repositories[${index}]`);
      const name = str(item.name, `repositories[${index}].name`).trim();
      const candidate = str(item.path, `repositories[${index}].path`).trim();
      if (name.length > 120) {
        throw new ApiError('validation', `repositories[${index}].name is too long`);
      }
      if (candidate.length > 4096) {
        throw new ApiError('validation', `repositories[${index}].path is too long`);
      }
      const root = await resolveRepoRoot(candidate);
      if (seen.has(root)) {
        throw new ApiError('validation', `repository ${root} is configured twice`);
      }
      seen.add(root);
      const defaultTarget =
        item.defaultTarget === undefined
          ? undefined
          : str(item.defaultTarget, `repositories[${index}].defaultTarget`).trim();
      if (defaultTarget !== undefined) {
        assertGitRef(defaultTarget, `repositories[${index}].defaultTarget`);
        const check = await runGit(
          root,
          ['rev-parse', '--verify', '--end-of-options', `${defaultTarget}^{commit}`],
          { allowFailure: true },
        );
        if (check.code !== 0) {
          throw new ApiError(
            'validation',
            `default target ${defaultTarget} is not a commit in ${root}`,
          );
        }
      }
      repositories.push({
        name,
        path: root,
        ...(defaultTarget === undefined ? {} : { defaultTarget }),
      });
    }
    await writeRepositorySettings(ctx.store.root, { repositories });
    sendJson(res, 200, { repositories });
    return;
  }

  if (path === '/api/fs/dirs' && method === 'GET') {
    const raw = url.searchParams.get('path');
    const trimmed = raw === null ? '' : raw.trim();
    const requested = trimmed === '' ? homedir() : trimmed;
    if (requested.includes('\0')) {
      throw new ApiError('validation', 'path must not contain NUL bytes');
    }
    if (requested.length > 4096) {
      throw new ApiError('validation', 'path is too long');
    }
    if (!isAbsolute(requested)) {
      throw new ApiError('validation', 'path must be absolute');
    }
    const target = resolve(requested);
    let info: Stats;
    try {
      info = await stat(target);
    } catch (error) {
      throw directoryError(error, target);
    }
    if (!info.isDirectory()) {
      throw new ApiError('validation', `not a directory: ${target}`);
    }
    let dirents: Dirent[];
    try {
      dirents = await readdir(target, { withFileTypes: true });
    } catch (error) {
      throw directoryError(error, target);
    }
    const entries: DirectoryEntry[] = [];
    for (const entry of dirents) {
      if (!(await entryIsDirectory(target, entry))) continue;
      const entryPath = join(target, entry.name);
      entries.push({
        name: entry.name,
        path: entryPath,
        isGit: await hasGitEntry(entryPath),
      });
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const truncated = entries.length > MAX_DIRECTORY_ENTRIES;
    if (truncated) entries.length = MAX_DIRECTORY_ENTRIES;
    sendJson(res, 200, {
      path: target,
      parent: target === parse(target).root ? null : dirname(target),
      breadcrumbs: breadcrumbsFor(target),
      entries,
      truncated,
    } satisfies DirectoryListing);
    return;
  }

  if (path === '/api/repos/commits' && method === 'GET') {
    const repoPath = url.searchParams.get('path');
    const base = url.searchParams.get('base');
    const head = url.searchParams.get('head');
    if (repoPath === null) throw new ApiError('validation', 'path is required');
    if (base === null) throw new ApiError('validation', 'base is required');
    if (head === null) throw new ApiError('validation', 'head is required');
    const root = await resolveRepoRoot(repoPath);
    const baseRef = assertGitRef(base, 'base');
    const headRef = assertGitRef(head, 'head');
    const baseSha = await resolveCommitRef(root, baseRef);
    const headSha = await resolveCommitRef(root, headRef);
    const mergeBase = await runGit(root, ['merge-base', baseSha, headSha]);
    const log = await runGit(root, [
      'log',
      '--topo-order',
      '--reverse',
      '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s',
      `${baseSha}..${headSha}`,
    ]);
    const commits = log.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => {
        const [sha = '', shortSha = '', author = '', date = '', ...subject] = line.split('\x1f');
        return { sha, shortSha, author, date, subject: subject.join('\x1f') };
      });
    sendJson(res, 200, {
      repoRoot: root,
      baseRef,
      headRef,
      mergeBase: mergeBase.stdout.trim(),
      headSha,
      commits,
    });
    return;
  }

  if (path === '/api/repos/branches' && method === 'GET') {
    const repoPath = url.searchParams.get('path');
    if (repoPath === null) throw new ApiError('validation', 'path is required');
    const root = await resolveRepoRoot(repoPath);
    const result = await runGit(root, [
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads',
      'refs/remotes',
    ]);
    const branches = [
      ...new Set(
        result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '' && !line.endsWith('/HEAD')),
      ),
    ].sort();
    sendJson(res, 200, { repoRoot: root, branches });
    return;
  }

  throw new ApiError('not-found', `unknown route: ${method} ${path}`);
}

const MAX_DIRECTORY_ENTRIES = 500;

interface DirectoryEntry {
  name: string;
  path: string;
  isGit: boolean;
}

interface DirectoryListing {
  path: string;
  parent: string | null;
  breadcrumbs: Array<{ name: string; path: string }>;
  entries: DirectoryEntry[];
  truncated: boolean;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function directoryError(error: unknown, target: string): ApiError {
  switch (nodeErrorCode(error)) {
    case 'ENOENT':
      return new ApiError('validation', `directory does not exist: ${target}`);
    case 'EACCES':
      return new ApiError('validation', `permission denied: ${target}`);
    case 'ENOTDIR':
      return new ApiError('validation', `not a directory: ${target}`);
    default:
      return new ApiError('validation', `cannot read directory: ${target}`);
  }
}

/** Symlinks are included only when they resolve to a directory; their children are not visited. */
async function entryIsDirectory(parent: string, entry: Dirent): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat(join(parent, entry.name))).isDirectory();
  } catch {
    return false;
  }
}

/** Worktrees use a `.git` file instead of a directory. */
async function hasGitEntry(directory: string): Promise<boolean> {
  try {
    const info = await stat(join(directory, '.git'));
    return info.isDirectory() || info.isFile();
  } catch {
    return false;
  }
}

function breadcrumbsFor(target: string): Array<{ name: string; path: string }> {
  const { root } = parse(target);
  const breadcrumbs = [{ name: '/', path: root }];
  let current = root;
  for (const segment of target.slice(root.length).split(sep)) {
    if (segment === '') continue;
    current = join(current, segment);
    breadcrumbs.push({ name: segment, path: current });
  }
  return breadcrumbs;
}

function assertGitRef(value: string, label: string): string {
  const ref = value.trim();
  if (ref === '' || ref.startsWith('-') || ref.length > 1024 || ref.includes('\0')) {
    throw new ApiError('validation', `${label} must be a git ref or commit`);
  }
  return ref;
}

async function resolveCommitRef(root: string, ref: string): Promise<string> {
  const result = await runGit(root, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  return result.stdout.trim();
}
