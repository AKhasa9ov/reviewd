import { realpath, stat } from 'node:fs/promises';
import { GitError, runGit } from './run.js';

export async function resolveRepoRoot(input: string): Promise<string> {
  const absolute = await realpath(input).catch(() => {
    throw new GitError('not-a-repo', `path does not exist: ${input}`);
  });
  const info = await stat(absolute).catch(() => {
    throw new GitError('not-a-repo', `path does not exist: ${input}`);
  });
  if (!info.isDirectory()) {
    throw new GitError('not-a-repo', `not a directory: ${input}`);
  }

  const result = await runGit(absolute, ['rev-parse', '--show-toplevel'], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new GitError('not-a-repo', `not a git repository: ${input}`, result.stderr);
  }
  return await realpath(result.stdout.trim());
}
