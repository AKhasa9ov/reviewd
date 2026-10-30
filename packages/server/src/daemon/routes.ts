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
  aggregateShardReports,
  buildReviewPlan,
  buildSnapshot,
  coverageFromPlan,
  coverageFromPrompt,
  createEvent,
  readBlob,
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
  ReviewPlan,
  ReviewService,
  ReviewerConfig,
  ReviewStore,
  Snapshot,
  SubmitInput,
} from '@dsh-code-review/core';
import { ApiError } from './errors.js';
import { parsePositiveInt, readForm, readJson, requestId, sendJson } from './http.js';
import type { DeliveryQueue } from './deliveries.js';
import type { JobQueue } from './jobs.js';
import { buildReviewPrompt } from './prompt.js';
import { retryTargetShardIds } from './retry.js';
import {
  readRepositorySettings,
  writeRepositorySettings,
  type RepositorySetting,
} from './settings.js';
import { serveStatic } from './static.js';
import { openSse } from './sse.js';
import type { EventHub } from './sse.js';
import { PROMPT_VERSION, PROTOCOL_VERSION } from './types.js';
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
  ctx: Pick<RouteContext, 'store' | 'hub' | 'now'>,
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

function namespaceShardReport(report: AgentReport, shardId: string): AgentReport {
  return {
    ...report,
    findings: report.findings.map((finding) => ({
      ...finding,
      id: `${shardId}:${finding.id}`,
    })),
    questions: report.questions.map((question) => ({
      ...question,
      id: `${shardId}:${question.id}`,
    })),
  };
}

const finalizing = new Map<string, Promise<void>>();

async function maybeFinalizeShards(
  ctx: Pick<RouteContext, 'jobs' | 'service' | 'store' | 'hub' | 'now'>,
  reviewId: string,
  round: number,
): Promise<void> {
  if (ctx.jobs.isAggregated(reviewId, round)) return;
  const jobs = ctx.jobs.listReview(reviewId).filter((job) => job.round === round);
  if (jobs.length === 0) return;
  if (jobs.some((job) => job.status === 'queued' || job.status === 'leased')) return;
  const key = `${reviewId}:${round}`;
  const existing = finalizing.get(key);
  if (existing !== undefined) return existing;
  const task = (async (): Promise<void> => {
    const plan = jobs.find((job) => job.plan !== undefined)?.plan;
    if (plan === undefined) return;
    const view = await ctx.service.get(reviewId);
    const reports = (view.review.agent?.shards ?? [])
      .filter((shard) => shard.round === round)
      .map((shard) => ({ shardId: shard.shardId, report: shard.report }));
    const reportedShards = new Set(reports.map((report) => report.shardId));
    // A retry leaves the previous failed job in memory. A newer successful
    // report for the same shard is authoritative; only shards that still have
    // no report are marked failed.
    const failedShards = [
      ...new Set(
        jobs
          .filter((job) => job.status === 'failed' || job.status === 'canceled')
          .flatMap((job) =>
            job.shardId === undefined || reportedShards.has(job.shardId) ? [] : [job.shardId],
          ),
      ),
    ];
    const aggregate = aggregateShardReports({
      reviewId,
      round,
      backend: 'worker',
      plan,
      reports,
      failedShards,
    });
    await append(ctx, reviewId, 'agent/report', {
      report: aggregate.report,
      coverage: aggregate.coverage,
    } as never);
    ctx.jobs.markAggregated(reviewId, round);
  })();
  finalizing.set(key, task);
  try {
    await task;
  } finally {
    if (finalizing.get(key) === task) finalizing.delete(key);
  }
}

/** Coverage only applies to honest v2 snapshots; v1 snapshots stay legacy. */
export function coverageForSnapshot(
  snapshot: Snapshot | null | undefined,
  includedPaths: readonly string[],
) {
  if (snapshot?.schemaVersion !== 2 || snapshot.manifest === undefined) return undefined;
  return coverageFromPrompt(snapshot.manifest, includedPaths);
}

type OrphanContext = Pick<RouteContext, 'service' | 'store' | 'hub' | 'jobs' | 'now'>;

