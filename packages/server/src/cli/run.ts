import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startDaemon } from '../daemon/server.js';
import { RemoteClient, RemoteError } from './client.js';
import {
  CORE_VERSION,
  DiffParseError,
  GitError,
  buildSnapshot,
  resolveDefaultBase,
  resolveRepoRoot,
} from '@dsh-code-review/core';
import type { DiffScope, FileDiff, FileStatus, Snapshot } from '@dsh-code-review/core';

export interface CliIO {
  stdout: { write: (text: string) => unknown };
  stderr: { write: (text: string) => unknown };
}

export interface CliDeps {
  resolveRepoRoot: typeof resolveRepoRoot;
  resolveDefaultBase: typeof resolveDefaultBase;
  buildSnapshot: typeof buildSnapshot;
  debug?: boolean;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  signal?: AbortSignal;
  startDaemon?: typeof startDaemon;
}

const defaultDeps: CliDeps = { resolveRepoRoot, resolveDefaultBase, buildSnapshot };

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

  if (options.commit !== undefined) {
    const conflicts: string[] = [];
    if (options.base !== undefined) conflicts.push('--base');
    if (options.head !== undefined) conflicts.push('--head');
    if (options.twoDot) conflicts.push('--two-dot');
    if (conflicts.length > 0) {
      throw new UsageError(`--commit cannot be combined with ${conflicts.join(', ')}`);
    }
  }

  if (options.worktree) {
    const conflicts: string[] = [];
    if (options.head !== undefined) conflicts.push('--head');
    if (options.twoDot) conflicts.push('--two-dot');
    if (conflicts.length > 0) {
      throw new UsageError(`--worktree cannot be combined with ${conflicts.join(', ')}`);
    }
  }

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

function statusLetter(file: FileDiff): string {
  const letters: Record<FileStatus, string> = {
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    submodule: 'S',
    untracked: '?',
    modified: 'M',
  };
  const prefix = file.ignored === true ? 'I' : file.binary ? 'B' : file.oversized ? 'L' : '';
  return `${prefix}${letters[file.status]}`;
}

function format(snapshot: Snapshot): string {
  const lines = [
    `${snapshot.scope.label}  ${snapshot.totals.files} files  +${snapshot.totals.added} -${snapshot.totals.deleted}`,
  ];
  for (const file of snapshot.files) {
    lines.push(`${statusLetter(file)} ${file.path} +${file.added} -${file.deleted}`);
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
    '  --ignore <glob>     mark a path pattern ignored (repeatable)',
    '',
    'flags take a separate value (--base main); --flag=value and -- are not supported.',
    'exit codes: 0 success, 1 internal failure, 5 usage or git validation',
    '',
    'daemon commands:',
    '  review start --repo <path> [--base <ref>] [--head <ref>|--worktree|--commit <sha>]',
    '               [--session-id <id> [--harness <name>] [--cwd <path>]]',
    '  review status <id> | review feedback <id> [--wait] [--format md|json]',
    '  review comments list|add ... | review submit ... | review refresh <id>',
    '  review fix-status <id> --json @file.json | review health | review gc',
    '  review serve --host <h> --port <p> --store <dir> [--public-url <url>]',
    '',
    'daemon exit codes: 0 ok, 2 timeout, 3 auth, 4 daemon unavailable, 5 validation, 6 conflict/stale',
    '',
  ].join('\n');
}

