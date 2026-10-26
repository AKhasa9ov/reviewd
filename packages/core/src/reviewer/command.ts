import { spawn } from 'node:child_process';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../git/run.js';
import { ReviewerError } from './types.js';
import type {
  FindingSink,
  GitStatusRunner,
  ReviewerBackend,
  ReviewerJob,
  ReviewerReport,
} from './types.js';

export interface CommandReviewerOptions {
  /** argv array only; never passed through a shell. */
  command: readonly string[];
  runGit?: GitStatusRunner;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const BASE_ENV_KEYS = ['PATH', 'HOME', 'LANG', 'TMPDIR', 'TMP', 'TEMP'] as const;
const WINDOWS_ENV_KEYS = [
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
] as const;

function reviewerEnv(job: ReviewerJob, overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const keys =
    process.platform === 'win32' ? [...BASE_ENV_KEYS, ...WINDOWS_ENV_KEYS] : BASE_ENV_KEYS;
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith('LC_') || key.startsWith('REVIEW_')) env[key] = value;
  }
  env.REVIEW_ID = job.reviewId;
  env.REVIEW_ROUND = String(job.round);
  env.REVIEW_JOB_ID = job.id;
  env.REVIEW_REPO = job.repoRoot;
  return Object.assign(env, overrides);
}

function killProcess(child: ReturnType<typeof spawn>): void {
  if (child.pid !== undefined && process.platform !== 'win32') {
    try {
      // The child is spawned detached, so a negative pid reaches its whole group.
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // Fall through to the direct child if the group is already gone.
    }
  }
  killProcess(child);
}

function replacePlaceholders(value: string, values: Record<string, string>): string {
  return value.replace(/\{(promptFile|repo|outputFile|reviewId)\}/g, (_match, key: string) => {
    return values[key] ?? '';
  });
}

function lastFencedJson(stdout: string): unknown {
  const matches = [...stdout.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g)];
  const last = matches.at(-1)?.[1];
  if (last === undefined) return undefined;
  try {
    return JSON.parse(last);
  } catch {
    throw new ReviewerError('invalid-output', 'last fenced block is not valid JSON');
  }
}

async function readOutputFile(outputFile: string, maxBytes: number): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(outputFile, 'r');
  } catch {
    return undefined;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new ReviewerError('invalid-output', 'reviewer output file is not a regular file');
    }
    if (info.size > maxBytes) {
      throw new ReviewerError('invalid-output', `reviewer output file exceeded ${maxBytes} bytes`);
    }
    const raw = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(raw) > maxBytes) {
      throw new ReviewerError('invalid-output', `reviewer output file exceeded ${maxBytes} bytes`);
    }
    return raw;
  } finally {
    await handle.close();
  }
}

async function parseOutput(outputFile: string, stdout: string, maxBytes: number): Promise<unknown> {
  const raw = await readOutputFile(outputFile, maxBytes);
  if (raw !== undefined && raw.trim() !== '') {
    try {
      return JSON.parse(raw);
    } catch {
      throw new ReviewerError('invalid-output', 'reviewer output file is not valid JSON');
    }
  }
  const fenced = lastFencedJson(stdout);
  if (fenced !== undefined) return fenced;
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new ReviewerError('invalid-output', 'reviewer stdout is not valid JSON');
    }
  }
  throw new ReviewerError('invalid-output', 'reviewer produced no JSON output');
}

async function status(
  runner: GitStatusRunner,
  repoRoot: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    const result = await runner(repoRoot, ['status', '--porcelain'], { signal });
    return result.code === 0 ? result.stdout : '';
  } catch {
    return '';
  }
}

/** Opt-in backend that runs an external reviewer command in the repo root. */
export class CommandReviewer implements ReviewerBackend {
  readonly kind = 'command' as const;
  private readonly options: CommandReviewerOptions;
  private child: ReturnType<typeof spawn> | undefined;

  constructor(options: CommandReviewerOptions) {
    this.options = options;
  }

  async run(job: ReviewerJob, sink: FindingSink, signal: AbortSignal): Promise<ReviewerReport> {
    if (signal.aborted) throw new ReviewerError('cancelled', 'reviewer was cancelled');
    const temp = await mkdtemp(join(tmpdir(), 'cr-reviewer-'));
    const promptFile = join(temp, 'prompt.md');
    const outputFile = join(temp, 'output.json');
    await writeFile(promptFile, job.prompt, 'utf8');

    const runner = this.options.runGit ?? runGit;
    const before = await status(runner, job.repoRoot, signal);
    const values = {
      promptFile,
      repo: job.repoRoot,
      outputFile,
      reviewId: job.reviewId,
    };
    const argv = this.options.command.map((part) => replacePlaceholders(part, values));
    if (argv.length === 0 || argv[0] === '') {
      await rm(temp, { recursive: true, force: true });
      throw new ReviewerError('spawn-failed', 'reviewer command is empty');
    }

    try {
      const stdout = await this.execute(argv, job, signal);
      const after = await status(runner, job.repoRoot, signal);
      const parsed = await parseOutput(
        outputFile,
        stdout,
        this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      );
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ReviewerError('invalid-output', 'reviewer JSON must be an object');
      }
      const report = parsed as ReviewerReport;
      for (const finding of Array.isArray(report.findings) ? report.findings : []) {
        await sink(finding);
      }
      if (before !== after) return { ...report, dirtyWorktree: true };
      return report;
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  cancel(): void {
    if (this.child !== undefined) killProcess(this.child);
  }

  private async execute(
    argv: readonly string[],
    job: ReviewerJob,
    signal: AbortSignal,
  ): Promise<string> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutput = this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(argv[0] as string, argv.slice(1), {
        cwd: job.repoRoot,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: reviewerEnv(job, this.options.env),
      });
      this.child = child;
      const chunks: Buffer[] = [];
      const stderr: Buffer[] = [];
      let bytes = 0;
      let settled = false;
      let timedOut = false;

      const finish = (error?: Error, value?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        this.child = undefined;
        if (error !== undefined) reject(error);
        else resolve(value ?? '');
      };
      const onAbort = (): void => {
        killProcess(child);
        finish(new ReviewerError('cancelled', 'reviewer was cancelled'));
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killProcess(child);
        finish(new ReviewerError('timeout', `reviewer timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      signal.addEventListener('abort', onAbort, { once: true });

      child.on('error', (error: NodeJS.ErrnoException) => {
        finish(
          new ReviewerError(
            'spawn-failed',
            error.code === 'ENOENT' ? `reviewer command not found: ${argv[0]}` : error.message,
          ),
        );
      });
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxOutput) {
          killProcess(child);
          finish(
            new ReviewerError('invalid-output', `reviewer stdout exceeded ${maxOutput} bytes`),
          );
          return;
        }
        chunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.reduce((sum, item) => sum + item.length, 0) < 1024 * 1024) stderr.push(chunk);
      });
      child.on('close', (code) => {
        if (settled) return;
        if (timedOut) {
          finish(new ReviewerError('timeout', `reviewer timed out after ${timeoutMs}ms`));
          return;
        }
        if (code !== 0) {
          finish(
            new ReviewerError(
              'nonzero-exit',
              `reviewer exited with ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`,
            ),
          );
          return;
        }
        finish(undefined, Buffer.concat(chunks).toString('utf8'));
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(job.prompt);
    });
  }
}
