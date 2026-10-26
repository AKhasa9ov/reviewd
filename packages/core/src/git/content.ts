import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { hasSymlinkParent, safeJoin } from '../paths.js';
import { GitError, runGit } from './run.js';
import type { GitResult } from './run.js';

export interface BlobRead {
  lines: string[] | null;
  binary: boolean;
  oversized: boolean;
  symlink: boolean;
  hash: string;
}

const EMPTY: BlobRead = {
  lines: null,
  binary: false,
  oversized: false,
  symlink: false,
  hash: '',
};

function hashOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function splitLines(buffer: Buffer): string[] {
  const lines = buffer.toString('utf8').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export async function readBlob(
  repoRoot: string,
  revision: string | null,
  path: string,
  maxLines: number,
): Promise<BlobRead> {
  let buffer: Buffer;

  if (revision === null) {
    const absolute = safeJoin(repoRoot, path);
    if (await hasSymlinkParent(repoRoot, path)) {
      return { ...EMPTY, symlink: true };
    }
    const info = await lstat(absolute).catch(() => null);
    if (info === null) return EMPTY;
    if (info.isSymbolicLink()) {
      const target = await readlink(absolute).catch(() => null);
      if (target === null) return { ...EMPTY, symlink: true };
      const targetBuffer = Buffer.from(target, 'utf8');
      const targetLines = splitLines(targetBuffer);
      if (targetLines.length > maxLines) return { ...EMPTY, oversized: true };
      return {
        lines: targetLines,
        binary: false,
        oversized: false,
        symlink: true,
        hash: hashOf(targetBuffer),
      };
    }
    if (!info.isFile()) return EMPTY;
    if (info.size > 8 * 1024 * 1024) {
      return { ...EMPTY, oversized: true };
    }
    buffer = await readFile(absolute);
  } else {
    let result: GitResult;
    try {
      result = await runGit(repoRoot, ['show', `${revision}:${path}`], {
        allowFailure: true,
        maxBytes: 8 * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof GitError && error.message.includes('exceeded')) {
        return { ...EMPTY, oversized: true };
      }
      throw error;
    }
    if (result.code !== 0) return EMPTY;
    buffer = result.stdoutBytes;
  }

  if (buffer.includes(0)) {
    return { ...EMPTY, binary: true, hash: hashOf(buffer) };
  }

  const lines = splitLines(buffer);
  if (lines.length > maxLines) {
    return { ...EMPTY, oversized: true };
  }

  return {
    lines,
    binary: false,
    oversized: false,
    symlink: false,
    hash: hashOf(buffer),
  };
}