export async function runCli(
  argv: readonly string[],
  io: CliIO,
  deps: CliDeps = defaultDeps,
): Promise<number> {
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
    if (command === 'serve') {
      return await runServe(args, io, deps);
    }
    if (command !== 'diff') {
      return await runRemote(command, args, io, deps);
    }

    const options = parseDiff(args);
    const repoRoot = await deps.resolveRepoRoot(options.repo);
    const baseRef =
      options.commit === undefined
        ? (options.base ?? (await deps.resolveDefaultBase(repoRoot)))
        : 'HEAD';
    const snapshot = await deps.buildSnapshot({
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
    if (error instanceof RemoteError) {
      io.stderr.write(`error: ${error.message}\n`);
      return error.exitCode;
    }
    if (error instanceof DiffParseError) {
      io.stderr.write(`error: unsupported diff: ${error.message}\n`);
      return 5;
    }
    if (error instanceof UsageError || error instanceof GitError) {
      io.stderr.write(`error: ${error.message}\n`);
      return 5;
    }
    io.stderr.write('error: internal failure\n');
    if (deps.debug ?? Boolean(process.env.DEBUG)) {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      io.stderr.write(`${detail}\n`);
    }
    return 1;
  }
}

function cleanUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError(`invalid daemon URL: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UsageError('daemon URL must use http or https');
  }
  return parsed.toString().replace(/\/$/, '');
}

async function configFile(env: NodeJS.ProcessEnv): Promise<{ daemon?: string; token?: string }> {
  const path = join(env.HOME ?? homedir(), '.config', 'code-review', 'config.json');
  try {
    const info = await stat(path);
    if ((info.mode & 0o077) !== 0) return {};
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return {
      ...(typeof parsed.daemon === 'string' ? { daemon: parsed.daemon } : {}),
      ...(typeof parsed.token === 'string' ? { token: parsed.token } : {}),
    };
  } catch {
    return {};
  }
}

async function remoteClient(args: string[], deps: CliDeps): Promise<RemoteClient> {
  const env = deps.env ?? process.env;
  const stored = await configFile(env);
  let daemon = env.CODE_REVIEW_URL ?? stored.daemon;
  let token = env.CODE_REVIEW_TOKEN ?? stored.token;
  for (let index = 0; index < args.length;) {
    if (args[index] === '--daemon') {
      const next = args[index + 1];
      if (next === undefined) throw new UsageError('--daemon requires a value');
      daemon = next;
      args.splice(index, 2);
      continue;
    }
    if (args[index] === '--token') {
      const next = args[index + 1];
      if (next === undefined) throw new UsageError('--token requires a value');
      token = next;
      args.splice(index, 2);
      continue;
    }
    index += 1;
  }
  if (daemon === undefined || daemon === '') {
    throw new UsageError('no daemon configured; pass --daemon or set CODE_REVIEW_URL');
  }
  if (token === undefined || token === '') {
    throw new UsageError('no token configured; set CODE_REVIEW_TOKEN');
  }
  return new RemoteClient({ baseUrl: cleanUrl(daemon), token }, deps.fetch ?? fetch);
}

function parseReviewer(value: string): Record<string, unknown> {
  if (value === 'worker' || value === 'none') return { backend: value };
  if (value === 'command')
    return { backend: 'command', command: [process.env.CODE_REVIEW_REVIEWER ?? 'true'] };
  if (value === 'auto' || value === '') return { backend: 'worker' };
  throw new UsageError('--reviewer must be auto, worker, command or none');
}

function parseScope(options: {
  base?: string;
  head?: string;
  worktree: boolean;
  commit?: string;
}): Record<string, unknown> {
  if (options.commit !== undefined) return { kind: 'commit', sha: options.commit };
  if (options.worktree) return { kind: 'worktree', baseRef: options.base ?? 'main' };
  return {
    kind: 'range',
    baseRef: options.base ?? 'main',
    headRef: options.head ?? 'HEAD',
  };
}

async function pollFeedback(
  client: RemoteClient,
  id: string,
  wait: boolean,
  io: CliIO,
  timeoutMs = 30_000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await client.get(`/api/reviews/${encodeURIComponent(id)}/feedback`);
    } catch (error) {
      if (!(error instanceof RemoteError) || error.status !== 404 || !wait) {
        if (error instanceof RemoteError && error.status === 404 && !wait) return null;
        throw error;
      }
    }
    if (Date.now() >= deadline) {
      io.stderr.write('error: timed out waiting for feedback\n');
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function runRemote(
  command: string,
  rawArgs: string[],
  io: CliIO,
  deps: CliDeps,
): Promise<number> {
  const args = [...rawArgs];
  const client = await remoteClient(args, deps);
  const json = args.includes('--json');
  if (command !== 'fix-status') {
    const jsonIndex = args.indexOf('--json');
    if (jsonIndex >= 0) args.splice(jsonIndex, 1);
  }
  const remove = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    if (index < 0) return undefined;
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
  };

  if (command === 'start') {
    const repo = remove('--repo') ?? deps.cwd ?? process.cwd();
    let base = remove('--base');
    const head = remove('--head');
    const commit = remove('--commit');
    const explicitWorktree = args.includes('--worktree');
    if (explicitWorktree) args.splice(args.indexOf('--worktree'), 1);
    const title = remove('--title') ?? 'Code review';
    const reviewer = remove('--reviewer') ?? 'none';
    const sessionId = remove('--session-id');
    const harness = remove('--harness') ?? 'dsh';
    const initiatorCwd = remove('--cwd');
    const waitAgent = args.includes('--wait-agent');
    if (waitAgent) args.splice(args.indexOf('--wait-agent'), 1);
    if (args.length > 0) throw new UsageError(`unknown flag: ${args[0]}`);
    if (sessionId === undefined && (harness !== 'dsh' || initiatorCwd !== undefined)) {
      throw new UsageError('--session-id is required with --harness or --cwd');
    }
    if (sessionId !== undefined && sessionId.trim() === '') {
      throw new UsageError('--session-id must be non-empty');
    }
    const initiator =
      sessionId === undefined
        ? undefined
        : {
            harness,
            sessionId,
            cwd: initiatorCwd ?? repo,
          };
    if (explicitWorktree && commit !== undefined)
      throw new UsageError('choose only one of --worktree or --commit');
    if (commit !== undefined && head !== undefined)
      throw new UsageError('choose only one of --head or --commit');
    if (explicitWorktree && head !== undefined)
      throw new UsageError('choose only one of --head or --worktree');
    if (base === undefined) {
      try {
        base = await deps.resolveDefaultBase(repo);
      } catch {
        base = 'main';
      }
    }
    // Without an explicit head the CLI reviews the current worktree, matching
    // the documented start semantics.
    const worktree = explicitWorktree || (head === undefined && commit === undefined);
    const scope = parseScope({
      ...(base === undefined ? {} : { base }),
      ...(head === undefined ? {} : { head }),
      ...(commit === undefined ? {} : { commit }),
      worktree,
    });
    const created = await client.post('/api/reviews', {
      repoRoot: repo,
      title,
      scope,
      reviewer: parseReviewer(reviewer),
      ...(initiator === undefined ? {} : { initiator }),
    });
    if (waitAgent) {
      const review = created.review as
        { review?: { id?: string; reviewer?: { backend?: string } } } | undefined;
      const id = review?.review?.id;
      if (id !== undefined && review?.review?.reviewer?.backend === 'worker') {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          const current = await client.get(`/api/reviews/${id}`);
          const status = (current.review as { agent?: { status?: string } } | undefined)?.agent
            ?.status;
          if (
            status === 'done' ||
            status === 'partial' ||
            status === 'failed' ||
            status === 'skipped'
          ) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    io.stdout.write(
      json
        ? `${JSON.stringify(created, null, 2)}\n`
        : `${(created.review as { review?: { id?: string } }).review?.id ?? 'review'} ${String(created.url ?? '')}\n`,
    );
    return 0;
  }

  if (command === 'status') {
    const id = args.shift();
    if (id === undefined) throw new UsageError('status requires a review id');
    if (args.length > 0 && args[0] !== '--json') throw new UsageError(`unknown flag: ${args[0]}`);
    const view = await client.get(`/api/reviews/${encodeURIComponent(id)}`);
    if (json) io.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    else {
      const review = view.review as {
        id?: string;
        title?: string;
        status?: string;
        rounds?: unknown[];
        comments?: unknown[];
      };
      io.stdout.write(
        `${review.id} ${review.status} ${review.title} (${review.rounds?.length ?? 0} rounds, ${review.comments?.length ?? 0} comments)\n`,
      );
    }
    return 0;
  }

  if (command === 'feedback') {
    const id = args.shift();
    if (id === undefined) throw new UsageError('feedback requires a review id');
    const wait = args.includes('--wait');
    if (wait) args.splice(args.indexOf('--wait'), 1);
    const format = remove('--format') ?? 'md';
    if (format !== 'md' && format !== 'json') throw new UsageError('--format must be md or json');
    if (args.length > 0) throw new UsageError(`unknown flag: ${args[0]}`);
    const result = await pollFeedback(client, id, wait, io);
    if (result === null) return 2;
    if (format === 'json') io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      const feedback = result.feedback as { markdown?: string } | undefined;
      io.stdout.write(`${feedback?.markdown ?? ''}\n`);
    }
    return 0;
  }

  if (command === 'comments') {
    const action = args.shift();
    const id = args.shift();
    if (id === undefined) throw new UsageError('comments requires list|add and a review id');
    if (action === 'list') {
      const view = await client.get(`/api/reviews/${encodeURIComponent(id)}`);
      const comments = (view.review as { comments?: unknown[] }).comments ?? [];
      if (json) io.stdout.write(`${JSON.stringify({ comments }, null, 2)}\n`);
      else
        for (const raw of comments) {
          const comment = raw as {
            id?: string;
            state?: string;
            body?: string;
            anchors?: Array<{ path?: string; lineStart?: number }>;
          };
          const anchor = comment.anchors?.at(-1);
          io.stdout.write(
            `${comment.id} ${comment.state} ${anchor?.path ?? '?'}:${anchor?.lineStart ?? '?'} ${comment.body ?? ''}\n`,
          );
        }
      return 0;
    }
    if (action === 'add') {
      const file = remove('--file');
      const line = remove('--line');
      const endLine = remove('--end-line');
      const side = remove('--side') ?? 'new';
      const body = remove('--body');
      if (file === undefined || line === undefined || body === undefined) {
        throw new UsageError('comments add requires --file, --line and --body');
      }
      if (side !== 'new' && side !== 'old') throw new UsageError('--side must be new or old');
      const created = await client.post(`/api/reviews/${encodeURIComponent(id)}/comments`, {
        path: file,
        lineStart: Number(line),
        ...(endLine === undefined ? {} : { lineEnd: Number(endLine) }),
        side,
        body,
      });
      io.stdout.write(
        json
          ? `${JSON.stringify(created, null, 2)}\n`
          : `${(created.comment as { id?: string }).id ?? 'comment'}\n`,
      );
      return 0;
    }
    throw new UsageError('comments requires list|add');
  }

  if (command === 'submit') {
    const id = args.shift();
    if (id === undefined) throw new UsageError('submit requires a review id');
    const verdictFlags = ['--approve', '--request-changes', '--comment'].filter((flag) =>
      args.includes(flag),
    );
    if (verdictFlags.length !== 1) {
      throw new UsageError(
        'submit requires exactly one of --approve, --request-changes or --comment',
      );
    }
    const verdict =
      verdictFlags[0] === '--approve'
        ? 'approve'
        : verdictFlags[0] === '--request-changes'
          ? 'request-changes'
          : 'comment';
    for (const flag of ['--approve', '--request-changes', '--comment']) {
      if (args.includes(flag)) args.splice(args.indexOf(flag), 1);
    }
    const summary = remove('--summary');
    const result = await client.post(`/api/reviews/${encodeURIComponent(id)}/submit`, {
      verdict,
      ...(summary === undefined ? {} : { summary }),
    });
    io.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `submitted ${id}\n`);
    return 0;
  }

  if (command === 'refresh') {
    const id = args.shift();
    if (id === undefined) throw new UsageError('refresh requires a review id');
    const result = await client.post(`/api/reviews/${encodeURIComponent(id)}/refresh`, {});
    io.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `refreshed ${id}\n`);
    return 0;
  }

  if (command === 'fix-status') {
    const id = args.shift();
    if (id === undefined) throw new UsageError('fix-status requires a review id');
    const source = remove('--json');
    if (source === undefined) throw new UsageError('fix-status requires --json @file');
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        await readFile(source.startsWith('@') ? source.slice(1) : source, 'utf8'),
      );
    } catch {
      throw new UsageError('fix-status JSON could not be read');
    }
    const result = await client.post(`/api/reviews/${encodeURIComponent(id)}/fix-status`, parsed);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (command === 'health') {
    const result = await client.get('/api/health');
    io.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : 'ok\n');
    return 0;
  }

  if (command === 'gc') {
    const raw = remove('--older-than') ?? '90d';
    const match = /^(\d+)d$/.exec(raw);
    if (match === null) throw new UsageError('--older-than must look like 90d');
    const result = await client.post('/api/gc', { olderThanDays: Number(match[1]) });
    io.stdout.write(
      json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `removed ${(result.removedReviews as unknown[] | undefined)?.length ?? 0} reviews\n`,
    );
    return 0;
  }

  throw new UsageError(`unknown command: ${command}`);
}

function serveHelp(): string {
  return [
    'review serve — run the review daemon',
    '',
    'usage: review serve --store <dir> [--host <h>] [--port <p>] [--public-url <url>]',
    '',
    'env: CODE_REVIEW_TOKEN (required, 32+ bytes), CODE_REVIEW_STORE, CODE_REVIEW_HOST, CODE_REVIEW_PORT',
    '',
  ].join('\n');
}

async function runServe(args: string[], io: CliIO, deps: CliDeps): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    io.stdout.write(serveHelp());
    return 0;
  }
  const options = [...args];
  const take = (flag: string): string | undefined => {
    const index = options.indexOf(flag);
    if (index < 0) return undefined;
    const value = options[index + 1];
    options.splice(index, 2);
    return value;
  };
  const store = take('--store') ?? (deps.env ?? process.env).CODE_REVIEW_STORE;
  const host = take('--host') ?? (deps.env ?? process.env).CODE_REVIEW_HOST;
  const portRaw = take('--port') ?? (deps.env ?? process.env).CODE_REVIEW_PORT;
  const publicUrl = take('--public-url') ?? (deps.env ?? process.env).CODE_REVIEW_PUBLIC_URL;
  if (options.length > 0) throw new UsageError(`unknown flag: ${options[0]}`);
  if (store === undefined || store === '')
    throw new UsageError('serve requires --store or CODE_REVIEW_STORE');
  const token = (deps.env ?? process.env).CODE_REVIEW_TOKEN;
  if (token === undefined || token === '') throw new UsageError('CODE_REVIEW_TOKEN is required');
  const port = portRaw === undefined ? 3100 : Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new UsageError('--port must be a valid port');
  const start = deps.startDaemon ?? startDaemon;
  const daemon = await start({
    storeDir: store,
    token,
    ...(host === undefined ? {} : { host }),
    port,
    ...(publicUrl === undefined ? {} : { publicUrl }),
  });
  io.stdout.write(`reviewd listening on ${daemon.url}\n`);
  await new Promise<void>((resolve) => {
    if (deps.signal?.aborted === true) {
      resolve();
      return;
    }
    const stop = (): void => resolve();
    deps.signal?.addEventListener('abort', stop, { once: true });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await daemon.close();
  return 0;
}
