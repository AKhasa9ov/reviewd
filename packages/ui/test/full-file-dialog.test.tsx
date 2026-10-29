// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  Comment,
  FileDiff,
  Finding,
  FindingDecision,
  ReviewQuestion,
} from '@dsh-code-review/core';
import { FullFileDialog } from '../src/review/FullFileDialog.js';

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'src/app.ts',
    status: 'modified',
    binary: false,
    oversized: false,
    added: 1,
    deleted: 1,
    hunks: [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        header: '',
        lines: [
          { kind: 'context', oldNo: 1, newNo: 1, text: 'export function answer() {' },
          { kind: 'del', oldNo: 2, newNo: null, text: '  return 1;' },
          { kind: 'add', oldNo: null, newNo: 2, text: '  return 2;' },
        ],
      },
    ],
    contentHash: null,
    oldLines: ['export function answer() {', '  return 1;'],
    newLines: ['export function answer() {', '  return 2;'],
    ...overrides,
  };
}

function fourLineFile(): FileDiff {
  return file({
    path: 'src/drag.ts',
    status: 'modified',
    added: 0,
    deleted: 0,
    hunks: [],
    oldLines: ['alpha', 'beta', 'gamma', 'delta'],
    newLines: ['alpha', 'beta', 'gamma', 'delta'],
  });
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: 'src/app.ts',
    lineStart: 2,
    lineEnd: 2,
    title: 'Retry budget is hard-coded',
    rationale: 'The retry count cannot be configured per environment.',
    evidence: 'const retry = attempt < 3;',
    ...overrides,
  };
}

function question(overrides: Partial<ReviewQuestion> = {}): ReviewQuestion {
  return {
    id: 'q1',
    file: 'src/app.ts',
    line: 2,
    question: 'Why is this value 2?',
    why: 'The new constant changes the retry budget.',
    ...overrides,
  };
}

function decision(overrides: Partial<FindingDecision> = {}): FindingDecision {
  return {
    findingId: 'f1',
    round: 2,
    state: 'accepted',
    by: { name: 'Ada', kind: 'human' },
    at: '2026-10-27T12:00:00.000Z',
    ...overrides,
  };
}

function humanComment(): Comment {
  return {
    id: 'c1',
    reviewId: 'rev_1',
    createdAt: '2026-10-27T00:00:00.000Z',
    author: { name: 'Ada', kind: 'human' },
    body: 'Please explain this value.',
    state: 'open',
    replies: [],
    anchors: [
      {
        id: 'a1',
        round: 1,
        path: 'src/app.ts',
        side: 'new',
        lineStart: 2,
        lineEnd: 2,
        quote: '  return 2;',
        contextBefore: [],
        contextAfter: [],
        hunkHeader: '',
        contentHash: 'hash',
        state: 'active',
      },
    ],
    outcomes: [],
  };
}

