import { createHash } from 'node:crypto';
import { createId } from './ids.js';
import type { Anchor, AnchorPosition, Side } from './types.js';
import type { DiffHunk, FileDiff, Snapshot } from '../types.js';

export type AnchorErrorCode = 'missing-path' | 'missing-lines' | 'invalid-range' | 'invalid-round';

export class AnchorError extends Error {
  readonly code: AnchorErrorCode;

  constructor(code: AnchorErrorCode, message: string) {
    super(message);
    this.name = 'AnchorError';
    this.code = code;
  }
}

export interface CaptureAnchorInput {
  path: string;
  side: Side;
  lineStart: number;
  lineEnd?: number;
  round: number;
  id?: string;
}

export interface ReanchorOptions {
  round: number;
  id?: string;
  window?: number;
}

const DEFAULT_WINDOW = 40;
const CONTEXT_LINES = 2;

interface Candidate {
  start: number;
  score: number;
  distance: number;
}

function normalizeLine(line: string): string {
  return line.replace(/\r$/, '').replace(/[ \t]+$/, '');
}

function normalizeQuote(quote: string): string[] {
  return quote.split('\n').map(normalizeLine);
}

function hashQuote(quote: string): string {
  return createHash('sha256').update(quote, 'utf8').digest('hex');
}

function position(anchor: Anchor): AnchorPosition {
  return {
    round: anchor.round,
    path: anchor.path,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd,
  };
}

function linesFor(file: FileDiff, side: Side): string[] | undefined {
  return side === 'new' ? file.newLines : file.oldLines;
}

function hunkHeaderFor(hunks: DiffHunk[], line: number, side: Side): string {
  for (const hunk of hunks) {
    const start = side === 'new' ? hunk.newStart : hunk.oldStart;
    const count = side === 'new' ? hunk.newLines : hunk.oldLines;
    if (count > 0 && line >= start && line < start + count) return hunk.header;
  }
  return '';
}

function contextBefore(lines: string[], lineStart: number): string[] {
  return lines.slice(Math.max(0, lineStart - 1 - CONTEXT_LINES), lineStart - 1);
}

function contextAfter(lines: string[], lineEnd: number): string[] {
  return lines.slice(lineEnd, lineEnd + CONTEXT_LINES);
}

/**
 * Captures a comment anchor against one side of a snapshot. Invalid input is a
 * caller error; re-anchoring missing content is not (see `reanchor`).
 */
export function captureAnchor(snapshot: Snapshot, input: CaptureAnchorInput): Anchor {
  if (!Number.isInteger(input.round) || input.round < 1) {
    throw new AnchorError('invalid-round', `round must be a positive integer: ${input.round}`);
  }
  const file = snapshot.files.find((candidate) => candidate.path === input.path);
  if (file === undefined) {
    throw new AnchorError('missing-path', `file is not present in the snapshot: ${input.path}`);
  }

  const lines = linesFor(file, input.side);
  if (lines === undefined || lines.length === 0) {
    if (file.truncated === true) {
      throw new AnchorError('missing-lines', `file content was truncated: ${input.path}`);
    }
    throw new AnchorError(
      'missing-lines',
      `snapshot has no ${input.side} lines for: ${input.path}`,
    );
  }

  const lineEnd = input.lineEnd ?? input.lineStart;
  if (
    !Number.isInteger(input.lineStart) ||
    !Number.isInteger(lineEnd) ||
    input.lineStart < 1 ||
    lineEnd < input.lineStart ||
    lineEnd > lines.length
  ) {
    throw new AnchorError(
      'invalid-range',
      `range ${input.lineStart}..${lineEnd} is outside 1..${lines.length}`,
    );
  }

  const quote = lines.slice(input.lineStart - 1, lineEnd).join('\n');
  return {
    id: input.id ?? createId('anc'),
    round: input.round,
    path: input.path,
    side: input.side,
    lineStart: input.lineStart,
    lineEnd,
    quote,
    contextBefore: contextBefore(lines, input.lineStart),
    contextAfter: contextAfter(lines, lineEnd),
    hunkHeader: hunkHeaderFor(file.hunks, input.lineStart, input.side),
    contentHash: hashQuote(quote),
    state: 'active',
  };
}

function resolveFile(previous: Anchor, next: Snapshot): FileDiff | undefined {
  return (
    next.files.find((file) => file.path === previous.path) ??
    next.files.find((file) => file.oldPath === previous.path)
  );
}

