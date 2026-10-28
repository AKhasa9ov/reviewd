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
  prompt: string;
  diff?: unknown;
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
  bundle: JobBundle;
}

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
  const reportFindings = (report as { findings?: unknown }).findings;
  const findings = Array.isArray(result.findings)
    ? result.findings
    : Array.isArray(reportFindings)
      ? reportFindings
      : [];
  return { findings, report };
}
