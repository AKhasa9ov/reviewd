import { normalizeQuote } from './anchors.js';
import type { Anchor, Outcome, Suggestion } from './types.js';
import type { FileDiff, Snapshot } from '../types.js';

function findFile(anchor: Anchor, snapshot: Snapshot): FileDiff | undefined {
  return (
    snapshot.files.find((file) => file.path === anchor.path) ??
    snapshot.files.find((file) => file.oldPath === anchor.path)
  );
}

function contentAt(anchor: Anchor, file: FileDiff): string | null {
  const lines = file.newLines;
  if (lines === undefined || file.truncated === true) return null;
  if (
    !Number.isInteger(anchor.lineStart) ||
    !Number.isInteger(anchor.lineEnd) ||
    anchor.lineStart < 1 ||
    anchor.lineEnd < anchor.lineStart ||
    anchor.lineEnd > lines.length
  ) {
    return null;
  }
  return normalizeQuote(lines.slice(anchor.lineStart - 1, anchor.lineEnd).join('\n'));
}

function containsBlock(lines: string[] | undefined, block: string): boolean {
  if (lines === undefined || block === '') return false;
  const wanted = normalizeQuote(block).split('\n');
  if (wanted.length === 0) return false;
  for (let start = 0; start + wanted.length <= lines.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < wanted.length; offset += 1) {
      const line = lines[start + offset];
      if (line === undefined || normalizeQuote(line) !== wanted[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * Derives the deterministic “fixed / not fixed” guess for one re-anchored
 * comment. This is intentionally a pure, no-LLM signal: the reviewer's
 * verification and the agent's fix/claim are separate inputs in later rounds.
 */
export function deriveOutcome(
  previous: Anchor,
  next: Anchor,
  nextSnapshot: Snapshot,
  suggestion?: Suggestion,
): Outcome {
  const file = findFile(next, nextSnapshot);
  const content = file === undefined ? null : contentAt(next, file);
  if (next.state === 'outdated' || file === undefined || content === null) {
    return { round: next.round, status: 'outdated', confidence: 'high' };
  }

  const previousQuote = normalizeQuote(previous.quote);
  const nextQuote = normalizeQuote(next.quote);

  if (
    suggestion !== undefined &&
    normalizeQuote(suggestion.original) === previousQuote &&
    content === normalizeQuote(suggestion.replacement) &&
    content !== previousQuote
  ) {
    return { round: next.round, status: 'applied', confidence: 'high' };
  }

  if (nextQuote === previousQuote) {
    if (
      next.lineStart === previous.lineStart &&
      next.lineEnd === previous.lineEnd &&
      next.path === previous.path
    ) {
      return { round: next.round, status: 'unchanged', confidence: 'high' };
    }
    return { round: next.round, status: 'moved', confidence: 'high' };
  }

  if (next.state === 'active' || next.state === 'ambiguous') {
    const confidence =
      suggestion !== undefined && containsBlock(file.newLines, suggestion.replacement)
        ? 'high'
        : 'medium';
    return { round: next.round, status: 'addressed', confidence };
  }

  return { round: next.round, status: 'outdated', confidence: 'low' };
}
