import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
} from 'react';
import type { Comment, CommentState, FileDiff, Side } from '@dsh-code-review/core';
import { Button } from '../primitives/Button.js';
import { Dialog } from '../primitives/Dialog.js';
import { CommentThread } from './CommentThread.js';
import { commentsAtLine } from './model.js';

const MAX_FULL_FILE_LINES = 2000;
const numberFormat = new Intl.NumberFormat('en-US');

interface FullFileComposer {
  side: Side;
  lineStart: number;
  lineEnd: number;
}

/** Lets the review detail route the `c` shortcut into the open full-file dialog. */
export interface FullFileController {
  commentAtSelection(): void;
}

interface FullFileDialogProps {
  file: FileDiff;
  comments?: readonly Comment[];
  round: number;
  initialSide?: Side | undefined;
  initialLine?: number | undefined;
  composer?: FullFileComposer | null;
  activeCommentId?: string | undefined;
  readOnly?: boolean;
  controllerRef?: MutableRefObject<FullFileController | null> | undefined;
  onClose: () => void;
  onOpenComposer?: (side: Side, lineStart: number, lineEnd: number) => void;
  onCancelComposer?: () => void;
  renderComposer?: (side: Side, lineStart: number, lineEnd: number) => JSX.Element;
  onReply?: (comment: Comment, body: string) => Promise<void>;
  onState?: (comment: Comment, state: CommentState) => Promise<void>;
  onCommentJump?: (comment: Comment) => void;
  onCommentFocus?: (comment: Comment) => void;
}