function expectedOldLine(line: number, hunks: DiffHunk[]): number {
  let delta = 0;
  for (const hunk of hunks) {
    const oldEnd = hunk.oldStart + hunk.oldLines - 1;
    if (hunk.oldLines > 0 && line >= hunk.oldStart && line <= oldEnd) {
      return hunk.newStart + (line - hunk.oldStart);
    }
    if (hunk.oldStart + hunk.oldLines <= line) {
      delta += hunk.newLines - hunk.oldLines;
    }
  }
  return line + delta;
}

function contextMatches(
  lines: string[],
  context: string[],
  start: number,
  quoteLength: number,
  direction: 'before' | 'after',
): boolean {
  if (context.length === 0) return false;
  for (let index = 0; index < context.length; index += 1) {
    const lineIndex =
      direction === 'before'
        ? start - 2 - (context.length - 1 - index)
        : start + quoteLength - 1 + index;
    const line = lines[lineIndex];
    if (line === undefined || normalizeLine(line) !== normalizeLine(context[index] ?? '')) {
      return false;
    }
  }
  return true;
}

function outdated(previous: Anchor, file: FileDiff | undefined, options: ReanchorOptions): Anchor {
  return {
    id: options.id ?? createId('anc'),
    round: options.round,
    path: file?.path ?? previous.path,
    side: previous.side,
    lineStart: previous.lineStart,
    lineEnd: previous.lineEnd,
    quote: previous.quote,
    contextBefore: [...previous.contextBefore],
    contextAfter: [...previous.contextAfter],
    hunkHeader: previous.hunkHeader,
    contentHash: previous.contentHash,
    state: 'outdated',
    previous: position(previous),
  };
}

/**
 * Re-anchors a comment against the next round's snapshot. A missing file,
 * missing side or an absent quote degrades to `outdated`; this function never
 * throws for content-level problems.
 */
export function reanchor(previous: Anchor, next: Snapshot, options: ReanchorOptions): Anchor {
  const file = resolveFile(previous, next);
  if (file === undefined) return outdated(previous, undefined, options);

  // Re-anchoring always searches the post-change side: old-side anchors are
  // mapped through hunks into new line numbers before the search.
  const lines = file.newLines;
  if (lines === undefined || lines.length === 0) return outdated(previous, file, options);

  const quoteLines = normalizeQuote(previous.quote);
  if (quoteLines.length === 0 || lines.length < quoteLines.length) {
    return outdated(previous, file, options);
  }

  const expectedRaw =
    previous.side === 'old' ? expectedOldLine(previous.lineStart, file.hunks) : previous.lineStart;
  const expected = Math.max(1, expectedRaw);
  const window = Number.isFinite(options.window)
    ? Math.max(0, Math.trunc(options.window as number))
    : DEFAULT_WINDOW;
  const maxStart = lines.length - quoteLines.length + 1;
  const from = Math.max(1, expected - window);
  const to = Math.min(maxStart, expected + window);

  let best: Candidate | undefined;
  let tied = false;
  for (let start = from; start <= to; start += 1) {
    let matches = true;
    for (let offset = 0; offset < quoteLines.length; offset += 1) {
      const line = lines[start - 1 + offset];
      if (line === undefined || normalizeLine(line) !== quoteLines[offset]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    const distance = Math.abs(start - expected);
    const score =
      3 +
      (contextMatches(lines, previous.contextBefore, start, quoteLines.length, 'before') ? 1 : 0) +
      (contextMatches(lines, previous.contextAfter, start, quoteLines.length, 'after') ? 1 : 0) +
      Math.max(0, 1 - distance / (window + 1));
    if (
      best === undefined ||
      score > best.score ||
      (score === best.score && distance < best.distance)
    ) {
      best = { start, score, distance };
      tied = false;
    } else if (score === best.score && distance === best.distance) {
      tied = true;
    }
  }

  if (best === undefined) return outdated(previous, file, options);

  const lineStart = best.start;
  const lineEnd = lineStart + quoteLines.length - 1;
  return {
    id: options.id ?? createId('anc'),
    round: options.round,
    path: file.path,
    side: previous.side,
    lineStart,
    lineEnd,
    quote: previous.quote,
    contextBefore: contextBefore(lines, lineStart),
    contextAfter: contextAfter(lines, lineEnd),
    hunkHeader: hunkHeaderFor(file.hunks, lineStart, 'new'),
    contentHash: hashQuote(previous.quote),
    state: tied ? 'ambiguous' : 'active',
    previous: position(previous),
  };
}
