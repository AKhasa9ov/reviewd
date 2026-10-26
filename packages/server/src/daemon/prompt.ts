import type { FileDiff } from '@dsh-code-review/core';

/** Diff budget for a reviewer prompt; the rest of the prompt is metadata. */
export const DIFF_PROMPT_LIMIT = 60_000;

const TRUNCATION_MARKER = '[diff truncated: prompt budget reached]';

export interface RenderedDiff {
  text: string;
  truncated: boolean;
}

function fileHeader(file: FileDiff): string[] {
  const oldPath = file.oldPath ?? file.path;
  const lines = [`diff --git a/${oldPath} b/${file.path}`];
  if (file.binary) {
    lines.push(`Binary files a/${oldPath} and b/${file.path} differ`);
    return lines;
  }
  if (file.status === 'added') lines.push('--- /dev/null', `+++ b/${file.path}`);
  else if (file.status === 'deleted') lines.push(`--- a/${oldPath}`, '+++ /dev/null');
  else lines.push(`--- a/${oldPath}`, `+++ b/${file.path}`);
  return lines;
}

function hunkLines(file: FileDiff): string[] {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    const suffix = hunk.header === '' ? '' : ` ${hunk.header}`;
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${suffix}`,
    );
    for (const line of hunk.lines) {
      const prefix = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
      lines.push(`${prefix}${line.text}`);
    }
  }
  return lines;
}

/**
 * Renders the snapshot as a unified diff so the reviewer reads patch text rather
 * than a JSON dump. Output is capped by characters; once the cap is reached the
 * rest of the diff is dropped and marked, and the reviewer is told to read the
 * repository directly for the remainder.
 */
export function renderBoundedDiff(
  files: readonly FileDiff[],
  limit: number = DIFF_PROMPT_LIMIT,
): RenderedDiff {
  const rendered: string[] = [];
  let size = 0;
  let truncated = false;

  const append = (line: string): boolean => {
    const cost = line.length + (rendered.length === 0 ? 0 : 1);
    if (size + cost > limit) {
      truncated = true;
      return false;
    }
    rendered.push(line);
    size += cost;
    return true;
  };

  for (const file of files) {
    if (file.ignored === true) continue;
    let stopped = false;
    for (const line of fileHeader(file)) {
      if (!append(line)) {
        stopped = true;
        break;
      }
    }
    if (stopped) break;
    if (file.binary) continue;
    for (const line of hunkLines(file)) {
      if (!append(line)) {
        stopped = true;
        break;
      }
    }
    if (stopped) break;
  }

  const text = rendered.join('\n');
  if (!truncated) return { text, truncated };
  return { text: text === '' ? TRUNCATION_MARKER : `${text}\n${TRUNCATION_MARKER}`, truncated };
}

export interface ReviewPromptContext {
  previousRound?: number;
  previousReport?: unknown;
  unresolved?: ReadonlyArray<{
    path: string;
    lineStart: number;
    body: string;
    state: string;
  }>;
}

export interface ReviewPromptInput {
  title: string;
  reviewId: string;
  round: number;
  kind: 'initial' | 'verify';
  files: readonly FileDiff[];
  diffLimit?: number;
  context?: ReviewPromptContext;
}

export interface ReviewPrompt {
  prompt: string;
  truncated: boolean;
}

/** Builds the single user message the reviewer agent receives for a job. */
export function buildReviewPrompt(input: ReviewPromptInput): ReviewPrompt {
  const rendered = renderBoundedDiff(
    input.files,
    input.diffLimit === undefined ? DIFF_PROMPT_LIMIT : input.diffLimit,
  );
  const lines = [
    `# Independent code review: ${input.title}`,
    '',
    `Review: ${input.reviewId}`,
    `Round: ${input.round}`,
    `Kind: ${input.kind}`,
    '',
    'Read-only review: inspect the repository as needed, but do not modify files,',
    'spawn agents, or start or refresh reviews.',
    'Return strict JSON with schemaVersion 1: summary, riskLevel, findings, questions,',
    'tests and verification. Every finding needs file, lineStart and evidence.',
    '',
    'Changed files:',
  ];
  if (input.kind === 'verify' && input.context !== undefined) {
    const context = input.context;
    lines.push('', '## Verification round', '');
    lines.push(
      'Re-check the previous findings against this round and the unresolved comments.',
      'For every previous finding, return a verification entry with status',
      '`fixed`, `not-fixed` or `unclear`, quoting the new line when fixed.',
      'Do not repeat findings that are already fixed; do report regressions.',
    );
    if (context.previousRound !== undefined) {
      lines.push('', `Previous round: ${context.previousRound}`);
    }
    if (context.unresolved !== undefined && context.unresolved.length > 0) {
      lines.push('', 'Unresolved human comments:');
      for (const comment of context.unresolved) {
        lines.push(
          `- ${comment.path}:${comment.lineStart} [${comment.state}] ${comment.body.replace(/\s+/g, ' ').slice(0, 500)}`,
        );
      }
    }
    if (context.previousReport !== undefined) {
      const previous = JSON.stringify(context.previousReport);
      lines.push('', 'Previous reviewer report (JSON, bounded):');
      lines.push(previous.length > 20_000 ? `${previous.slice(0, 20_000)}…` : previous);
    }
  }
  if (input.files.length === 0) lines.push('The review contains no file changes.');
  else lines.push(rendered.text);
  return { prompt: lines.join('\n'), truncated: rendered.truncated };
}
