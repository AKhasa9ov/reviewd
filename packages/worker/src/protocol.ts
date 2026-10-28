import { isDeepStrictEqual } from 'node:util';

/** Lease protocol version this worker understands. v0 is the legacy unversioned lease. */
export const PROTOCOL_VERSION = 1;
/** Prompt dialect version this worker understands. v0 is the legacy unversioned prompt. */
export const PROMPT_VERSION = 1;

export interface WorkerApi {
  get<T = unknown>(path: string, signal?: AbortSignal): Promise<T>;
  post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T>;
}

export interface WorkerIdentity {
  id?: string;
  name?: string;
  harness: string;
}

export interface JobBundle {
  protocolVersion?: number;
  promptVersion?: number;
  prompt: string;
  diff?: unknown;
  /** Complete changed-file manifest produced by reviewd; the shape is owned by core. */
  manifest?: unknown;
  schema?: unknown;
  meta?: Record<string, unknown>;
}

export interface JobLease {
  id: string;
  reviewId: string;
  round: number;
  kind: 'initial' | 'verify';
  backend: string;
  attempt: number;
  attemptId: string;
  leaseUntil: string;
  protocolVersion?: number;
  promptVersion?: number;
  bundle: JobBundle;
}

export interface LeaseVersions {
  protocolVersion: number;
  promptVersion: number;
  /** True when a version is absent, which identifies a v0 lease during migration. */
  legacy: boolean;
}

/** Versions this build accepts; injectable so tests can pin per-field routing. */
export interface SupportedLeaseVersions {
  protocol: number;
  prompt: number;
}

const SUPPORTED_LEASE_VERSIONS: SupportedLeaseVersions = {
  protocol: PROTOCOL_VERSION,
  prompt: PROMPT_VERSION,
};

export interface RunnerResult {
  findings?: readonly unknown[];
  report: Record<string, unknown>;
}

export interface HarnessRunner {
  run(lease: JobLease, signal: AbortSignal): Promise<RunnerResult>;
  cancel?(): void;
}

export interface WorkerLogger {
  warn?(message: string): void;
  info?(message: string): void;
}

export interface WorkerLoopOptions {
  api: WorkerApi;
  identity: WorkerIdentity;
  runner: HarnessRunner;
  pollMs: number;
  heartbeatMs: number;
  leaseWaitSeconds?: number;
  logger?: WorkerLogger;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  randomId?: () => string;
}

export class WorkerRunError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.name = 'WorkerRunError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isStaleWorkerError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return (
    candidate.status === 401 ||
    candidate.status === 403 ||
    candidate.status === 404 ||
    candidate.code === 'unauthorized' ||
    candidate.code === 'not-found'
  );
}

function leaseVersion(label: 'protocol' | 'prompt', supported: number, value: unknown): number {
  // Missing versions identify the legacy v0 lease. v0 is accepted only during
  // migration; every new adapter must emit and receive v1.
  if (value === undefined) return 0;
  if (value === 0 || value === supported) return value;
  throw new WorkerRunError(
    'protocol-mismatch',
    `worker supports ${label} version ${supported}, but the lease declares ${label} version ${String(
      value,
    )}; upgrade the worker or reviewd so both use ${label} version ${supported}`,
    false,
  );
}

/**
 * Reads the lease protocol and prompt versions, preferring the flattened lease
 * fields and falling back to the bundle envelope. Protocol and prompt values are
 * checked against their own supported versions. Throws a non-retryable
 * `protocol-mismatch` before a runner sees an unsupported lease; callers must
 * invoke this before `runner.run`.
 *
 * A top-level version and its bundle copy are expected to agree; when they do
 * not, the top-level lease field wins and the conflict is not rejected. C2 can
 * harden this once a second adapter emits leases.
 */
export function readLeaseVersions(
  lease: JobLease,
  supported: SupportedLeaseVersions = SUPPORTED_LEASE_VERSIONS,
): LeaseVersions {
  const protocolVersion = leaseVersion(
    'protocol',
    supported.protocol,
    lease.protocolVersion ?? lease.bundle.protocolVersion,
  );
  const promptVersion = leaseVersion(
    'prompt',
    supported.prompt,
    lease.promptVersion ?? lease.bundle.promptVersion,
  );
  return {
    protocolVersion,
    promptVersion,
    legacy: protocolVersion === 0 || promptVersion === 0,
  };
}

export function normalizeRunnerResult(result: RunnerResult): {
  findings: readonly unknown[];
  report: Record<string, unknown>;
} {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new WorkerRunError('invalid-output', 'runner returned no result', false);
  }
  const report = result.report;
  if (typeof report !== 'object' || report === null || Array.isArray(report)) {
    throw new WorkerRunError('invalid-output', 'runner returned no report', false);
  }
  if (report.schemaVersion !== 1) {
    throw new WorkerRunError(
      'invalid-output',
      `runner report must use schemaVersion 1 (received ${String(report.schemaVersion)})`,
      false,
    );
  }
  const resultFindings = Array.isArray(result.findings) ? result.findings : [];
  const reportFindings = Array.isArray(report.findings) ? report.findings : [];
  if (
    resultFindings.length > 0 &&
    reportFindings.length > 0 &&
    !isDeepStrictEqual(resultFindings, reportFindings)
  ) {
    throw new WorkerRunError(
      'invalid-output',
      'runner returned findings in both the result and the report, and they differ; return one source or make them identical',
      false,
    );
  }
  // `report.findings` is canonical for the final report, so whenever only the
  // result carries findings they are copied into a normalized report. When both
  // are non-empty they are identical (checked above) and either can be used.
  const findings = resultFindings.length > 0 ? resultFindings : reportFindings;
  return { findings, report: { ...report, findings } };
}