function hasActiveWorkerJob(ctx: OrphanContext, reviewId: string): boolean {
  return ctx.jobs
    .listReview(reviewId)
    .some((job) => job.status === 'queued' || job.status === 'leased');
}

/**
 * A persisted queued/running worker agent without an in-memory job cannot be
 * driven by this daemon (after a restart or cancel-before-lease). Clear it so
 * refresh/re-scope is not permanently blocked by a ghost `agent-busy`.
 */
async function failOrphanedWorkerAgent(ctx: OrphanContext, reviewId: string): Promise<void> {
  const view = await ctx.service.get(reviewId);
  const status = view.review.agent?.status;
  if (view.review.status === 'closed' || view.review.deletedAt !== undefined) return;
  if (view.review.reviewer?.backend !== 'worker') return;
  if (status !== 'queued' && status !== 'running') return;
  if (hasActiveWorkerJob(ctx, reviewId)) return;
  await append(ctx, reviewId, 'agent/failed', {
    code: 'worker-lost',
    message: 'worker job is no longer available to this daemon',
  } as never);
}

/**
 * Startup reconciliation: persisted worker agents are only trustworthy while
 * this daemon still owns their job. Jobs live in memory, so anything left
 * queued/running from a previous process is orphaned.
 */
export async function reconcileOrphanedWorkerAgents(ctx: OrphanContext): Promise<void> {
  const first = await ctx.service.list({ limit: 100, offset: 0 });
  for (let offset = 0; offset < first.total; offset += 100) {
    const page = offset === 0 ? first : await ctx.service.list({ limit: 100, offset });
    for (const summary of page.items) {
      await failOrphanedWorkerAgent(ctx, summary.id).catch(() => {
        // A review deleted or closed between list and reconcile is already inert.
      });
    }
  }
}

type ReviewView = Awaited<ReturnType<ReviewService['get']>>;
type PromptContext = NonNullable<Parameters<typeof buildReviewPrompt>[0]['context']>;

function reviewKind(view: ReviewView, round?: { no: number }): 'initial' | 'verify' {
  if (round !== undefined) return round.no <= 1 ? 'initial' : 'verify';
  return view.report === null ? 'initial' : 'verify';
}

function promptContextFor(view: ReviewView, round?: { no: number }): PromptContext | undefined {
  const targetRound = round ?? view.review.rounds.at(-1);
  if (reviewKind(view, targetRound) !== 'verify') return undefined;
  const previousRound =
    targetRound === undefined || targetRound.no <= 1 ? undefined : targetRound.no - 1;
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
  return {
    ...(previousRound === undefined ? {} : { previousRound }),
    ...(view.report === null ? {} : { previousReport: view.report }),
    unresolved,
  };
}

/**
 * Builds and queues complete shard bundles before enqueueing any of them. A
 * git failure therefore cannot leave a half-covered retry with a subset of
 * jobs. `shardIds` narrows the work to missing shards without changing the
 * shard indexes or the round plan.
 */
