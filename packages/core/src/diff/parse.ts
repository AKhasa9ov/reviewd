import type { DiffHunk, DiffLine, ParsedFile } from '../types.js';

interface MutableFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary: boolean;
  hunks: DiffHunk[];
  added: number;
  deleted: number;
  oldMode?: string;
  newMode?: string;
  oldIsNull: boolean;
  newIsNull: boolean;
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/;

export class DiffParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.name = 'DiffParseError';
    this.line = line;
  }
}

export function parseUnifiedDiff(diff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  let current: MutableFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  const finish = (): void => {
    if (current === null) return;
    if (hunk !== null) current.hunks.push(hunk);
    const hunks = current.hunks.filter((candidate) => candidate.lines.length > 0);

    let status = current.status;
    if (current.oldIsNull && !current.newIsNull) status = 'added';
    else if (!current.oldIsNull && current.newIsNull) status = 'deleted';
    else if (current.oldPath !== undefined && current.oldPath !== current.path) status = 'renamed';

    const parsed: ParsedFile = {
      path: current.path,
      status,
      binary: current.binary,
      hunks,
      added: current.added,
      deleted: current.deleted,
    };
    if (current.oldPath !== undefined && current.oldPath !== current.path) {
      parsed.oldPath = current.oldPath;
    }
    if (current.oldMode !== undefined) parsed.oldMode = current.oldMode;
    if (current.newMode !== undefined) parsed.newMode = current.newMode;
    files.push(parsed);

    current = null;
    hunk = null;
  };

  for (const [index, line] of diff.split('\n').entries()) {
    if (line.startsWith('diff --git ')) {
      finish();
      const match = FILE_HEADER.exec(line);
      if (match === null) {
        throw new DiffParseError(
          `Malformed diff file header at line ${index + 1}: expected "diff --git a/<path> b/<path>"`,
          index + 1,
        );
      }
      const oldPath = match[1];
      const newPath = match[2];
      current = {
        path: newPath,
        ...(oldPath !== newPath ? { oldPath } : {}),
        status: 'modified',
        binary: false,
        hunks: [],
        added: 0,
        deleted: 0,
        oldIsNull: false,
        newIsNull: false,
      };
      continue;
    }

    if (current === null) continue;

    if (line.startsWith('@@ ')) {
      if (hunk !== null) current.hunks.push(hunk);
      const match = HUNK_HEADER.exec(line);
      if (match === null) {
        hunk = null;
        continue;
      }
      const oldStart = Number(match[1]);
      const oldLines = match[2] === undefined ? 1 : Number(match[2]);
      const newStart = Number(match[3]);
      const newLines = match[4] === undefined ? 1 : Number(match[4]);
      hunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        header: match[5] ?? '',
        lines: [],
      };
      oldNo = oldStart;
      newNo = newStart;
      continue;
    }

    if (hunk === null) {
      if (line.startsWith('new file mode ')) {
        current.status = 'added';
        current.newMode = line.slice('new file mode '.length);
        continue;
      }
      if (line.startsWith('deleted file mode ')) {
        current.status = 'deleted';
        current.oldMode = line.slice('deleted file mode '.length);
        continue;
      }
      if (line.startsWith('old mode ')) {
        current.oldMode = line.slice('old mode '.length);
        continue;
      }
      if (line.startsWith('new mode ')) {
        current.newMode = line.slice('new mode '.length);
        continue;
      }
      if (line.startsWith('rename from ')) {
        current.oldPath = line.slice('rename from '.length);
        current.status = 'renamed';
        continue;
      }
      if (line.startsWith('rename to ')) {
        current.path = line.slice('rename to '.length);
        current.status = 'renamed';
        continue;
      }
      if (line.startsWith('--- ')) {
        const value = line.slice(4);
        if (value === '/dev/null') {
          current.oldIsNull = true;
          current.status = 'added';
        } else {
          current.oldPath = stripPrefix(value);
        }
        continue;
      }
      if (line.startsWith('+++ ')) {
        const value = line.slice(4);
        if (value === '/dev/null') {
          current.newIsNull = true;
          current.status = 'deleted';
        } else {
          current.path = stripPrefix(value);
        }
        continue;
      }
      if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
        current.binary = true;
        continue;
      }
      continue;
    }

    if (line.startsWith('\\ No newline')) continue;

    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      const kind: DiffLine['kind'] = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'context';
      const text = line.slice(1);
      hunk.lines.push({
        kind,
        oldNo: kind === 'add' ? null : oldNo,
        newNo: kind === 'del' ? null : newNo,
        text,
      });
      if (kind === 'add') {
        current.added += 1;
        newNo += 1;
      } else if (kind === 'del') {
        current.deleted += 1;
        oldNo += 1;
      } else {
        oldNo += 1;
        newNo += 1;
      }
    }
  }

  finish();
  return files;
}

function stripPrefix(path: string): string {
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}
