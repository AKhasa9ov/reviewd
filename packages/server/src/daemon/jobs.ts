import { randomBytes } from 'node:crypto';
import type { ReviewManifest, ReviewPlan } from '@dsh-code-review/core';
import { ApiError } from './errors.js';
import { PROMPT_VERSION, PROTOCOL_VERSION } from './types.js';
import type { LeaseView } from './types.js';

export interface WorkerRegistration {
  id?: string;
  name?: string;
  harness?: string;
}

export interface WorkerView {
  id: string;
  name: string;
  harness: string;
  lastSeen: string;
  leaseMs: number;
  heartbeatMs: number;
}

export interface JobRecord {
  id: string;
  reviewId: string;
  round: number;
  kind: 'initial' | 'verify';
  backend: string;
  prompt: string;
  diff: unknown;
  meta: Record<string, unknown>;
  status: 'queued' | 'leased' | 'done' | 'failed' | 'canceled';
  attempt: number;
  attemptId?: string;
  workerId?: string;
  leaseUntil?: string;
  protocolVersion: number;
  promptVersion: number;
  manifest?: ReviewManifest;
  /** Full round plan for a sharded job; absent for legacy single-job rounds. */
  plan?: ReviewPlan;
  shardId?: string;
  shardIndex?: number;
  shardCount?: number;
  effort?: 'deep' | 'light';
  moduleId?: string;
  createdAt: string;
}

interface AttemptState {
  findings: Set<string>;
  report: boolean;
  failed: boolean;
}

export interface JobQueueOptions {
  now?: () => Date;
  leaseMs?: number;
  maxAttempts?: number;
  heartbeatMs?: number;
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

/** In-memory leases for one daemon. Queue state is rebuilt by clients; review events hold the audit trail. */
export class JobQueue {
  private readonly now: () => Date;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly heartbeatMs: number;
  private readonly workers = new Map<string, WorkerView>();
  private readonly jobs = new Map<string, JobRecord>();
  private readonly order: string[] = [];
  private readonly attempts = new Map<string, AttemptState>();
  /** Finding ids accepted for a job across retries. */
  private readonly findingsSeen = new Map<string, Set<string>>();
  private readonly aggregated = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(options: JobQueueOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.leaseMs = options.leaseMs ?? 60_000;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.heartbeatMs = options.heartbeatMs ?? 20_000;
    this.sweepTimer = setInterval(() => this.sweep(), Math.max(100, Math.floor(this.leaseMs / 4)));
    this.sweepTimer.unref?.();
  }

  register(input: WorkerRegistration = {}): WorkerView {
    const id = input.id ?? randomId('wrk');
    const worker: WorkerView = {
      id,
      name: input.name ?? id,
      harness: input.harness ?? 'unknown',
      lastSeen: this.now().toISOString(),
      leaseMs: this.leaseMs,
      heartbeatMs: this.heartbeatMs,
    };
    this.workers.set(id, worker);
    return { ...worker };
  }

  heartbeat(workerId: string): WorkerView | null {
    const worker = this.workers.get(workerId);
    if (worker === undefined) return null;
    worker.lastSeen = this.now().toISOString();
    for (const job of this.jobs.values()) {
      if (job.status === 'leased' && job.workerId === workerId) {
        job.leaseUntil = new Date(this.now().getTime() + this.leaseMs).toISOString();
      }
    }
    return { ...worker };
  }

  worker(workerId: string): WorkerView | null {
    const worker = this.workers.get(workerId);
    return worker === undefined ? null : { ...worker };
  }

