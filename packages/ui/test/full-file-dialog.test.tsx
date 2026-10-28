// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment, FileDiff } from '@dsh-code-review/core';
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
});
