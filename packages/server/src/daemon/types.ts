import type { Actor, ReviewService } from '@dsh-code-review/core';

export interface DaemonConfig {
  host?: string;
  port?: number;
  storeDir: string;
  publicUrl?: string;
  token: string;
  trustProxy?: boolean;
  maxBodyBytes?: number;
  longPollMs?: number;
  heartbeatMs?: number;
  jobLeaseMs?: number;
  jobMaxAttempts?: number;
  rateLimit?: { mutations: number; reads: number; windowMs: number };
}

export interface DaemonDeps {
  service?: ReviewService;
  now?: () => Date;
}

export interface ReviewDaemon {
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface RequestActor {
  actor: Actor;
  auth: 'bearer' | 'cookie';
}

export interface JobBundle {
  prompt: string;
  diff: unknown;
  schema: unknown;
  meta: Record<string, unknown>;
}

export interface LeaseView {
  id: string;
  reviewId: string;
  round: number;
  kind: 'initial' | 'verify';
  backend: string;
  attempt: number;
  attemptId: string;
  leaseUntil: string;
  bundle: JobBundle;
}
