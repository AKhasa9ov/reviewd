import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type {
  Comment,
  CommentState,
  FileDiff,
  Finding,
  Side,
  Snapshot,
} from '@dsh-code-review/core';
import { Badge, EmptyState, Skeleton } from '../primitives/Feedback.js';
import { Button } from '../primitives/Button.js';
import { Input } from '../primitives/Field.js';
import { CommentThread } from './CommentThread.js';
import {
  buildDiffRows,
  commentsAtLine,
  diffFileId,
  diffLineId,
  firstChangedLine,
  latestAnchor,
  type DiffRow,
} from './model.js';

export interface DiffViewerProps {
  snapshot: Snapshot;
  comments: readonly Comment[];
  round: number;
  delta: boolean;
  changedPaths: ReadonlySet<string>;
  findings?: readonly Finding[];
  activeFile?: string | undefined;
  activeLine?: number | undefined;
  activeCommentId?: string | undefined;
  composer?: { path: string; side: Side; lineStart: number; lineEnd: number } | null;
  onDeltaChange: (value: boolean) => void;
  onJump: (path: string, line?: number, side?: Side) => void;
  onSelectLine: (file: FileDiff, side: Side, line: number, shift: boolean) => void;
  onSelectRange: (file: FileDiff, side: Side, start: number, end: number) => void;
  onOpenComposer: (file: FileDiff, side: Side, line: number, end: number) => void;
  onOpenFinding?: (finding: Finding) => void;
  renderComposer?: (file: FileDiff, side: Side, lineStart: number, lineEnd: number) => JSX.Element;
  onReply: (comment: Comment, body: string) => Promise<void>;
  onCommentState: (comment: Comment, state: CommentState) => Promise<void>;
  onCommentJump: (comment: Comment) => void;
  onCommentFocus: (comment: Comment) => void;
  readOnly?: boolean;
}

const MAX_DIFF_ROWS = 800;

interface DragRange {
  path: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
}

interface DragState extends DragRange {
  anchor: number;
  last: number;
  file: FileDiff;
}

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  blocker: 4,
  major: 3,
  minor: 2,
  nit: 1,
};

function findingsOnLine(
  findings: readonly Finding[],
  path: string,
  side: Side,
  line: number,
): Finding[] {
  if (side !== 'new') return [];
  return findings.filter(
    (finding) =>
      finding.file === path &&
      finding.unanchored !== true &&
      line >= finding.lineStart &&
      line <= finding.lineEnd,
  );
}

function highestFinding(findings: readonly Finding[]): Finding | null {
  return findings.reduce<Finding | null>(
    (highest, finding) =>
      highest === null || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[highest.severity]
        ? finding
        : highest,
    null,
  );
}

function statusTone(
  status: FileDiff['status'],
): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (status === 'added' || status === 'untracked') return 'success';
  if (status === 'deleted') return 'danger';
  if (status === 'renamed') return 'warning';
  if (status === 'submodule') return 'info';
  return 'neutral';
}

function statusLetter(status: FileDiff['status']): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'submodule':
      return 'S';
    case 'untracked':
      return 'U';
    default:
      return 'M';
  }
}

interface FileGroup {
  directory: string;
  files: FileDiff[];
}

function groupByDirectory(files: FileDiff[]): FileGroup[] {
  const groups = new Map<string, FileDiff[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const directory = slash < 0 ? '/' : file.path.slice(0, slash);
    const existing = groups.get(directory);
    if (existing === undefined) groups.set(directory, [file]);
    else existing.push(file);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([directory, items]) => ({
      directory,
      files: items.sort((a, b) => a.path.localeCompare(b.path)),
    }));
}

function fileEstimate(rows: readonly DiffRow[]): number {
  return Math.min(720, Math.max(120, rows.length * 20 + 44));
}

function isVisibleFallback(): boolean {
  return typeof IntersectionObserver === 'undefined';
}