async function enqueueShardJobs(
  ctx: RouteContext,
  view: ReviewView,
  round: NonNullable<ReviewView['review']['rounds'][number]>,
  plan: ReviewPlan,
  shardIds?: ReadonlySet<string>,
): Promise<void> {
  const snapshot = view.latestSnapshot;
  if (snapshot === null) return;
  if (shardIds !== undefined && shardIds.size === 0) return;
  const kind = reviewKind(view, round);
  const promptContext = promptContextFor(view, round);
  const initiator = view.review.initiator;
  const shardScope = scopeForSnapshot(snapshot);
  const bundles: Array<{
    shard: ReviewPlan['shards'][number];
    index: number;
    snapshot: Snapshot;
    prompt: ReturnType<typeof buildReviewPrompt>;
  }> = [];
  for (const [index, shard] of plan.shards.entries()) {
    if (shardIds !== undefined && !shardIds.has(shard.id)) continue;
    const shardSnapshot = await buildSnapshot({
      repoRoot: snapshot.scope.repoRoot,
      scope: shardScope,
      paths: shard.paths,
      includeContent: false,
      includeUntracked: snapshot.scope.kind === 'worktree',
      maxDiffBytes: Math.max(256 * 1024, shard.patchBytes * 2 + 64 * 1024),
      maxFiles: shard.fileCount + 8,
    });
    const prompt = buildReviewPrompt({
      title: view.review.title,
      reviewId: view.review.id,
      round: round.no,
      kind,
      files: shardSnapshot.files,
      ...(promptContext === undefined ? {} : { context: promptContext }),
      shard: {
        id: shard.id,
        index,
        count: plan.shards.length,
        tier: shard.tier,
        moduleId: shard.moduleId,
      },
      diffLimit: 220_000,
    });
    bundles.push({ shard, index, snapshot: shardSnapshot, prompt });
  }

  for (const bundle of bundles) {
    const { shard, index, snapshot: shardSnapshot, prompt } = bundle;
    ctx.jobs.enqueue({
      reviewId: view.review.id,
      round: round.no,
      kind,
      backend: 'worker',
      prompt: prompt.prompt,
      diff: shardSnapshot,
      protocolVersion: PROTOCOL_VERSION,
      promptVersion: PROMPT_VERSION,
      plan,
      shardId: shard.id,
      shardIndex: index,
      shardCount: plan.shards.length,
      effort: shard.effort,
      moduleId: shard.moduleId,
      ...(shardSnapshot.manifest === undefined ? {} : { manifest: shardSnapshot.manifest }),
      meta: {
        reviewId: view.review.id,
        round: round.no,
        cwd: initiator?.cwd ?? view.review.repoRoot,
        shardId: shard.id,
        shardIndex: index,
        shardCount: plan.shards.length,
        effort: shard.effort,
        moduleId: shard.moduleId,
        paths: shard.paths,
        ...(initiator === undefined ? {} : { initiator }),
      },
    });
  }
}

async function enqueueLegacyJob(
  ctx: RouteContext,
  view: ReviewView,
  round: NonNullable<ReviewView['review']['rounds'][number]>,
): Promise<void> {
  const snapshot = view.latestSnapshot;
  const { prompt, includedFiles } = buildReviewPrompt({
    title: view.review.title,
    reviewId: view.review.id,
    round: round.no,
    kind: reviewKind(view, round),
    files: snapshot?.files ?? [],
    ...(promptContextFor(view, round) === undefined
      ? {}
      : { context: promptContextFor(view, round) }),
  });
  const manifest = snapshot?.manifest;
  const coverage = coverageForSnapshot(snapshot, includedFiles);
  if (coverage !== undefined) {
    await append(ctx, view.review.id, 'agent/coverage', {
      coverage,
      round: round.no,
    });
  }
  const initiator = view.review.initiator;
  ctx.jobs.enqueue({
    reviewId: view.review.id,
    round: round.no,
    kind: reviewKind(view, round),
    backend: 'worker',
    prompt,
    diff: snapshot,
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: PROMPT_VERSION,
    ...(manifest === undefined ? {} : { manifest }),
    meta: {
      reviewId: view.review.id,
      round: round.no,
      cwd: initiator?.cwd ?? view.review.repoRoot,
      ...(initiator === undefined ? {} : { initiator }),
    },
  });
}

async function enqueueWorkerJob(ctx: RouteContext, reviewId: string): Promise<void> {
  const view = await ctx.service.get(reviewId);
  const round = view.review.rounds.at(-1);
  if (round === undefined || view.review.reviewer?.backend !== 'worker') return;
  // A repeated create/refresh with the same idempotency key must not enqueue a
  // second job or reset coverage for a round this daemon already queued.
  if (ctx.jobs.listReview(reviewId).some((job) => job.round === round.no)) return;
  const snapshot = view.latestSnapshot;
  const fullManifest = snapshot?.manifest;

  if (snapshot?.schemaVersion === 2 && fullManifest !== undefined) {
    const plan: ReviewPlan = buildReviewPlan({ manifest: fullManifest });
    await append(ctx, reviewId, 'agent/coverage', {
      coverage: coverageFromPlan(plan),
      round: round.no,
    });

    if (plan.shards.length === 0) {
      // Nothing needs a model call: every path is binary/generated/unchanged.
      const aggregate = aggregateShardReports({
        reviewId,
        round: round.no,
        backend: 'worker',
        plan,
        reports: [],
      });
      await append(ctx, reviewId, 'agent/report', {
        report: aggregate.report,
        coverage: aggregate.coverage,
      } as never);
      return;
    }

    await enqueueShardJobs(ctx, view, round, plan);
    return;
  }

  // Legacy v1 snapshots keep the original single-job path.
  await enqueueLegacyJob(ctx, view, round);
}

