import { lstat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export class PathEscapeError extends Error {
  constructor(readonly relative: string) {
    super(`path escapes repository root: ${relative}`);
    this.name = 'PathEscapeError';
  }
}

export function safeJoin(root: string, relative: string): string {
  if (relative.includes('\0')) throw new PathEscapeError(relative);
  const absolute = resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new PathEscapeError(relative);
  }
  return absolute;
}

/**
 * Split a NUL-delimited Git path list. A truncated stream may end without a
 * trailing NUL, leaving an incomplete final token; drop it.
 */
export function splitNulPaths(output: string): string[] {
  const paths = output.split('\0');
  if (!output.endsWith('\0')) paths.pop();
  return paths.filter((path) => path.length > 0);
}

/**
 * Detect a symlink in any parent component of a repository-relative path.
 * The final component is excluded: callers inspect it themselves so they can
 * distinguish a symlinked file from a symlinked directory.
 */
export async function hasSymlinkParent(root: string, relativePath: string): Promise<boolean> {
  const absolute = safeJoin(root, relativePath);
  const rel = relative(root, absolute);
  if (rel === '') return false;

  let current = root;
  const parts = rel.split(sep);
  for (const part of parts.slice(0, -1)) {
    current = resolve(current, part);
    const info = await lstat(current).catch(() => null);
    if (info === null) return false;
    if (info.isSymbolicLink()) return true;
    if (!info.isDirectory()) return false;
  }
  return false;
}