function DiffFileSection({
  file,
  comments,
  round,
  active,
  activeLine,
  activeCommentId,
  composer,
  dragRange,
  findings,
  onJump,
  onSelectLine,
  onLineDragStart,
  onLineDragEnter,
  onOpenComposer,
  onOpenFinding,
  consumeSuppressedClick,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  readOnly = false,
}: {
  file: FileDiff;
  comments: readonly Comment[];
  round: number;
  active: boolean;
  activeLine?: number | undefined;
  activeCommentId?: string | undefined;
  composer: DiffViewerProps['composer'];
  dragRange: DragRange | null;
  findings: readonly Finding[];
  onJump: DiffViewerProps['onJump'];
  onSelectLine: DiffViewerProps['onSelectLine'];
  onLineDragStart: (file: FileDiff, side: Side, line: number, event: ReactMouseEvent) => void;
  onLineDragEnter: (file: FileDiff, side: Side, line: number) => void;
  onOpenComposer: DiffViewerProps['onOpenComposer'];
  onOpenFinding: DiffViewerProps['onOpenFinding'];
  consumeSuppressedClick: () => boolean;
  renderComposer: DiffViewerProps['renderComposer'];
  onReply: DiffViewerProps['onReply'];
  onCommentState: DiffViewerProps['onCommentState'];
  onCommentJump: DiffViewerProps['onCommentJump'];
  onCommentFocus: DiffViewerProps['onCommentFocus'];
  readOnly: boolean;
}): JSX.Element {
  const rows = buildDiffRows(file);
  const [visible, setVisible] = useState(isVisibleFallback());
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (active) setVisible(true);
  }, [active]);

  useEffect(() => {
    if (visible || isVisibleFallback() || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (node === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const shown = showAll ? rows : rows.slice(0, MAX_DIFF_ROWS);
  const first = firstChangedLine(file);

  return (
    <section
      ref={ref}
      id={diffFileId(file.path)}
      className={['cr-diff-file', active ? 'cr-diff-file-active' : ''].filter(Boolean).join(' ')}
      data-file={file.path}
      aria-label={`Diff for ${file.path}`}
      style={{ minHeight: visible ? undefined : fileEstimate(rows) }}
    >
      <header className="cr-diff-file-head">
        <button
          type="button"
          className="cr-diff-collapse"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${file.path}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? '⌄' : '›'}</span>
        </button>
        <button
          type="button"
          className="cr-diff-path"
          onClick={() => onJump(file.path, first?.line)}
          title={file.path}
        >
          <span className="cr-diff-path-text">{file.path}</span>
          {file.oldPath !== undefined ? <span className="cr-meta">from {file.oldPath}</span> : null}
        </button>
        <Badge tone={statusTone(file.status)}>
          {statusLetter(file.status)} {file.status}
        </Badge>
        <span className="cr-diff-stat cr-diff-stat-add">+{file.added}</span>
        <span className="cr-diff-stat cr-diff-stat-del">−{file.deleted}</span>
        {file.binary ? <Badge tone="neutral">binary</Badge> : null}
        {file.truncated === true ? <Badge tone="warning">truncated</Badge> : null}
        {file.ignored === true ? <Badge tone="neutral">ignored</Badge> : null}
      </header>

      {open ? (
        visible ? (
          rows.length === 0 ? (
            <div className="cr-diff-empty">
              {file.ignored === true
                ? 'This path is ignored by the review settings.'
                : file.binary
                  ? 'Binary changes are not rendered.'
                  : file.reason === 'diff-truncated'
                    ? 'The diff cap cut this file before its contents. The summary is still available.'
                    : file.reason === 'unreadable'
                      ? 'This file could not be read for the snapshot.'
                      : `No textual diff is available (${file.added} added, ${file.deleted} deleted).`}
            </div>
          ) : (
            <>
              <div
                className="cr-diff-body"
                role="table"
                aria-label={`Unified diff for ${file.path}`}
              >
                <div className="cr-diff-gutter-head" aria-hidden="true">
                  <span>old</span>
                  <span>new</span>
                  <span />
                  <span />
                </div>
                {shown.map((row) =>
                  row.type === 'hunk' ? (
                    <div className="cr-hunk" key={row.key} role="separator">
                      {(() => {
                        const header = row.hunk?.header.trim() ?? '';
                        const raw = header.startsWith('@@');
                        return (
                          <>
                            <span className="cr-hunk-code">
                              {raw
                                ? header
                                : `@@ -${row.hunk?.oldStart},${row.hunk?.oldLines} +${row.hunk?.newStart},${row.hunk?.newLines} @@`}
                            </span>
                            {!raw && header !== '' ? (
                              <span className="cr-hunk-header">{header}</span>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <DiffLineRow
                      key={row.key}
                      file={file}
                      row={row}
                      comments={comments}
                      round={round}
                      activeLine={activeLine}
                      activeCommentId={activeCommentId}
                      composer={composer}
                      dragRange={dragRange}
                      findings={findings}
                      onSelectLine={onSelectLine}
                      onLineDragStart={onLineDragStart}
                      onLineDragEnter={onLineDragEnter}
                      onOpenComposer={onOpenComposer}
                      onOpenFinding={onOpenFinding}
                      consumeSuppressedClick={consumeSuppressedClick}
                      renderComposer={renderComposer}
                      onReply={onReply}
                      onCommentState={onCommentState}
                      onCommentJump={onCommentJump}
                      onCommentFocus={onCommentFocus}
                      readOnly={readOnly}
                    />
                  ),
                )}
              </div>
              {rows.length > MAX_DIFF_ROWS && !showAll ? (
                <div className="cr-diff-more">
                  <Button variant="secondary" size="small" onClick={() => setShowAll(true)}>
                    Show all {rows.length} diff rows
                  </Button>
                  <span className="cr-meta">Rendering is capped to keep the page responsive.</span>
                </div>
              ) : null}
            </>
          )
        ) : (
          <div className="cr-diff-placeholder" aria-hidden="true">
            <Skeleton width="44%" height={12} />
            <div style={{ height: 8 }} />
            <Skeleton width="76%" height={12} />
            <div style={{ height: 8 }} />
            <Skeleton width="63%" height={12} />
            <span className="cr-visually-hidden">Loading {file.path}</span>
          </div>
        )
      ) : null}
    </section>
  );
}

function DiffLineRow({
  file,
  row,
  comments,
  round,
  activeLine,
  activeCommentId,
  composer,
  dragRange,
  findings,
  onSelectLine,
  onLineDragStart,
  onLineDragEnter,
  onOpenComposer,
  onOpenFinding,
  consumeSuppressedClick,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  readOnly,
}: {
  file: FileDiff;
  row: DiffRow;
  comments: readonly Comment[];
  round: number;
  activeLine?: number | undefined;
  activeCommentId?: string | undefined;
  composer: DiffViewerProps['composer'];
  dragRange: DragRange | null;
  findings: readonly Finding[];
  onSelectLine: DiffViewerProps['onSelectLine'];
  onLineDragStart: (file: FileDiff, side: Side, line: number, event: ReactMouseEvent) => void;
  onLineDragEnter: (file: FileDiff, side: Side, line: number) => void;
  onOpenComposer: DiffViewerProps['onOpenComposer'];
  onOpenFinding: DiffViewerProps['onOpenFinding'];
  consumeSuppressedClick: () => boolean;
  renderComposer: DiffViewerProps['renderComposer'];
  onReply: DiffViewerProps['onReply'];
  onCommentState: DiffViewerProps['onCommentState'];
  onCommentJump: DiffViewerProps['onCommentJump'];
  onCommentFocus: DiffViewerProps['onCommentFocus'];
  readOnly: boolean;
}): JSX.Element {
  const line = row.line;
  if (line === undefined) return <></>;
  const side: Side = line.kind === 'del' ? 'old' : 'new';
  const no = side === 'new' ? line.newNo : line.oldNo;
  if (no === null) return <></>;
  const lineComments = commentsAtLine(comments, round, file.path, no, side);
  const lineFindings = findingsOnLine(findings, file.path, side, no);
  const highestRisk = highestFinding(lineFindings);
  const selected = activeLine === no;
  const inDragRange =
    dragRange !== null &&
    dragRange.path === file.path &&
    dragRange.side === side &&
    no >= dragRange.lineStart &&
    no <= dragRange.lineEnd;
  const range =
    composer !== null &&
    composer !== undefined &&
    composer.path === file.path &&
    composer.side === side &&
    no >= composer.lineStart &&
    no <= composer.lineEnd;
  const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ';
  const label = `line ${no}, ${line.kind === 'add' ? 'added' : line.kind === 'del' ? 'removed' : 'context'}: ${line.text || '(blank)'}`;

  return (
    <>
      <div
        id={diffLineId(file.path, side, no)}
        className={[
          'cr-diff-line',
          `cr-diff-line-${line.kind}`,
          selected ? 'cr-diff-line-selected' : '',
          range ? 'cr-diff-line-range' : '',
          inDragRange ? 'cr-diff-line-drag' : '',
          lineComments.length > 0 ? 'cr-diff-line-commented' : '',
          highestRisk !== null ? `cr-diff-line-risk cr-risk-${highestRisk.severity}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="row"
        tabIndex={0}
        aria-label={label}
        aria-current={selected ? 'true' : undefined}
        onMouseDown={(event) => {
          if (event.button !== 0 || event.shiftKey) return;
          const target = event.target as HTMLElement | null;
          if (target === null || target.closest('button, a, input, textarea, select') !== null)
            return;
          onLineDragStart(file, side, no, event);
        }}
        onMouseOver={() => onLineDragEnter(file, side, no)}
        onClick={(event) => {
          if (consumeSuppressedClick()) return;
          onSelectLine(file, side, no, event.shiftKey);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectLine(file, side, no, event.shiftKey);
          }
        }}
      >
        <span className="cr-diff-no" role="cell">
          {line.oldNo ?? ''}
        </span>
        <span className="cr-diff-no" role="cell">
          {line.newNo ?? ''}
        </span>
        <span className="cr-diff-marker" aria-hidden="true">
          {marker}
        </span>
        <span className="cr-diff-risk-cell" role="cell">
          {highestRisk === null ? null : (
            <button
              type="button"
              className={`cr-diff-risk-pin cr-risk-${highestRisk.severity}`}
              title={`${highestRisk.severity}: ${highestRisk.title}${
                highestRisk.lineEnd > highestRisk.lineStart
                  ? ` (lines ${highestRisk.lineStart}–${highestRisk.lineEnd})`
                  : ''
              }`}
              aria-label={`Open ${highestRisk.severity} finding ${highestRisk.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenFinding?.(highestRisk);
              }}
            >
              {highestRisk.severity === 'blocker'
                ? 'B'
                : highestRisk.severity === 'major'
                  ? 'M'
                  : highestRisk.severity === 'minor'
                    ? 'm'
                    : 'n'}
            </button>
          )}
        </span>
        <code className="cr-diff-text" role="cell">
          {line.text === '' ? ' ' : line.text}
        </code>
        {!readOnly ? (
          <button
            type="button"
            className="cr-diff-comment"
            aria-label={`Comment on line ${no}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenComposer(file, side, no, no);
            }}
          >
            +
          </button>
        ) : null}
        {lineComments.length > 0 ? (
          <span className="cr-diff-comment-count" aria-label={`${lineComments.length} comments`}>
            {lineComments.length}
          </span>
        ) : null}
      </div>
      {lineComments.length > 0 ? (
        <div className="cr-inline-thread">
          {lineComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              compact
              active={activeCommentId === comment.id}
              readOnly={readOnly}
              onReply={onReply}
              onState={onCommentState}
              onJump={onCommentJump}
              onFocus={onCommentFocus}
            />
          ))}
        </div>
      ) : null}
      {composer !== null &&
      composer !== undefined &&
      composer.path === file.path &&
      composer.side === side &&
      composer.lineStart === no &&
      renderComposer !== undefined ? (
        <div className="cr-inline-composer">
          {renderComposer(file, side, composer.lineStart, composer.lineEnd)}
        </div>
      ) : null}
    </>
  );
}

export function DiffViewer({
  snapshot,
  comments,
  round,
  delta,
  changedPaths,
  findings = [],
  activeFile,
  activeLine,
  activeCommentId,
  composer,
  onDeltaChange,
  onJump,
  onSelectLine,
  onSelectRange,
  onOpenComposer,
  onOpenFinding,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  readOnly = false,
}: DiffViewerProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragRange, setDragRange] = useState<DragRange | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const openComposerRef = useRef(onOpenComposer);
  openComposerRef.current = onOpenComposer;

  useEffect(() => {
    function finishDrag(): void {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragRange(null);
      document.body.classList.remove('cr-selecting-lines');
      if (drag === null || drag.last === drag.anchor) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (!readOnly) {
        openComposerRef.current(
          drag.file,
          drag.side,
          Math.min(drag.anchor, drag.last),
          Math.max(drag.anchor, drag.last),
        );
      }
    }
    window.addEventListener('mouseup', finishDrag);
    return () => {
      window.removeEventListener('mouseup', finishDrag);
      document.body.classList.remove('cr-selecting-lines');
    };
  }, [readOnly]);

  function beginLineDrag(file: FileDiff, side: Side, line: number, event: ReactMouseEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    onSelectRange(file, side, line, line);
    dragRef.current = {
      path: file.path,
      side,
      lineStart: line,
      lineEnd: line,
      anchor: line,
      last: line,
      file,
    };
    setDragRange({ path: file.path, side, lineStart: line, lineEnd: line });
    document.body.classList.add('cr-selecting-lines');
  }

  function enterLine(file: FileDiff, side: Side, line: number): void {
    const drag = dragRef.current;
    if (drag === null || drag.path !== file.path || drag.side !== side) return;
    drag.last = line;
    drag.lineStart = Math.min(drag.anchor, line);
    drag.lineEnd = Math.max(drag.anchor, line);
    setDragRange({
      path: drag.path,
      side: drag.side,
      lineStart: drag.lineStart,
      lineEnd: drag.lineEnd,
    });
    onSelectRange(file, side, drag.lineStart, drag.lineEnd);
  }

  function consumeSuppressedClick(): boolean {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }
  const visibleFiles = delta
    ? snapshot.files.filter((file) => changedPaths.has(file.path))
    : snapshot.files;
  const query = search.trim().toLowerCase();
  const filteredFiles =
    query === ''
      ? visibleFiles
      : visibleFiles.filter((file) => file.path.toLowerCase().includes(query));
  const groups = groupByDirectory(filteredFiles);
  const canDelta = round > 1;
  const openCommentsByPath = new Map<string, number>();
  for (const comment of comments) {
    if (comment.state !== 'open') continue;
    const anchor = latestAnchor(comment);
    if (anchor === undefined) continue;
    openCommentsByPath.set(anchor.path, (openCommentsByPath.get(anchor.path) ?? 0) + 1);
  }

  function riskBadge(path: string): JSX.Element | null {
    const items = findings.filter(
      (finding) => finding.file === path && finding.unanchored !== true,
    );
    const highest = highestFinding(items);
    if (highest === null) return null;
    return (
      <span
        className={`cr-tree-risk cr-risk-${highest.severity}`}
        aria-label={`${items.length} reviewer ${items.length === 1 ? 'risk' : 'risks'}, highest ${highest.severity}`}
        title={`${items.length} reviewer ${items.length === 1 ? 'risk' : 'risks'} · highest ${highest.severity}`}
      >
        {items.length}
      </span>
    );
  }

  if (snapshot.files.length === 0) {
    return (
      <EmptyState
        title="No changed files"
        description="This round has no diff against its base. Refresh after new commits or switch rounds."
      />
    );
  }

  return (
    <div className="cr-diff-layout">
      <aside className="cr-file-tree" aria-label="Changed files">
        <div className="cr-file-tree-head">
          <span className="cr-card-title">Files</span>
          <span className="cr-meta">{visibleFiles.length}</span>
        </div>
        <Input
          label="Filter files"
          hideLabel
          type="search"
          placeholder="Filter files…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {filteredFiles.length === 0 ? (
          <p className="cr-meta cr-file-tree-empty">No files match this filter.</p>
        ) : (
          <div className="cr-tree">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.directory);
              return (
                <div className="cr-tree-group" key={group.directory}>
                  <button
                    type="button"
                    className="cr-tree-dir"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(group.directory)) next.delete(group.directory);
                        else next.add(group.directory);
                        return next;
                      })
                    }
                  >
                    <span aria-hidden="true">{isCollapsed ? '›' : '⌄'}</span>
                    <span className="cr-tree-dir-name">{group.directory}</span>
                  </button>
                  {isCollapsed
                    ? null
                    : group.files.map((file) => (
                        <button
                          type="button"
                          key={file.path}
                          className={[
                            'cr-tree-file',
                            activeFile === file.path ? 'cr-tree-file-active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            const first = firstChangedLine(file);
                            onJump(file.path, first?.line);
                          }}
                          title={file.path}
                        >
                          <span
                            className={`cr-tree-status cr-tree-status-${file.status}`}
                            aria-hidden="true"
                          >
                            {statusLetter(file.status)}
                          </span>
                          <span className="cr-tree-path">
                            {file.path.slice(
                              group.directory === '/' ? 0 : group.directory.length + 1,
                            )}
                          </span>
                          <span className="cr-tree-stat">
                            {file.added > 0 ? `+${file.added}` : ''}
                            {file.deleted > 0 ? ` −${file.deleted}` : ''}
                          </span>
                          {riskBadge(file.path)}
                          {(openCommentsByPath.get(file.path) ?? 0) > 0 ? (
                            <span
                              className="cr-tree-comments"
                              aria-label={`${openCommentsByPath.get(file.path) ?? 0} open comments`}
                              title={`${openCommentsByPath.get(file.path) ?? 0} open comments`}
                            >
                              {openCommentsByPath.get(file.path)}
                            </span>
                          ) : null}
                        </button>
                      ))}
                </div>
              );
            })}
          </div>
        )}
      </aside>

      <div className="cr-diff-main">
        <div className="cr-diff-toolbar">
          <div className="cr-segmented" role="group" aria-label="Diff range">
            <button
              type="button"
              className="cr-segmented-button"
              aria-pressed={delta}
              disabled={!canDelta}
              onClick={() => onDeltaChange(true)}
            >
              Delta
            </button>
            <button
              type="button"
              className="cr-segmented-button"
              aria-pressed={!delta}
              onClick={() => onDeltaChange(false)}
            >
              Full diff to base
            </button>
          </div>
          <span className="cr-meta cr-diff-scope-note">
            {delta && canDelta ? `r${round} vs r${round - 1}` : 'base → head'}
          </span>
          <span className="cr-meta cr-diff-count">
            {filteredFiles.length} file{filteredFiles.length === 1 ? '' : 's'}
          </span>
          <span className="cr-meta cr-shortcut-hint" aria-hidden="true">
            j/k files · c comment
          </span>
          <label className="cr-mobile-file-select">
            <span className="cr-visually-hidden">Jump to file</span>
            <select
              value={activeFile ?? ''}
              onChange={(event) => {
                if (event.target.value !== '') onJump(event.target.value);
              }}
            >
              <option value="">Jump to file…</option>
              {filteredFiles.map((file) => (
                <option value={file.path} key={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredFiles.length === 0 ? (
          <EmptyState
            title={delta ? 'No files changed in this round' : 'No files match this filter'}
            description={
              delta
                ? 'Switch to the full diff to review the whole branch.'
                : 'Clear the file filter to see the complete diff.'
            }
            action={
              delta ? (
                <Button variant="secondary" onClick={() => onDeltaChange(false)}>
                  Show full diff
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="cr-diff-files">
            {filteredFiles.map((file) => (
              <DiffFileSection
                key={file.path}
                file={file}
                comments={comments}
                round={round}
                active={activeFile === file.path}
                activeLine={activeFile === file.path ? activeLine : undefined}
                activeCommentId={activeCommentId}
                composer={composer}
                dragRange={dragRange}
                findings={findings}
                onJump={onJump}
                onSelectLine={onSelectLine}
                onLineDragStart={beginLineDrag}
                onLineDragEnter={enterLine}
                onOpenComposer={onOpenComposer}
                onOpenFinding={onOpenFinding}
                consumeSuppressedClick={consumeSuppressedClick}
                renderComposer={renderComposer}
                onReply={onReply}
                onCommentState={onCommentState}
                onCommentJump={onCommentJump}
                onCommentFocus={onCommentFocus}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