interface Selection {
  start: number;
  end: number;
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

function lineLabel(start: number, end: number): string {
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
}

export function FullFileDialog({
  file,
  comments = [],
  round,
  initialSide,
  initialLine,
  composer = null,
  activeCommentId,
  readOnly = false,
  controllerRef,
  onClose,
  onOpenComposer,
  onCancelComposer,
  renderComposer,
  onReply,
  onState,
  onCommentJump,
  onCommentFocus,
}: FullFileDialogProps): JSX.Element {
  const hasCurrent = file.newLines !== undefined && file.status !== 'deleted';
  const hasBase = file.oldLines !== undefined && file.status !== 'added';
  const fallbackSide: Side = hasCurrent ? 'new' : 'old';
  const [side, setSide] = useState<Side>(() =>
    initialSide !== undefined &&
    ((initialSide === 'new' && hasCurrent) || (initialSide === 'old' && hasBase))
      ? initialSide
      : fallbackSide,
  );
  const [showAll, setShowAll] = useState(false);
  const [anchor, setAnchor] = useState(initialLine ?? 1);
  const [selection, setSelection] = useState<Selection | null>(
    initialLine === undefined ? null : { start: initialLine, end: initialLine },
  );
  const activeSideRef = useRef<Side | null>(null);
  const commentAtSelectionRef = useRef<() => void>(() => {});

  useEffect(() => {
    setShowAll(false);
  }, [side]);

  const activeSide: Side =
    (side === 'new' && !hasCurrent) || (side === 'old' && !hasBase) ? fallbackSide : side;
  const lines = activeSide === 'new' ? file.newLines : file.oldLines;
  const maxLine = lines?.length ?? 0;

  useEffect(() => {
    if (activeSideRef.current === activeSide) return;
    const first = activeSideRef.current === null;
    activeSideRef.current = activeSide;
    if (first) return;
    setAnchor(1);
    setSelection(null);
    if (composer !== null && composer.side !== activeSide) onCancelComposer?.();
  }, [activeSide, composer, onCancelComposer]);

  useEffect(() => {
    if (maxLine === 0) return;
    setAnchor((current) => Math.min(Math.max(1, current), maxLine));
    setSelection((current) =>
      current === null
        ? null
        : {
            start: Math.min(Math.max(1, current.start), maxLine),
            end: Math.min(Math.max(1, current.end), maxLine),
          },
    );
  }, [maxLine]);

  const changed = useMemo(() => changedLines(file, activeSide), [file, activeSide]);
  const shown = lines === undefined ? [] : showAll ? lines : lines.slice(0, MAX_FULL_FILE_LINES);
  const description =
    lines === undefined
      ? 'Full file content is unavailable.'
      : `${sideLabel(activeSide)} version · ${numberFormat.format(lines.length)} lines · ${numberFormat.format(changed.size)} changed`;
  const focusLine = selection?.end ?? anchor;

  function commentAtSelection(): void {
    if (readOnly || onOpenComposer === undefined) return;
    if (lines === undefined || lines.length === 0) return;
    const target = selection ?? { start: anchor, end: anchor };
    if (selection === null) setSelection(target);
    onOpenComposer(activeSide, target.start, target.end);
  }

  // Refresh the controller closure every render so the route never reads a stale selection.
  commentAtSelectionRef.current = commentAtSelection;

  useEffect(() => {
    if (controllerRef === undefined) return;
    const controller: FullFileController = {
      commentAtSelection: () => commentAtSelectionRef.current(),
    };
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [controllerRef]);

  function commentOnLine(no: number): void {
    if (onOpenComposer === undefined) return;
    setAnchor(no);
    setSelection({ start: no, end: no });
    onOpenComposer(activeSide, no, no);
  }

  function focusLineNumber(no: number): void {
    window.requestAnimationFrame(() => {
      document.getElementById(`full-file-${activeSide}-${no}`)?.focus({ preventScroll: false });
    });
  }

  function selectLine(no: number, extend: boolean): void {
    if (extend) {
      setSelection({ start: Math.min(anchor, no), end: Math.max(anchor, no) });
    } else {
      setAnchor(no);
      setSelection({ start: no, end: no });
    }
    focusLineNumber(no);
  }

  function moveSelection(no: number, extend: boolean): void {
    const next = Math.min(Math.max(1, no), maxLine);
    if (extend) {
      setSelection({ start: Math.min(anchor, next), end: Math.max(anchor, next) });
    } else {
      setAnchor(next);
      setSelection({ start: next, end: next });
    }
    focusLineNumber(next);
  }

  function onLineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, no: number): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(no + (event.key === 'ArrowDown' ? 1 : -1), event.shiftKey);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveSelection(event.key === 'Home' ? 1 : maxLine, event.shiftKey);
      return;
    }
    if (event.key === 'Enter' && selection !== null && !readOnly) {
      event.preventDefault();
      onOpenComposer?.(activeSide, selection.start, selection.end);
    }
  }

  function openSelectionComposer(): void {
    if (selection === null || readOnly) return;
    onOpenComposer?.(activeSide, selection.start, selection.end);
  }

  function handleDialogClose(): void {
    if (composer !== null && onCancelComposer !== undefined) {
      onCancelComposer();
      return;
    }
    onClose();
  }

  function threadFor(no: number): JSX.Element | null {
    const items = commentsAtLine(comments, round, file.path, no, activeSide);
    if (items.length === 0 || onReply === undefined || onState === undefined) return null;
    return (
      <div className="cr-full-file-thread" role="row">
        <div className="cr-full-file-thread-cell" role="cell" aria-colspan={4}>
          {items.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              compact
              active={activeCommentId === comment.id}
              readOnly={readOnly}
              onReply={onReply}
              onState={onState}
              onJump={(item) => {
                onClose();
                onCommentJump?.(item);
              }}
              onFocus={(item) => onCommentFocus?.(item)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Dialog open title={file.path} description={description} onClose={handleDialogClose}>
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
            <div className="cr-full-file-toolbar">
              <p className="cr-meta">
                Click a line, or focus one and use ↑/↓. Shift-click or Shift+↑/↓ selects a range.
              </p>
              {selection !== null && onOpenComposer !== undefined && !readOnly ? (
                <Button size="small" variant="secondary" onClick={openSelectionComposer}>
                  Comment on {lineLabel(selection.start, selection.end)}
                </Button>
              ) : null}
            </div>
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
                <span role="columnheader" aria-hidden="true" />
              </div>
              {shown.map((text, index) => {
                const no = index + 1;
                const isChanged = changed.has(no);
                const kind = isChanged ? (activeSide === 'new' ? 'added' : 'removed') : 'unchanged';
                const selected = selection !== null && no >= selection.start && no <= selection.end;
                return (
                  <div key={`${activeSide}:${no}`} className="cr-full-file-block">
                    <div
                      id={`full-file-${activeSide}-${no}`}
                      className={[
                        'cr-full-file-line',
                        isChanged
                          ? activeSide === 'new'
                            ? 'cr-full-file-line-add'
                            : 'cr-full-file-line-del'
                          : '',
                        selected ? 'cr-full-file-line-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="row"
                      tabIndex={no === focusLine ? 0 : -1}
                      aria-selected={selected}
                      aria-label={`Line ${no}, ${kind}: ${text || '(blank)'}`}
                      onClick={(event: ReactMouseEvent<HTMLDivElement>) =>
                        selectLine(no, event.shiftKey)
                      }
                      onKeyDown={(event) => onLineKeyDown(event, no)}
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
                      <span className="cr-full-file-actions-cell" role="cell">
                        {!readOnly && onOpenComposer !== undefined ? (
                          <button
                            type="button"
                            className="cr-full-file-comment"
                            aria-label={`Comment on line ${no}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              commentOnLine(no);
                            }}
                          >
                            +
                          </button>
                        ) : null}
                      </span>
                    </div>
                    {threadFor(no)}
                    {composer !== null &&
                    composer.side === activeSide &&
                    composer.lineEnd === no &&
                    renderComposer !== undefined ? (
                      <div className="cr-full-file-composer" role="row">
                        <div className="cr-full-file-composer-cell" role="cell" aria-colspan={4}>
                          {renderComposer(activeSide, composer.lineStart, composer.lineEnd)}
                        </div>
                      </div>
                    ) : null}
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
