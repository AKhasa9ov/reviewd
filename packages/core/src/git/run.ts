import { spawn } from 'node:child_process';

export type GitErrorCode = 'git-missing' | 'not-a-repo' | 'git-failed';

export class GitError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitRunOptions {
  allowFailure?: boolean;
  maxBytes?: number;
  maxStderrBytes?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 1024 * 1024;

export async function runGit(
  cwd: string,
  args: readonly string[],
  options: GitRunOptions = {},
): Promise<GitResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
  if (options.signal?.aborted === true) {
    throw new GitError('git-failed', 'git command aborted');
  }

  return await new Promise<GitResult>((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotePath=false', ...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: options.signal,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
        ...options.env,
      },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: GitError): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        fail(new GitError('git-missing', 'git executable not found'));
      } else {
        fail(new GitError('git-failed', error.message));
      }
    });

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill('SIGKILL');
        fail(new GitError('git-failed', `git output exceeded ${maxBytes} bytes`));
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) {
        child.kill('SIGKILL');
        fail(new GitError('git-failed', `git stderr exceeded ${maxStderrBytes} bytes`));
        return;
      }
      stderr.push(chunk);
    });

    child.on('close', (code) => {
      if (settled) return;
      const result: GitResult = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code: code ?? 1,
      };
      if (result.code !== 0 && options.allowFailure !== true) {
        settled = true;
        reject(
          new GitError(
            'git-failed',
            `git ${args.join(' ')} failed (${result.code}): ${result.stderr.trim()}`,
            result.stderr,
          ),
        );
        return;
      }
      settled = true;
      resolve(result);
    });
  });
}