describe('FullFileDialog', () => {
  it('shows an explicit message for binary files without a version toggle', () => {
    render(
      <FullFileDialog
        file={file({ binary: true, oldLines: undefined, newLines: undefined })}
        round={1}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(within(dialog).getByText(/Binary files cannot be displayed/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Current' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/version/)).not.toBeInTheDocument();
  });

  it('defaults to the base version for a deleted file', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <FullFileDialog
        file={file({ status: 'deleted', newLines: undefined, deleted: 2, added: 0 })}
        round={1}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(within(dialog).getByText(/Base version/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('row', { name: /Line 2, removed: return 1;/ }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Current' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels an open composer on Escape without closing the dialog', () => {
    const onClose = vi.fn();
    const onCancelComposer = vi.fn();
    render(
      <FullFileDialog
        file={file()}
        round={1}
        composer={{ side: 'new', lineStart: 1, lineEnd: 1 }}
        onCancelComposer={onCancelComposer}
        onClose={onClose}
        renderComposer={() => <textarea aria-label="Composer" />}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(dialog.querySelector('.cr-full-file-composer-cell')).toHaveAttribute(
      'aria-colspan',
      '4',
    );

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onCancelComposer).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('selects a keyboard range and opens the composer on Enter', async () => {
    const user = userEvent.setup();
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog file={file()} round={1} onOpenComposer={onOpenComposer} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });

    await user.click(within(dialog).getByRole('row', { name: /Line 2, added:/ }));
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}{Enter}');

    expect(onOpenComposer).toHaveBeenCalledWith('new', 1, 2);
  });

  it('opens the composer from a per-line comment action and selects that line', async () => {
    const user = userEvent.setup();
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog file={file()} round={1} onOpenComposer={onOpenComposer} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(dialog.querySelectorAll('[role="columnheader"]')).toHaveLength(4);
    const row = within(dialog).getByRole('row', { name: /Line 2, added:/ });
    expect(row.querySelectorAll('[role="cell"]')).toHaveLength(4);
    expect(row).toHaveAttribute('aria-selected', 'false');

    await user.click(within(row).getByRole('button', { name: 'Comment on line 2' }));

    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(onOpenComposer).toHaveBeenCalledWith('new', 2, 2);
  });

  it('keeps a stationary press unselected and still selects on click', () => {
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog
        file={fourLineFile()}
        round={1}
        onOpenComposer={onOpenComposer}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });
    const line1 = within(dialog).getByRole('row', { name: /Line 1, unchanged: alpha/ });

    fireEvent.mouseDown(line1);
    expect(document.body).toHaveClass('cr-selecting-lines');
    fireEvent.mouseOver(line1);
    expect(line1).toHaveAttribute('aria-selected', 'false');
    expect(dialog.querySelector('.cr-full-file-toolbar button')).toBeNull();

    fireEvent.mouseUp(window);
    expect(document.body).not.toHaveClass('cr-selecting-lines');
    fireEvent.click(line1);

    expect(line1).toHaveAttribute('aria-selected', 'true');
    expect(dialog.querySelector('.cr-full-file-toolbar button')).toHaveTextContent(
      'Comment on line 1',
    );
    expect(onOpenComposer).not.toHaveBeenCalled();
  });

  it('selects a contiguous range by dragging and opens the composer on release', () => {
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog
        file={fourLineFile()}
        round={1}
        onOpenComposer={onOpenComposer}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });
    const line1 = within(dialog).getByRole('row', { name: /Line 1, unchanged: alpha/ });
    const line2 = within(dialog).getByRole('row', { name: /Line 2, unchanged: beta/ });
    const line3 = within(dialog).getByRole('row', { name: /Line 3, unchanged: gamma/ });
    const line4 = within(dialog).getByRole('row', { name: /Line 4, unchanged: delta/ });

    fireEvent.mouseDown(line1);
    expect(document.body).toHaveClass('cr-selecting-lines');
    fireEvent.mouseOver(line2);
    fireEvent.mouseOver(line3);
    fireEvent.mouseOver(line4);
    expect(line1).toHaveAttribute('aria-selected', 'true');
    expect(line4).toHaveAttribute('aria-selected', 'true');

    fireEvent.mouseUp(window);

    expect(document.body).not.toHaveClass('cr-selecting-lines');
    expect(onOpenComposer).toHaveBeenCalledTimes(1);
    expect(onOpenComposer).toHaveBeenCalledWith('new', 1, 4);
    for (const row of [line1, line2, line3, line4]) {
      expect(row).toHaveAttribute('aria-selected', 'true');
    }
    expect(within(dialog).getByRole('button', { name: 'Comment on lines 1–4' })).toBeVisible();
  });

  it('keeps a dragged range when the click that follows the drag lands on a row', () => {
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog
        file={fourLineFile()}
        round={1}
        onOpenComposer={onOpenComposer}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });
    const line1 = within(dialog).getByRole('row', { name: /Line 1, unchanged: alpha/ });
    const line2 = within(dialog).getByRole('row', { name: /Line 2, unchanged: beta/ });
    const line4 = within(dialog).getByRole('row', { name: /Line 4, unchanged: delta/ });

    fireEvent.mouseDown(line1);
    fireEvent.mouseOver(line2);
    fireEvent.mouseOver(line4);
    fireEvent.mouseUp(window);
    expect(onOpenComposer).toHaveBeenCalledWith('new', 1, 4);

    fireEvent.click(line4);

    expect(onOpenComposer).toHaveBeenCalledTimes(1);
    expect(line1).toHaveAttribute('aria-selected', 'true');
    expect(line4).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('button', { name: 'Comment on lines 1–4' })).toBeVisible();
  });

  it('does not start a row drag from the per-line comment action', () => {
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog
        file={fourLineFile()}
        round={1}
        onOpenComposer={onOpenComposer}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });
    const line1 = within(dialog).getByRole('row', { name: /Line 1, unchanged: alpha/ });
    const line4 = within(dialog).getByRole('row', { name: /Line 4, unchanged: delta/ });

    fireEvent.mouseDown(within(line1).getByRole('button', { name: 'Comment on line 1' }));
    fireEvent.mouseOver(line4);
    fireEvent.mouseUp(window);

    expect(onOpenComposer).not.toHaveBeenCalled();
    expect(document.body).not.toHaveClass('cr-selecting-lines');
    expect(line1).toHaveAttribute('aria-selected', 'false');
    expect(line4).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a dragged range but does not open a composer in a read-only dialog', () => {
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog
        file={fourLineFile()}
        round={1}
        readOnly
        onOpenComposer={onOpenComposer}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });
    const line2 = within(dialog).getByRole('row', { name: /Line 2, unchanged: beta/ });
    const line3 = within(dialog).getByRole('row', { name: /Line 3, unchanged: gamma/ });

    fireEvent.mouseDown(line2);
    fireEvent.mouseOver(line3);
    fireEvent.mouseUp(window);

    expect(onOpenComposer).not.toHaveBeenCalled();
    expect(line2).toHaveAttribute('aria-selected', 'true');
    expect(line3).toHaveAttribute('aria-selected', 'true');
    expect(
      within(dialog).queryByRole('button', { name: /Comment on lines/ }),
    ).not.toBeInTheDocument();
  });

  it('clears an in-flight drag when the file version changes', () => {
    const onOpenComposer = vi.fn();
    render(
      <FullFileDialog file={file()} round={1} onOpenComposer={onOpenComposer} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const currentLine1 = within(dialog).getByRole('row', { name: /Line 1, unchanged:/ });
    const currentLine2 = within(dialog).getByRole('row', { name: /Line 2, added:/ });

    fireEvent.mouseDown(currentLine1);
    fireEvent.mouseOver(currentLine2);
    expect(document.body).toHaveClass('cr-selecting-lines');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Base' }));

    expect(document.body).not.toHaveClass('cr-selecting-lines');
    expect(within(dialog).getByRole('row', { name: /Line 1, unchanged:/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    fireEvent.mouseUp(window);
    expect(onOpenComposer).not.toHaveBeenCalled();
  });

  it('removes the drag styling when the dialog unmounts mid-drag', () => {
    const { unmount } = render(
      <FullFileDialog file={fourLineFile()} round={1} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });

    fireEvent.mouseDown(within(dialog).getByRole('row', { name: /Line 1, unchanged: alpha/ }));
    expect(document.body).toHaveClass('cr-selecting-lines');

    unmount();

    expect(document.body).not.toHaveClass('cr-selecting-lines');
  });

  it('renders a comment thread in a full-width row', () => {
    const comment: Comment = {
      id: 'c1',
      reviewId: 'rev_1',
      createdAt: '2026-10-27T00:00:00.000Z',
      author: { name: 'Ada', kind: 'human' },
      body: 'Please explain this value.',
      state: 'open',
      replies: [],
      anchors: [
        {
          id: 'a1',
          round: 1,
          path: 'src/app.ts',
          side: 'new',
          lineStart: 2,
          lineEnd: 2,
          quote: '  return 2;',
          contextBefore: [],
          contextAfter: [],
          hunkHeader: '',
          contentHash: 'hash',
          state: 'active',
        },
      ],
      outcomes: [],
    };
    render(
      <FullFileDialog
        file={file()}
        comments={[comment]}
        round={1}
        onReply={async () => undefined}
        onState={async () => undefined}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(within(dialog).getByText('Please explain this value.')).toBeInTheDocument();
    expect(dialog.querySelector('.cr-full-file-thread-cell')).toHaveAttribute('aria-colspan', '4');
  });

  it('hides the per-line comment action in a read-only dialog', () => {
    render(
      <FullFileDialog
        file={file()}
        round={1}
        initialLine={2}
        readOnly
        onOpenComposer={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(
      within(dialog).queryByRole('button', { name: 'Comment on line 2' }),
    ).not.toBeInTheDocument();
  });

  it('renders long files progressively and can show every line', async () => {
    const user = userEvent.setup();
    const lines = Array.from({ length: 2005 }, (_, index) => `line ${index + 1}`);
    render(
      <FullFileDialog
        file={file({
          status: 'added',
          oldLines: undefined,
          newLines: lines,
          hunks: [],
          added: lines.length,
          deleted: 0,
        })}
        round={1}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(within(dialog).queryByRole('row', { name: /Line 2005/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Show all 2,005 lines' }));
    expect(within(dialog).getByRole('row', { name: /Line 2005/ })).toBeInTheDocument();
  }, 20_000);

  it('renders an agent finding under its start line on the current version', async () => {
    const user = userEvent.setup();
    const value = finding();
    render(<FullFileDialog file={file()} round={1} findings={[value]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const line = within(dialog).getByRole('row', { name: /Line 2, added:/ });
    const card = within(dialog).getByLabelText('major finding: Retry budget is hard-coded');
    const row = line.nextElementSibling;

    expect(card).toHaveTextContent('Retry budget is hard-coded');
    expect(card).not.toHaveTextContent('The retry count cannot be configured per environment.');
    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(card).toHaveTextContent('The retry count cannot be configured per environment.');
    expect(row).toHaveClass('cr-full-file-finding');
    expect(row).toHaveAttribute('role', 'row');
    expect(row).toContainElement(card);
  });

  it('renders an agent question under its line on the current version', async () => {
    const user = userEvent.setup();
    render(<FullFileDialog file={file()} round={1} questions={[question()]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const line = within(dialog).getByRole('row', { name: /Line 2, added:/ });
    const card = within(dialog).getByLabelText('question: Why is this value 2?');
    const row = line.nextElementSibling;

    expect(card).not.toHaveTextContent('Why is this value 2?');
    expect(card).not.toHaveTextContent('The new constant changes the retry budget.');
    await user.click(within(card).getByRole('button', { name: 'Expand question' }));
    expect(card).toHaveTextContent('Why is this value 2?');
    expect(card).toHaveTextContent('The new constant changes the retry budget.');
    expect(row).toHaveClass('cr-full-file-question');
    expect(row).toHaveAttribute('role', 'row');
    expect(row).toContainElement(card);
  });

  it('answers a question from the full-file thread', async () => {
    const user = userEvent.setup();
    const onAnswerQuestion = vi.fn(async () => undefined);
    render(
      <FullFileDialog
        file={file()}
        round={1}
        comments={[humanComment()]}
        questions={[question()]}
        onReply={async () => undefined}
        onState={async () => undefined}
        onCommentJump={vi.fn()}
        onAnswerQuestion={onAnswerQuestion}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const card = within(dialog).getByLabelText('question: Why is this value 2?');

    await user.click(within(card).getByRole('button', { name: 'Expand question' }));
    expect(within(card).getByText('Please explain this value.')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Answer' }));
    await user.type(within(card).getByLabelText('Your answer'), 'It is the retry budget');
    await user.click(within(card).getByRole('button', { name: 'Send answer' }));

    expect(onAnswerQuestion).toHaveBeenCalledWith(question(), 'It is the retry budget');
  });

  it('shows questions only on the current version', async () => {
    const user = userEvent.setup();
    render(<FullFileDialog file={file()} round={1} questions={[question()]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(within(dialog).getByLabelText('question: Why is this value 2?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Base' }));
    expect(
      within(dialog).queryByLabelText('question: Why is this value 2?'),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Current' }));
    expect(within(dialog).getByLabelText('question: Why is this value 2?')).toBeInTheDocument();
  });

  it('renders every finding anchored to the same start line', () => {
    const first = finding();
    const second = finding({ id: 'f2', severity: 'nit', title: 'Name the retry constant' });
    render(<FullFileDialog file={file()} round={1} findings={[first, second]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const line = within(dialog).getByRole('row', { name: /Line 2, added:/ });
    const rows = line.parentElement?.querySelectorAll('.cr-full-file-finding');

    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toContainElement(
      within(dialog).getByLabelText('major finding: Retry budget is hard-coded'),
    );
    expect(rows?.[1]).toContainElement(
      within(dialog).getByLabelText('nit finding: Name the retry constant'),
    );
  });

  it('renders a range finding once under its start line', () => {
    const value = finding({ file: 'src/drag.ts', lineStart: 2, lineEnd: 3 });
    render(<FullFileDialog file={fourLineFile()} round={1} findings={[value]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/drag.ts' });
    const line2 = within(dialog).getByRole('row', { name: /Line 2, unchanged: beta/ });
    const line3 = within(dialog).getByRole('row', { name: /Line 3, unchanged: gamma/ });
    const cards = within(dialog).getAllByLabelText('major finding: Retry budget is hard-coded');

    expect(cards).toHaveLength(1);
    expect(line2.nextElementSibling).toContainElement(cards[0]!);
    expect(line3.parentElement).not.toContainElement(cards[0]!);
  });

  it('shows findings only on the current version', async () => {
    const user = userEvent.setup();
    render(<FullFileDialog file={file()} round={1} findings={[finding()]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(
      within(dialog).getByLabelText('major finding: Retry budget is hard-coded'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Base' }));
    expect(
      within(dialog).queryByLabelText('major finding: Retry budget is hard-coded'),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Current' }));
    expect(
      within(dialog).getByLabelText('major finding: Retry budget is hard-coded'),
    ).toBeInTheDocument();
  });

  it('skips findings for another file or unanchored findings', () => {
    render(
      <FullFileDialog
        file={file()}
        round={1}
        findings={[
          finding(),
          finding({ id: 'f2', file: 'src/other.ts' }),
          finding({ id: 'f3', unanchored: true }),
        ]}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });

    expect(
      within(dialog).getAllByLabelText('major finding: Retry budget is hard-coded'),
    ).toHaveLength(1);
  });

  it('shows the persisted decision and note on the finding card', async () => {
    const user = userEvent.setup();
    const value = finding();
    render(
      <FullFileDialog
        file={file()}
        round={1}
        findings={[value]}
        findingDecisions={new Map([[value.id, decision({ note: 'Will fix in this branch.' })]])}
        onDecideFinding={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const card = within(dialog).getByLabelText('major finding: Retry budget is hard-coded');

    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(within(card).getByText('Accepted')).toBeInTheDocument();
    expect(within(card).getByText('Will fix in this branch.')).toBeInTheDocument();
  });

  it('accepts a finding inline and calls onDecideFinding with the note', async () => {
    const user = userEvent.setup();
    const value = finding();
    const onDecideFinding = vi.fn(async () => true);
    render(
      <FullFileDialog
        file={file()}
        round={1}
        findings={[value]}
        onDecideFinding={onDecideFinding}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const card = within(dialog).getByLabelText('major finding: Retry budget is hard-coded');

    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    await user.click(within(card).getByRole('button', { name: 'Accept' }));
    const form = within(card).getByRole('form', { name: 'Accept finding' });
    await user.type(
      within(form).getByLabelText('Note for the agent (optional)'),
      '  Please fix this before merge.  ',
    );
    await user.click(within(form).getByRole('button', { name: 'Accept finding' }));

    expect(onDecideFinding).toHaveBeenCalledWith(
      value,
      'accepted',
      'Please fix this before merge.',
    );
  });

  it('opens a finding in the report', async () => {
    const user = userEvent.setup();
    const value = finding();
    const onOpenFinding = vi.fn();
    render(
      <FullFileDialog
        file={file()}
        round={1}
        findings={[value]}
        onOpenFinding={onOpenFinding}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const card = within(dialog).getByLabelText('major finding: Retry budget is hard-coded');

    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    await user.click(within(card).getByRole('button', { name: 'Open in report' }));

    expect(onOpenFinding).toHaveBeenCalledWith(value);
  });

  it('omits Open in report when no handler is provided', async () => {
    const user = userEvent.setup();
    render(<FullFileDialog file={file()} round={1} findings={[finding()]} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const card = within(dialog).getByLabelText('major finding: Retry budget is hard-coded');

    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(within(card).queryByRole('button', { name: 'Open in report' })).not.toBeInTheDocument();
  });

  it('renders a finding before the human comment thread on the same line', () => {
    render(
      <FullFileDialog
        file={file()}
        comments={[humanComment()]}
        round={1}
        findings={[finding()]}
        onReply={async () => undefined}
        onState={async () => undefined}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    const line = within(dialog).getByRole('row', { name: /Line 2, added:/ });
    const findingRow = line.nextElementSibling;
    const thread = dialog.querySelector('.cr-full-file-thread');

    expect(findingRow).toHaveClass('cr-full-file-finding');
    expect(within(dialog).getByText('Please explain this value.')).toBeInTheDocument();
    expect(findingRow?.nextElementSibling).toBe(thread);
  });
});
