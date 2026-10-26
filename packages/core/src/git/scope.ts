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
    const digest = await worktreeDigestState(root, baseSha, signal);
    const resolved: ResolvedScope = {
      kind: 'worktree',
      repoRoot: root,
      baseRef: input.scope.baseRef,
      baseSha,
      headSha: null,
      label: `${input.scope.baseRef} (worktree)`,
      worktreeDigest: digest.hash,
    };
    if (digest.truncated) resolved.worktreeDigestTruncated = true;
    return resolved;
  }

  const head = await runGit(root, ['rev-parse', '--verify', `${input.scope.sha}^{commit}`], {
    signal,
  });
  const headSha = head.stdout.trim();
  const parentSha = await firstParentSha(root, headSha, signal);
  let baseSha = EMPTY_TREE_SHA;
  if (parentSha !== null) {
    const available = await runGit(root, ['cat-file', '-e', `${parentSha}^{commit}`], {
      allowFailure: true,
      signal,
    });
    if (available.code !== 0) {
      throw new GitError(
        'git-failed',
        `commit ${headSha} has a parent that is not available; fetch/unshallow the repository`,
      );
    }
    baseSha = parentSha;
  }

  return {
    kind: 'commit',
    repoRoot: root,
    baseSha,
    headSha,
    label: headSha.slice(0, 12),
    worktreeDigest: headSha,
  };
}

async function firstParentSha(
  repoRoot: string,
  headSha: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const listed = await runGit(repoRoot, ['rev-list', '--parents', '-n', '1', headSha], { signal });
  const fields = listed.stdout
    .trim()
    .split(/\s+/)
    .filter((field) => field !== '');
  if (fields.length > 1) return fields[1] ?? null;

  // `rev-list` hides the parent of a shallow boundary. The commit object still
  // records it, so use that to tell a real root commit from an unshallowed edge.
  const object = await runGit(repoRoot, ['cat-file', '-p', headSha], { signal });
  const match = /^parent ([0-9a-f]{40})$/m.exec(object.stdout);
  return match?.[1] ?? null;
}

interface WorktreeDigestState {
  hash: string;
  truncated: boolean;
}

async function worktreeDigestState(
  repoRoot: string,
  baseSha: string,
  signal?: AbortSignal,
): Promise<WorktreeDigestState> {
  const status = await runGit(
    repoRoot,
    ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
    { signal, maxBytes: 8 * 1024 * 1024, truncateOnOverflow: true },
  );
  const diff = await runGit(
    repoRoot,
    [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--binary',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      baseSha,
      '--',
    ],
    { signal, maxBytes: 8 * 1024 * 1024, truncateOnOverflow: true },
  );
  return {
    hash: createHash('sha256').update(status.stdout).update('\0').update(diff.stdout).digest('hex'),
    truncated: status.truncated === true || diff.truncated === true,
  };
}

export async function worktreeDigest(
  repoRoot: string,
  baseSha: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await worktreeDigestState(repoRoot, baseSha, signal)).hash;
}