/**
 * Requeues shards with a known failure, never shards already represented in the
 * report. When no failure was recorded (for example after a daemon restart), it
 * falls back to shards without a report so recovery remains possible. The
 * snapshot, round and completed reports stay unchanged, so retry does not
 * create a new round or discard work that already succeeded.
 */
async function retryWorkerAgent(ctx: RouteContext, reviewId: string): Promise<ReviewView> {
  const view = await ctx.service.get(reviewId);
  const round = view.review.rounds.at(-1);
  const agent = view.review.agent;
  if (view.review.status === 'closed' || view.review.deletedAt !== undefined) {
    throw new ApiError('conflict', 'cannot retry a closed review');
  }
  if (view.review.reviewer?.backend !== 'worker') {
    throw new ApiError('conflict', 'only worker reviewers can be retried in place');
  }
  if (round === undefined) throw new ApiError('conflict', 'review has no round to retry');
  if (agent === undefined || (agent.status !== 'failed' && agent.status !== 'partial')) {
    throw new ApiError('conflict', 'reviewer is not failed or partial');
  }
  if (agent.round !== undefined && agent.round !== round.no) {
    throw new ApiError('conflict', 'reviewer belongs to a different round');
  }
  const active = ctx.jobs
    .listReview(reviewId)
    .some((job) => job.round === round.no && (job.status === 'queued' || job.status === 'leased'));
  if (active) throw new ApiError('conflict', 'reviewer still has active jobs');
  const snapshot = view.latestSnapshot;
  if (snapshot === null) throw new ApiError('conflict', 'review has no snapshot to retry');
  const manifest = snapshot.manifest;

  if (snapshot.schemaVersion === 2 && manifest !== undefined) {
    const plan = buildReviewPlan({ manifest });
    const reportedShardIds = new Set(
      (agent.shards ?? [])
        .filter((shard) => shard.round === round.no)
        .map((shard) => shard.shardId),
    );
    const targets = retryTargetShardIds({
      plan,
      round: round.no,
      reportedShardIds,
      coverage: agent.coverage,
      jobs: ctx.jobs.listReview(reviewId),
    });
    await append(ctx, reviewId, 'agent/retry', {
      round: round.no,
      shardIds: targets,
    } as never);
    ctx.jobs.clearAggregated(reviewId, round.no);
    try {
      if (targets.length === 0) {
        const aggregate = aggregateShardReports({
          reviewId,
          round: round.no,
          backend: 'worker',
          plan,
          reports: (agent.shards ?? [])
            .filter((shard) => shard.round === round.no)
            .map((shard) => ({ shardId: shard.shardId, report: shard.report })),
        });
        await append(ctx, reviewId, 'agent/report', {
          report: aggregate.report,
          coverage: aggregate.coverage,
        } as never);
      } else {
        await enqueueShardJobs(ctx, view, round, plan, new Set(targets));
      }
    } catch (error) {
      // The retry event above made the agent queued. If rebuilding the shard
      // bundles fails, leave a durable failed state instead of a queued ghost
      // that cannot be retried again.
      ctx.jobs.cancelReview(reviewId);
      await append(ctx, reviewId, 'agent/failed', {
        code: 'retry-enqueue-failed',
        message: error instanceof Error ? error.message : 'cannot enqueue retry shards',
      } as never).catch(() => undefined);
      throw error;
    }
    return ctx.service.get(reviewId);
  }

  await append(ctx, reviewId, 'agent/retry', { round: round.no, shardIds: [] } as never);
  ctx.jobs.clearAggregated(reviewId, round.no);
  try {
    await enqueueLegacyJob(ctx, view, round);
  } catch (error) {
    ctx.jobs.cancelReview(reviewId);
    await append(ctx, reviewId, 'agent/failed', {
      code: 'retry-enqueue-failed',
      message: error instanceof Error ? error.message : 'cannot enqueue retry job',
    } as never).catch(() => undefined);
    throw error;
  }
  return ctx.service.get(reviewId);
}