  enqueue(input: {
    reviewId: string;
    round: number;
    kind: 'initial' | 'verify';
    backend: string;
    prompt: string;
    diff: unknown;
    meta?: Record<string, unknown>;
    protocolVersion?: number;
    promptVersion?: number;
    manifest?: ReviewManifest;
    plan?: ReviewPlan;
    shardId?: string;
    shardIndex?: number;
    shardCount?: number;
    effort?: 'deep' | 'light';
    moduleId?: string;
  }): JobRecord {
    const job: JobRecord = {
      id: randomId('job'),
      reviewId: input.reviewId,
      round: input.round,
      kind: input.kind,
      backend: input.backend,
      prompt: input.prompt,
      diff: input.diff,
      meta: input.meta ?? {},
      status: 'queued',
      attempt: 0,
      protocolVersion: input.protocolVersion ?? PROTOCOL_VERSION,
      promptVersion: input.promptVersion ?? PROMPT_VERSION,
      ...(input.manifest === undefined ? {} : { manifest: input.manifest }),
      ...(input.plan === undefined ? {} : { plan: input.plan }),
      ...(input.shardId === undefined ? {} : { shardId: input.shardId }),
      ...(input.shardIndex === undefined ? {} : { shardIndex: input.shardIndex }),
      ...(input.shardCount === undefined ? {} : { shardCount: input.shardCount }),
      ...(input.effort === undefined ? {} : { effort: input.effort }),
      ...(input.moduleId === undefined ? {} : { moduleId: input.moduleId }),
      createdAt: this.now().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.findingsSeen.set(job.id, new Set());
    this.order.push(job.id);
    this.notify();
    return { ...job };
  }

  async next(workerId: string, waitMs: number, signal?: AbortSignal): Promise<LeaseView | null> {
    const worker = this.workers.get(workerId);
    if (worker === undefined) {
      // A daemon restart forgets registrations. Tell the worker so it can
      // register again instead of polling forever with a dead id.
      throw new ApiError('unauthorized', 'unknown worker; register again');
    }
    const deadline = this.now().getTime() + Math.max(0, waitMs);
    for (;;) {
      this.sweep();
      const job = this.pick();
      if (job !== undefined) return this.lease(job, workerId);
      const remaining = deadline - this.now().getTime();
      if (remaining <= 0 || signal?.aborted === true) return null;
      await this.sleep(Math.min(remaining, 250), signal);
    }
  }

  /** Returns a snapshot only if this is the current or last-known lease. */
  attempt(jobId: string, attemptId: string): JobRecord | null {
    const job = this.jobs.get(jobId);
    if (job === undefined || job.attemptId !== attemptId) return null;
    return { ...job };
  }

  /** Checks a finding without consuming its id, so the caller can append first. */
  hasFinding(jobId: string, attemptId: string, findingId: string): boolean {
    if (this.leased(jobId, attemptId) === null) return false;
    return this.findingsSeen.get(jobId)?.has(findingId) === true;
  }

  /** Number of findings already accepted for this job, across retries. */
  findingCount(jobId: string, attemptId: string): number {
    if (this.leased(jobId, attemptId) === null) return 0;
    return this.findingsSeen.get(jobId)?.size ?? 0;
  }

  acceptFinding(jobId: string, attemptId: string, findingId: string): JobRecord | null {
    const job = this.leased(jobId, attemptId);
    if (job === null) return null;
    const state = this.attempts.get(attemptId);
    if (state === undefined) return null;
    const seen = this.findingsSeen.get(jobId) ?? new Set<string>();
    if (seen.has(findingId) || seen.size >= 200) return null;
    seen.add(findingId);
    this.findingsSeen.set(jobId, seen);
    state.findings.add(findingId);
    return { ...job };
  }

  acceptReport(jobId: string, attemptId: string): JobRecord | null {
    const job = this.leased(jobId, attemptId);
    if (job === null) return null;
    const state = this.attempts.get(attemptId);
    if (state === undefined || state.report) return null;
    state.report = true;
    job.status = 'done';
    delete job.leaseUntil;
    this.notify();
    return { ...job };
  }

  fail(
    jobId: string,
    attemptId: string,
    retryable: boolean,
  ): { job: JobRecord; retried: boolean } | null {
    const job = this.leased(jobId, attemptId);
    if (job === null) return null;
    const state = this.attempts.get(attemptId);
    if (state === undefined || state.failed) return null;
    state.failed = true;
    if (retryable && job.attempt < this.maxAttempts) {
      job.status = 'queued';
      delete job.leaseUntil;
      delete job.workerId;
      this.notify();
      return { job: { ...job }, retried: true };
    }
    job.status = 'failed';
    delete job.leaseUntil;
    this.notify();
    return { job: { ...job }, retried: false };
  }

  cancelReview(reviewId: string): JobRecord[] {
    const canceled: JobRecord[] = [];
    for (const job of this.jobs.values()) {
      if (job.reviewId !== reviewId) continue;
      if (job.status === 'queued' || job.status === 'leased') {
        job.status = 'canceled';
        delete job.leaseUntil;
        canceled.push({ ...job });
      }
    }
    if (canceled.length > 0) this.notify();
    return canceled;
  }

  job(jobId: string): JobRecord | null {
    const job = this.jobs.get(jobId);
    return job === undefined ? null : { ...job };
  }

  stats(): { queued: number; leased: number; workers: number } {
    let queued = 0;
    let leased = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'queued') queued += 1;
      if (job.status === 'leased') leased += 1;
    }
    return { queued, leased, workers: this.workers.size };
  }

