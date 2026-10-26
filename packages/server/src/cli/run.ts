import {
  CORE_VERSION,
  GitError,
  buildSnapshot,
  resolveDefaultBase,
  resolveRepoRoot,
} from '@dsh-code-review/core';
import type { DiffScope, FileStatus, Snapshot } from '@dsh-code-review/core';

export interface CliIO {
  stdout: { write: (text: string) => unknown };
  stderr: { write: (text: string) => unknown };
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

interface DiffOptions {
  repo: string;
  base?: string;
  head?: string;
  worktree: boolean;
  commit?: string;
  twoDot: boolean;
  json: boolean;
  includeUntracked: boolean;
  includeContent: boolean;
  maxFiles?: number;
  maxFileLines?: number;
  ignore: string[];
}

function value(args: string[], flag: string): string {
  const found = args.shift();
  if (found === undefined || found.startsWith('--')) {
    throw new UsageError(`${flag} requires a value`);
  }
  return found;
}

function integer(raw: string, flag: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseDiff(args: string[]): DiffOptions {
  const options: DiffOptions = {
    repo: process.cwd(),
    worktree: false,
    twoDot: false,
    json: false,
    includeUntracked: true,
    includeContent: true,
    ignore: [],
  };

  while (args.length > 0) {
    const flag = args.shift();
    if (flag === undefined) break;
    switch (flag) {
      case '--repo':
        options.repo = value(args, flag);
        break;
      case '--base':
        options.base = value(args, flag);
        break;
      case '--head':
        options.head = value(args, flag);
        break;
      case '--worktree':
        options.worktree = true;
        break;
      case '--commit':
        options.commit = value(args, flag);
        break;
      case '--two-dot':
        options.twoDot = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-untracked':
        options.includeUntracked = false;
        break;
      case '--no-content':
        options.includeContent = false;
        break;
      case '--max-files':
        options.maxFiles = integer(value(args, flag), flag);
        break;
      case '--max-lines':
        options.maxFileLines = integer(value(args, flag), flag);
        break;
      case '--ignore':
        options.ignore.push(value(args, flag));
        break;
      default:
        throw new UsageError(`unknown flag: ${flag}`);
    }
  }

  const selectors = [options.worktree, options.commit !== undefined].filter(Boolean).length;
  if (selectors > 1) throw new UsageError('choose only one of --worktree or --commit');
  return options;
}

function scope(options: DiffOptions, baseRef: string): DiffScope {
  if (options.commit !== undefined) return { kind: 'commit', sha: options.commit };
  if (options.worktree) return { kind: 'worktree', baseRef };
  return {
    kind: 'range',
    baseRef,
    headRef: options.head ?? 'HEAD',
    ...(options.twoDot ? { twoDot: true } : {}),
  };
}

function statusLetter(status: FileStatus): string {
  const letters: Record<FileStatus, string> = {
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    binary: 'B',
    oversized: 'L',
    submodule: 'S',
    untracked: '?',
    modified: 'M',
  };
  return letters[status];
}

function format(snapshot: Snapshot): string {
  const lines = [
    `${snapshot.scope.label}  ${snapshot.totals.files} files  +${snapshot.totals.added} -${snapshot.totals.deleted}`,
  ];
  for (const file of snapshot.files) {
    lines.push(`${statusLetter(file.status)} ${file.path} +${file.added} -${file.deleted}`);
  }
  for (const warning of snapshot.warnings) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}

function help(): string {
  return [
    'review diff — inspect changes without a daemon',
    '',
    'usage: review diff --repo <path> [--base <ref>] [--head <ref>] [--worktree] [--commit <sha>]',
    '',
    'options:',
    '  --repo <path>       repository root (default: current directory)',
    '  --base <ref>        base ref (default: origin/HEAD, main, master, current branch)',
    '  --head <ref>        head ref for a range (default: HEAD)',
    '  --worktree          diff the base against the working tree',
    '  --commit <sha>      diff a commit against its parent',
    '  --two-dot           use base..head instead of merge-base',
    '  --json              emit the full snapshot JSON',
    '  --no-untracked      exclude untracked files',
    '  --no-content        omit full file content',
    '  --max-files <n>     cap the number of files',
    '  --max-lines <n>     cap lines per file',
    '  --ignore <glob>     exclude a path pattern (repeatable)',
    '',
  ].join('\n');
}

export async function runCli(argv: readonly string[], io: CliIO): Promise<number> {
  const args = [...argv];
  const command = args.shift() ?? 'help';

  try {
    if (command === 'help' || command === '--help' || command === '-h') {
      io.stdout.write(help());
      return 0;
    }
    if (command === 'version' || command === '--version' || command === '-v') {
      io.stdout.write(`review ${CORE_VERSION}\n`);
      return 0;
    }
    if (command !== 'diff') {
      throw new UsageError(`unknown command: ${command}`);
    }

    const options = parseDiff(args);
    const repoRoot = await resolveRepoRoot(options.repo);
    const baseRef =
      options.commit === undefined
        ? (options.base ?? (await resolveDefaultBase(repoRoot)))
        : 'HEAD';
    const snapshot = await buildSnapshot({
      repoRoot,
      scope: scope(options, baseRef),
      includeUntracked: options.includeUntracked,
      includeContent: options.includeContent,
      ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
      ...(options.maxFileLines === undefined ? {} : { maxFileLines: options.maxFileLines }),
      ignore: options.ignore,
    });

    if (options.json) {
      io.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    } else {
      io.stdout.write(format(snapshot));
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError || error instanceof GitError) {
      io.stderr.write(`error: ${error.message}\n`);
      return 5;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`error: ${message}\n`);
    return 5;
  }
}
