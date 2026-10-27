import { useEffect, useMemo, useState } from 'react';
import type { FileDiff, Side } from '@dsh-code-review/core';
import { Button } from '../primitives/Button.js';
import { Dialog } from '../primitives/Dialog.js';

const MAX_FULL_FILE_LINES = 2000;
const numberFormat = new Intl.NumberFormat('en-US');

interface FullFileDialogProps {
  file: FileDiff;
  onClose: () => void;
}

function sideLabel(side: Side): string {
  return side === 'new' ? 'Current' : 'Base';
}

function changedLines(file: FileDiff, side: Side): Set<number> {
  const lines = new Set<number>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (side === 'new' && line.kind === 'add' && line.newNo !== null) lines.add(line.newNo);
      if (side === 'old' && line.kind === 'del' && line.oldNo !== null) lines.add(line.oldNo);
    }
  }
  return lines;
}

function unavailableMessage(file: FileDiff): string {
  if (file.binary) return 'Binary files cannot be displayed as text.';
  if (file.oversized) return 'This file is too large to include in the snapshot.';
  if (file.truncated)
    return "The snapshot omitted this file's full content because of a size limit.";
  if (file.reason === 'unreadable')
    return 'This file could not be read when the snapshot was built.';
  if (file.reason === 'diff-truncated')
    return 'This file fell beyond the diff cap, so its full content is unavailable.';
  if (file.ignored) return 'This path is ignored and its content was not captured.';
  return 'Full file content is unavailable for this file.';
}

export function FullFileDialog({ file, onClose }: FullFileDialogProps): JSX.Element {
  const hasCurrent = file.newLines !== undefined && file.status !== 'deleted';
  const hasBase = file.oldLines !== undefined && file.status !== 'added';
  const [side, setSide] = useState<Side>(hasCurrent ? 'new' : 'old');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
  }, [side]);

  const activeSide: Side =
    (side === 'new' && !hasCurrent) || (side === 'old' && !hasBase)
      ? hasCurrent
        ? 'new'
        : 'old'
      : side;
  const lines = activeSide === 'new' ? file.newLines : file.oldLines;
  const changed = useMemo(() => changedLines(file, activeSide), [file, activeSide]);
  const shown = lines === undefined ? [] : showAll ? lines : lines.slice(0, MAX_FULL_FILE_LINES);
  const description =
    lines === undefined
      ? 'Full file content is unavailable.'
      : `${sideLabel(activeSide)} version · ${numberFormat.format(lines.length)} lines · ${numberFormat.format(changed.size)} changed`;

  return (
    <Dialog open title={file.path} description={description} onClose={onClose}>
      <div className="cr-file-view">
        {hasCurrent && hasBase ? (
          <div className="cr-segmented" role="group" aria-label="File version">
            <button
              type="button"
              className="cr-segmented-button"
              aria-pressed={activeSide === 'new'}
              onClick={() => setSide('new')}
            >
              Current
            </button>
            <button
              type="button"
              className="cr-segmented-button"
              aria-pressed={activeSide === 'old'}
              onClick={() => setSide('old')}
            >
              Base
            </button>
          </div>
        ) : null}

        {lines === undefined ? (
          <p className="cr-notice cr-notice-warning">{unavailableMessage(file)}</p>
        ) : lines.length === 0 ? (
          <p className="cr-meta">This file is empty.</p>
        ) : (
          <>
            <div
              className="cr-full-file"
              role="table"
              aria-label={`Full ${activeSide === 'new' ? 'current' : 'base'} file for ${file.path}`}
            >
              <div className="cr-full-file-head" role="row">
                <span className="cr-full-file-no" role="columnheader">
                  line
                </span>
                <span role="columnheader" aria-hidden="true" />
                <span role="columnheader">content</span>
              </div>
              {shown.map((text, index) => {
                const no = index + 1;
                const isChanged = changed.has(no);
                const kind = isChanged ? (activeSide === 'new' ? 'added' : 'removed') : 'unchanged';
                return (
                  <div
                    key={`${activeSide}:${no}`}
                    className={[
                      'cr-full-file-line',
                      isChanged
                        ? activeSide === 'new'
                          ? 'cr-full-file-line-add'
                          : 'cr-full-file-line-del'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="row"
                    aria-label={`Line ${no}, ${kind}: ${text || '(blank)'}`}
                  >
                    <span className="cr-full-file-no" role="cell" aria-hidden="true">
                      {no}
                    </span>
                    <span className="cr-full-file-marker" role="cell" aria-hidden="true">
                      {isChanged ? (activeSide === 'new' ? '+' : '−') : ' '}
                    </span>
                    <code className="cr-full-file-code" role="cell">
                      {text === '' ? ' ' : text}
                    </code>
                  </div>
                );
              })}
            </div>
            {lines.length > MAX_FULL_FILE_LINES && !showAll ? (
              <div className="cr-full-file-more">
                <Button variant="secondary" size="small" onClick={() => setShowAll(true)}>
                  Show all {numberFormat.format(lines.length)} lines
                </Button>
                <span className="cr-meta">Rendering is capped to keep the dialog responsive.</span>
              </div>
            ) : null}
          </>
        )}

        <div className="cr-dialog-actions">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