  listReview(reviewId: string): JobRecord[] {
    return [...this.jobs.values()]
      .filter((job) => job.reviewId === reviewId)
      .map((job) => ({ ...job }));
  }

  /** Prevents two concurrent report handlers from appending a final aggregate twice. */
  isAggregated(reviewId: string, round: number): boolean {
    return this.aggregated.has(`${reviewId}:${round}`);
  }

  markAggregated(reviewId: string, round: number): void {
    this.aggregated.add(`${reviewId}:${round}`);
  }

  /** A retry makes the previous aggregate stale; the next terminal job may aggregate again. */
  clearAggregated(reviewId: string, round: number): void {
    this.aggregated.delete(`${reviewId}:${round}`);
  }

  sweep(): void {
    const now = this.now().getTime();
    for (const job of this.jobs.values()) {
      if (job.status !== 'leased' || job.leaseUntil === undefined) continue;
      if (new Date(job.leaseUntil).getTime() > now) continue;
      if (job.attempt >= this.maxAttempts) {
        job.status = 'failed';
      } else {
        job.status = 'queued';
        delete job.workerId;
        delete job.attemptId;
        delete job.leaseUntil;
      }
      this.notify();
    }
    for (const [id, worker] of this.workers) {
      if (now - new Date(worker.lastSeen).getTime() > this.heartbeatMs * 3) this.workers.delete(id);
    }
  }

  close(): void {
    if (this.sweepTimer !== undefined) clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    this.listeners.clear();
  }

  private leased(jobId: string, attemptId: string): JobRecord | null {
    const job = this.jobs.get(jobId);
    if (job === undefined || job.attemptId !== attemptId || job.status !== 'leased') return null;
    return job;
  }

  private pick(): JobRecord | undefined {
    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (job?.status === 'queued') return job;
    }
    return undefined;
  }

  private lease(job: JobRecord, workerId: string): LeaseView {
    job.status = 'leased';
    job.attempt += 1;
    job.attemptId = randomId('att');
    job.workerId = workerId;
    job.leaseUntil = new Date(this.now().getTime() + this.leaseMs).toISOString();
    this.attempts.set(job.attemptId, { findings: new Set(), report: false, failed: false });
    return {
      id: job.id,
      reviewId: job.reviewId,
      round: job.round,
      kind: job.kind,
      backend: job.backend,
      attempt: job.attempt,
      attemptId: job.attemptId,
      leaseUntil: job.leaseUntil,
      protocolVersion: job.protocolVersion,
      promptVersion: job.promptVersion,
      ...(job.shardId === undefined ? {} : { shardId: job.shardId }),
      ...(job.shardIndex === undefined ? {} : { shardIndex: job.shardIndex }),
      ...(job.shardCount === undefined ? {} : { shardCount: job.shardCount }),
      ...(job.effort === undefined ? {} : { effort: job.effort }),
      ...(job.moduleId === undefined ? {} : { moduleId: job.moduleId }),
      ...(job.plan === undefined ? {} : { plan: job.plan }),
      bundle: {
        protocolVersion: job.protocolVersion,
        promptVersion: job.promptVersion,
        prompt: job.prompt,
        diff: job.diff,
        ...(job.manifest === undefined ? {} : { manifest: job.manifest }),
        schema: { schemaVersion: 1 },
        meta: {
          ...job.meta,
          reviewId: job.reviewId,
          round: job.round,
          kind: job.kind,
          ...(job.shardId === undefined ? {} : { shardId: job.shardId }),
          ...(job.shardIndex === undefined ? {} : { shardIndex: job.shardIndex }),
          ...(job.shardCount === undefined ? {} : { shardCount: job.shardCount }),
          ...(job.effort === undefined ? {} : { effort: job.effort }),
          ...(job.moduleId === undefined ? {} : { moduleId: job.moduleId }),
        },
      },
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      const onAbort = (): void => done();
      function done(): void {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