function scopeForSnapshot(snapshot: Snapshot): DiffScope {
  const scope = snapshot.scope;
  if (scope.kind === 'worktree') return { kind: 'worktree', baseRef: scope.baseSha };
  if (scope.kind === 'commit') return { kind: 'commit', sha: scope.headSha ?? scope.baseSha };
  if (scope.kind === 'commits') {
    return {
      kind: 'commits',
      shas: scope.shas ?? [scope.baseSha, ...(scope.headSha ? [scope.headSha] : [])],
    };
  }
  return {
    kind: 'range',
    baseRef: scope.baseSha,
    headRef: scope.headSha ?? scope.headRef ?? 'HEAD',
  };
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
    if (rest.length === 0 && method === 'PATCH') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const input = {
        ...(body.title === undefined ? {} : { title: str(body.title, 'title') }),
        ...(body.reviewer === undefined
          ? {}
          : { reviewer: object(body.reviewer, 'reviewer') as unknown as ReviewerConfig }),
        ...(body.scope === undefined
          ? {}
          : { scope: object(body.scope, 'scope') as unknown as DiffScope }),
      };
      const before = body.scope === undefined ? null : await ctx.service.get(reviewId);
      if (body.scope !== undefined) await failOrphanedWorkerAgent(ctx, reviewId);
      const view = await ctx.service.updateReview(reviewId, input, ctxFor(req, options.auth));
      if (before !== null && view.review.rounds.length > before.review.rounds.length) {
        await enqueueWorkerJob(ctx, reviewId);
      }
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest.length === 0 && method === 'DELETE') {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const reason = body.reason === undefined ? undefined : str(body.reason, 'reason');
      await ctx.service.deleteReview(reviewId, ctxFor(req, options.auth), reason);
      ctx.jobs.cancelReview(reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (rest[0] === 'snapshot' && rest[1] !== undefined && rest[2] === 'diff' && method === 'GET') {
      const round = Number(rest[1]);
      if (!Number.isInteger(round) || round <= 0)
        throw new ApiError('validation', 'round is required');
      const rawPath = url.searchParams.get('path');
      if (rawPath === null || rawPath.trim() === '') {
        throw new ApiError('validation', 'path is required');
      }
      const filePath = rawPath.trim();
      if (
        filePath.includes('\0') ||
        filePath.length > 4096 ||
        isAbsolute(filePath) ||
        filePath.split('/').some((part) => part === '..' || part === '')
      ) {
        throw new ApiError('validation', 'path must be a relative file path');
      }
      const view = await ctx.service.get(reviewId);
      const roundView = view.review.rounds.find((item) => item.no === round);
      if (roundView === undefined) throw new ApiError('not-found', `round ${round} not found`);
      const snapshotView = await ctx.service.snapshot(reviewId, round);
      if (!snapshotView.snapshot.manifest?.files.some((item) => item.path === filePath)) {
        throw new ApiError('not-found', `file not found in round ${round}: ${filePath}`);
      }
      const filtered = await buildSnapshot({
        repoRoot: view.review.repoRoot,
        scope: scopeForSnapshot(snapshotView.snapshot),
        paths: [filePath],
        includeContent: true,
        includeUntracked: snapshotView.snapshot.scope.kind === 'worktree',
        maxDiffBytes: 2 * 1024 * 1024,
        maxFiles: 4,
        maxFileLines: 20_000,
        maxContentBytes: 1_048_576,
        maxTotalContentBytes: 2_097_152,
      });
      const file = filtered.files.find((item) => item.path === filePath);
      if (file === undefined) {
        throw new ApiError('not-found', `diff not available for ${filePath}`);
      }
      sendJson(res, 200, { file, round, path: filePath });
      return;
    }
    if (rest[0] === 'snapshot' && rest[1] !== undefined && rest[2] === 'file' && method === 'GET') {
      const round = Number(rest[1]);
      if (!Number.isInteger(round) || round <= 0)
        throw new ApiError('validation', 'round is required');
      const rawPath = url.searchParams.get('path');
      if (rawPath === null || rawPath.trim() === '') {
        throw new ApiError('validation', 'path is required');
      }
      const filePath = rawPath.trim();
      if (
        filePath.includes('\0') ||
        filePath.length > 4096 ||
        isAbsolute(filePath) ||
        filePath.split('/').some((part) => part === '..' || part === '')
      ) {
        throw new ApiError('validation', 'path must be a relative file path');
      }
      const side = url.searchParams.get('side') === 'old' ? 'old' : 'new';
      const view = await ctx.service.get(reviewId);
      const target = view.review.rounds.find((item) => item.no === round);
      if (target === undefined) throw new ApiError('not-found', `round ${round} not found`);
      const snapshotView = await ctx.service.snapshot(reviewId, round);
      const manifestFile = snapshotView.snapshot.manifest?.files.find(
        (item) => item.path === filePath,
      );
      if (manifestFile === undefined) {
        throw new ApiError('not-found', `file not found in round ${round}: ${filePath}`);
      }
      const revision =
        side === 'old' ? target.baseSha : target.headSha === '' ? null : target.headSha;
      const content = await readBlob(view.review.repoRoot, revision, filePath, 5000, 1_048_576);
      if (content.lines === null && content.reason === 'unreadable') {
        throw new ApiError('not-found', `file is not present on the ${side} side: ${filePath}`);
      }
      sendJson(res, 200, {
        file: filePath,
        round,
        side,
        revision,
        lines: content.lines,
        lineCount: content.lines?.length ?? 0,
        binary: content.binary,
        oversized: content.oversized,
        symlink: content.symlink,
        ...(content.reason === undefined ? {} : { reason: content.reason }),
      });
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
      const hasBody = body.body !== undefined;
      const hasState = body.state !== undefined;
      if (hasBody === hasState) {
        throw new ApiError('validation', 'provide exactly one of body or state');
      }
      const commentId = decodeURIComponent(rest[1]);
      let view;
      if (hasBody) {
        view = await ctx.service.editComment(
          reviewId,
          commentId,
          { body: str(body.body, 'body') },
          ctxFor(req, options.auth),
        );
      } else {
        const state = body.state;
        if (state !== 'open' && state !== 'resolved' && state !== 'dismissed') {
          throw new ApiError('validation', 'state must be open, resolved or dismissed');
        }
        view = await ctx.service.setCommentState(
          reviewId,
          commentId,
          state as CommentState,
          ctxFor(req, options.auth),
        );
      }
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (
      rest[0] === 'comments' &&
      rest[1] !== undefined &&
      rest.length === 2 &&
      method === 'DELETE'
    ) {
      const view = await ctx.service.deleteComment(
        reviewId,
        decodeURIComponent(rest[1]),
        ctxFor(req, options.auth),
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (
      rest[0] === 'findings' &&
      rest[1] === 'decisions' &&
      rest.length === 2 &&
      method === 'POST'
    ) {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const state = body.state;
      if (state !== 'accepted' && state !== 'dismissed') {
        throw new ApiError('validation', 'state must be accepted or dismissed');
      }
      const findingIds = body.findingIds;
      if (
        findingIds !== undefined &&
        (!Array.isArray(findingIds) ||
          findingIds.length === 0 ||
          findingIds.length > 1000 ||
          findingIds.some((findingId) => typeof findingId !== 'string' || findingId.trim() === ''))
      ) {
        throw new ApiError(
          'validation',
          'findingIds must be a non-empty array of up to 1000 non-empty strings',
        );
      }
      const view = await ctx.service.decideFindings(
        reviewId,
        { state, ...(findingIds === undefined ? {} : { findingIds }) },
        ctxFor(req, options.auth),
      );
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (
      rest[0] === 'findings' &&
      rest[1] !== undefined &&
      rest[2] === 'decision' &&
      rest.length === 3 &&
      method === 'POST'
    ) {
      const body = await readJson(req, ctx.config.maxBodyBytes);
      const state = body.state;
      if (state !== 'accepted' && state !== 'dismissed') {
        throw new ApiError('validation', 'state must be accepted or dismissed');
      }
      if (body.note !== undefined && typeof body.note !== 'string') {
        throw new ApiError('validation', 'note must be a string');
      }
      const note = typeof body.note === 'string' ? body.note : undefined;
      const view = await ctx.service.decideFinding(
        reviewId,
        decodeURIComponent(rest[1]),
        { state, ...(note === undefined ? {} : { note }) },
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
      await failOrphanedWorkerAgent(ctx, reviewId);
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
    if (rest[0] === 'agent' && rest[1] === 'retry' && method === 'POST') {
      const view = await retryWorkerAgent(ctx, reviewId);
      await ctx.hub.sync(reviewId);
      sendJson(res, 200, view);
      return;
    }
    if (rest[0] === 'agent' && rest[1] === 'cancel' && method === 'POST') {
      const canceled = ctx.jobs.cancelReview(reviewId);
      let serviceOwned = true;
      await ctx.service.cancelAgent(reviewId, ctxFor(req, options.auth)).catch((error: unknown) => {
        if (!(error instanceof ReviewError) || error.code !== 'conflict') throw error;
        serviceOwned = false;
      });
      if (!serviceOwned || canceled.length > 0) {
        // Worker jobs are owned by this daemon's memory queue, and a persisted
        // active agent may outlive a reviewer-backend change. A service-side
        // cancel cannot append for either, so leave a durable terminal event.
        await append(ctx, reviewId, 'agent/failed', {
          code: 'canceled',
          message: 'reviewer canceled by request',
        } as never);
      }
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
    if (action !== 'ack' && job.status === 'canceled') {
      // A worker may have posted results just as the user canceled. Ignore
      // those results instead of reviving a canceled round or appending a
      // second terminal event.
      sendJson(res, 200, { accepted: false, canceled: true });
      return;
    }
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
        const persistedFinding =
          job.shardId === undefined ? finding : { ...finding, id: `${job.shardId}:${finding.id}` };
        await append(ctx, job.reviewId, 'agent/finding', {
          finding: persistedFinding,
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
        await maybeFinalizeShards(ctx, job.reviewId, job.round);
        sendJson(res, 200, { accepted: true, duplicate: true });
        return;
      }
      const baseReport: AgentReport = {
        ...validation.report,
        reviewId: job.reviewId,
        round: job.round,
        backend: 'worker',
        rejected: validation.rejected,
        warnings: validation.warnings,
      };
      const agentReport =
        job.shardId === undefined ? baseReport : namespaceShardReport(baseReport, job.shardId);
      // The report is durable before the attempt is marked done. If the append
      // fails the worker can retry; the reverse order loses the report.
      await append(
        ctx,
        job.reviewId,
        job.shardId === undefined ? 'agent/report' : 'agent/shard',
        job.shardId === undefined
          ? ({ report: agentReport } as never)
          : ({
              shardId: job.shardId,
              shardIndex: job.shardIndex ?? 0,
              shardCount: job.shardCount ?? 1,
              round: job.round,
              report: agentReport,
              ...(job.plan === undefined
                ? {}
                : {
                    paths: job.plan.shards.find((shard) => shard.id === job.shardId)?.paths ?? [],
                    tier: job.effort ?? 'deep',
                  }),
            } as never),
      );
      const accepted = ctx.jobs.acceptReport(jobId, attemptId);
      if (accepted === null) {
        if (ctx.jobs.job(jobId)?.status === 'done') {
          await maybeFinalizeShards(ctx, job.reviewId, job.round);
          sendJson(res, 200, { accepted: true, duplicate: true });
          return;
        }
        throw new ApiError('conflict', 'stale or unknown job attempt');
      }
      if (job.shardId !== undefined) {
        await maybeFinalizeShards(ctx, job.reviewId, job.round);
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
      if (job.shardId !== undefined) {
        await maybeFinalizeShards(ctx, job.reviewId, job.round);
      }
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
