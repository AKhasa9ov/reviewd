import { resolve, sep } from 'node:path';

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
