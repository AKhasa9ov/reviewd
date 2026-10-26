import { createHash, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readlink } from 'node:fs/promises';
import type { DiffScope, ResolvedScope } from '../types.js';
import { hasSymlinkParent, safeJoin } from '../paths.js';
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

function compareBytePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function abortedError(): GitError {
  return new GitError('git-failed', 'git command aborted');
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

async function hashUntrackedFile(
  hash: Hash,
  repoRoot: string,
  path: string,
  signal?: AbortSignal,
): Promise<void> {
  if (isAborted(signal)) throw abortedError();
  const absolute = safeJoin(repoRoot, path);
  if (await hasSymlinkParent(repoRoot, path)) {
    hash.update('unreadable');
    return;
  }

  let info;
  try {
    info = await lstat(absolute);
  } catch {
    hash.update('unreadable');
    return;
  }
  if (isAborted(signal)) throw abortedError();

  try {
    if (info.isSymbolicLink()) {
      const target = await readlink(absolute, { encoding: 'buffer' });
      if (isAborted(signal)) throw abortedError();
      hash.update(target);
      hash.update('\n');
      return;
    }
    if (!info.isFile()) {
      hash.update('unreadable');
      return;
    }
    for await (const chunk of createReadStream(absolute, { signal })) {
      hash.update(chunk);
    }
  } catch {
    if (isAborted(signal)) throw abortedError();
    hash.update('unreadable');
  }
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
  const untracked = await runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], {
    signal,
    maxBytes: 8 * 1024 * 1024,
  });
  const hash = createHash('sha256').update(status.stdout).update('\0').update(diff.stdout);
  const paths = untracked.stdout
    .split('\0')
    .filter((path) => path.length > 0)
    .sort(compareBytePaths);
  for (const path of paths) {
    hash.update('\0');
    hash.update(path);
    hash.update('\0');
    await hashUntrackedFile(hash, repoRoot, path, signal);
  }
  return {
    hash: hash.digest('hex'),
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
