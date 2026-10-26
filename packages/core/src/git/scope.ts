import { createHash } from 'node:crypto';
import type { DiffScope, ResolvedScope } from '../types.js';
import { resolveRepoRoot } from './repo.js';
import { GitError, runGit } from './run.js';

export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export async function resolveDefaultBase(repoRoot: string): Promise<string> {
  const origin = await runGit(repoRoot, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    allowFailure: true,
  });
  if (origin.code === 0 && origin.stdout.trim() !== '') return origin.stdout.trim();

  for (const candidate of ['main', 'master']) {
    const result = await runGit(
      repoRoot,
      ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`],
      { allowFailure: true },
    );
    if (result.code === 0) return candidate;
  }

  const head = await runGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true });
  if (head.code === 0 && head.stdout.trim() !== '') return head.stdout.trim();
  throw new GitError('git-failed', 'cannot determine the default base branch');
}

export interface ResolveScopeInput {
  repoRoot: string;
  scope: DiffScope;
  signal?: AbortSignal;
}

export async function resolveScope(input: ResolveScopeInput): Promise<ResolvedScope> {
  const root = await resolveRepoRoot(input.repoRoot);
  const signal = input.signal;

  if (input.scope.kind === 'range') {
    const head = await runGit(root, ['rev-parse', '--verify', `${input.scope.headRef}^{commit}`], {
      signal,
    });
    const headSha = head.stdout.trim();
    const base =
      input.scope.twoDot === true
        ? await runGit(root, ['rev-parse', '--verify', `${input.scope.baseRef}^{commit}`], {
            signal,
          })
        : await runGit(root, ['merge-base', input.scope.baseRef, input.scope.headRef], { signal });
    return {
      kind: 'range',
      repoRoot: root,
      baseRef: input.scope.baseRef,
      headRef: input.scope.headRef,
      baseSha: base.stdout.trim(),
      headSha,
      label: `${input.scope.baseRef}${input.scope.twoDot === true ? '..' : '...'}${input.scope.headRef}`,
      worktreeDigest: headSha,
    };
  }

  if (input.scope.kind === 'worktree') {
    const base = await runGit(root, ['rev-parse', '--verify', `${input.scope.baseRef}^{commit}`], {
      signal,
    });
    const baseSha = base.stdout.trim();
    return {
      kind: 'worktree',
      repoRoot: root,
      baseRef: input.scope.baseRef,
      baseSha,
      headSha: null,
      label: `${input.scope.baseRef} (worktree)`,
      worktreeDigest: await worktreeDigest(root, baseSha, signal),
    };
  }

  const head = await runGit(root, ['rev-parse', '--verify', `${input.scope.sha}^{commit}`], {
    signal,
  });
  const headSha = head.stdout.trim();
  const parent = await runGit(root, ['rev-parse', '--verify', `${headSha}^`], {
    allowFailure: true,
    signal,
  });
  const baseSha = parent.code === 0 ? parent.stdout.trim() : EMPTY_TREE_SHA;

  return {
    kind: 'commit',
    repoRoot: root,
    baseSha,
    headSha,
    label: headSha.slice(0, 12),
    worktreeDigest: headSha,
  };
}

export async function worktreeDigest(
  repoRoot: string,
  baseSha: string,
  signal?: AbortSignal,
): Promise<string> {
  const status = await runGit(
    repoRoot,
    ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
    { signal, maxBytes: 8 * 1024 * 1024 },
  );
  const diff = await runGit(
    repoRoot,
    ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--binary', baseSha, '--'],
    { signal, maxBytes: 8 * 1024 * 1024 },
  );
  return createHash('sha256').update(status.stdout).update('\0').update(diff.stdout).digest('hex');
}
