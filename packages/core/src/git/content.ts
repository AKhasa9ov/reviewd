import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { hasSymlinkParent, safeJoin } from '../paths.js';
import { GitError, runGit } from './run.js';
import type { GitResult } from './run.js';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export interface BlobRead {
  lines: string[] | null;
  binary: boolean;
  oversized: boolean;
  symlink: boolean;
  hash: string;
  /** Raw bytes retained for content-budget accounting (0 when no content is kept). */
  bytes: number;
  encoding?: 'unknown';
  reason?: 'unreadable';
}

const EMPTY: BlobRead = {
  lines: null,
  binary: false,
  oversized: false,
  symlink: false,
  hash: '',
  bytes: 0,
};

function hashOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function splitText(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function decode(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function readBuffer(buffer: Buffer, maxLines: number, symlink: boolean): BlobRead {
  if (buffer.includes(0)) {
    return { ...EMPTY, binary: true, hash: hashOf(buffer), bytes: buffer.length };
  }
  const text = decode(buffer);
  if (text === null) {
    return {
      ...EMPTY,
      binary: true,
      encoding: 'unknown',
      hash: hashOf(buffer),
      bytes: buffer.length,
    };
  }
  const lines = splitText(text);
  if (lines.length > maxLines) return { ...EMPTY, oversized: true };
  return {
    lines,
    binary: false,
    oversized: false,
    symlink,
    hash: hashOf(buffer),
    bytes: buffer.length,
  };
}

export async function readBlob(
  repoRoot: string,
  revision: string | null,
  path: string,
  maxLines: number,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<BlobRead> {
  let buffer: Buffer;

  if (revision === null) {
    const absolute = safeJoin(repoRoot, path);
    if (await hasSymlinkParent(repoRoot, path)) {
      return { ...EMPTY, symlink: true };
    }

    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(absolute);
    } catch {
      return { ...EMPTY, reason: 'unreadable' };
    }
    if (info.isSymbolicLink()) {
      let target: Buffer;
      try {
        target = await readlink(absolute, { encoding: 'buffer' });
      } catch {
        return { ...EMPTY, symlink: true, reason: 'unreadable' };
      }
      if (target.length > maxBytes) return { ...EMPTY, symlink: true, oversized: true };
      return readBuffer(target, maxLines, true);
    }
    if (!info.isFile()) return EMPTY;
    if (info.size > maxBytes) {
      return { ...EMPTY, oversized: true };
    }

    try {
      buffer = await readFile(absolute);
    } catch {
      return { ...EMPTY, reason: 'unreadable' };
    }
  } else {
    let result: GitResult;
    try {
      result = await runGit(repoRoot, ['show', `${revision}:${path}`], {
        allowFailure: true,
        maxBytes,
      });
    } catch (error) {
      if (error instanceof GitError && error.message.includes('exceeded')) {
        return { ...EMPTY, oversized: true };
      }
      throw error;
    }
    if (result.code !== 0) return EMPTY;
    if (result.stdoutBytes.length > maxBytes) return { ...EMPTY, oversized: true };
    buffer = result.stdoutBytes;
  }

  return readBuffer(buffer, maxLines, false);
}
