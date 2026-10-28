import type { Actor, ReviewManifest, ReviewService } from '@dsh-code-review/core';

/** Wire protocol version reviewd emits on every worker lease. v1 is the first explicit version. */
export const PROTOCOL_VERSION = 1;
/** Prompt dialect version reviewd emits with every worker bundle. */
export const PROMPT_VERSION = 1;

export interface DaemonConfig {
  host?: string;
  port?: number;
  storeDir: string;
  publicUrl?: string;
  webDir?: string;
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
  protocolVersion: number;
  promptVersion: number;
  prompt: string;
  diff: unknown;
  /** Complete changed-file manifest; absent on legacy snapshots and before R1.2 emits it. */
  manifest?: ReviewManifest;
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
  protocolVersion: number;
  promptVersion: number;
  bundle: JobBundle;
}
