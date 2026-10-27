// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileDiff } from '@dsh-code-review/core';
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

describe('FullFileDialog', () => {
  it('shows an explicit message for binary files without a version toggle', () => {
    render(
      <FullFileDialog
        file={file({ binary: true, oldLines: undefined, newLines: undefined })}
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
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'src/app.ts' });
    expect(within(dialog).queryByRole('row', { name: /Line 2005/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Show all 2,005 lines' }));
    expect(within(dialog).getByRole('row', { name: /Line 2005/ })).toBeInTheDocument();
  }, 20_000);
});
