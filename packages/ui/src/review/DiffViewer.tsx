import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import type {
  Comment,
  CommentState,
  FileDiff,
  Finding,
  FindingDecision,
  ReviewQuestion,
  Side,
  Snapshot,
} from '@dsh-code-review/core';
import { Badge, EmptyState, Skeleton } from '../primitives/Feedback.js';
import { Button } from '../primitives/Button.js';
import { Input } from '../primitives/Field.js';
import { FileIcon } from '../icons.js';
import { CommentThread } from './CommentThread.js';
import type {
  FindingDecisionControlsProps,
  FindingDecisionError,
} from './FindingDecisionControls.js';
import { FullFileDialog, type FullFileController } from './FullFileDialog.js';
import { InlineFinding, severityLetter } from './InlineFinding.js';
import { InlineQuestion } from './InlineQuestion.js';
import {
  buildDiffRows,
  commentsAtLine,
  diffFileId,
  diffLineId,
  filesForSnapshot,
  firstChangedLine,
  latestAnchor,
  type DiffRow,
} from './model.js';

export interface DiffViewerProps {
  snapshot: Snapshot;
  comments: readonly Comment[];
  allComments?: readonly Comment[];
  round: number;
  delta: boolean;
  canDelta: boolean;
  deltaHint?: string | undefined;
  onRequestNextRound?: (() => void) | undefined;
  changedPaths: ReadonlySet<string>;
  findings?: readonly Finding[];
  questions?: readonly ReviewQuestion[];
  findingDecisions?: ReadonlyMap<string, FindingDecision>;
  onDecideFinding?: FindingDecisionControlsProps['onDecide'];
  decidingFindingId?: string | undefined;
  findingDecisionError?: FindingDecisionError | null;
  activeFile?: string | undefined;
  activeLine?: number | undefined;
  activeCommentId?: string | undefined;
  composer?: { path: string; side: Side; lineStart: number; lineEnd: number } | null;
  fullFileComposer?: { path: string; side: Side; lineStart: number; lineEnd: number } | null;
  fullFileJump?: { path: string; side: Side; line: number } | null;
  onFullFileJumpHandled?: (() => void) | undefined;
  fullFileControllerRef?: MutableRefObject<FullFileController | null> | undefined;
  onCancelComposer?: (() => void) | undefined;
  onDeltaChange: (value: boolean) => void;
  onJump: (path: string, line?: number, side?: Side) => void;
  onSelectLine: (file: FileDiff, side: Side, line: number, shift: boolean) => void;
  onSelectRange: (file: FileDiff, side: Side, start: number, end: number) => void;
  onOpenComposer: (
    file: FileDiff,
    side: Side,
    line: number,
    end: number,
    surface?: 'diff' | 'full',
  ) => void;
  onOpenFinding?: (finding: Finding) => void;
  renderComposer?: (file: FileDiff, side: Side, lineStart: number, lineEnd: number) => JSX.Element;
  onReply: (comment: Comment, body: string) => Promise<void>;
  onCommentState: (comment: Comment, state: CommentState) => Promise<void>;
  onCommentJump: (comment: Comment) => void;
  onCommentFocus: (comment: Comment) => void;
  onAnswerQuestion?: ((question: ReviewQuestion, body: string) => Promise<void>) | undefined;
  readOnly?: boolean;
  /** Fetch a diff omitted from the bounded round snapshot. */
  onLoadDiff?: ((path: string) => Promise<FileDiff>) | undefined;
}

const MAX_DIFF_ROWS = 800;
const EMPTY_FINDING_DECISIONS = new Map<string, FindingDecision>();

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

interface FullFileState {
  file: FileDiff;
  side?: Side | undefined;
  line?: number | undefined;
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

function questionsOnLine(
  questions: readonly ReviewQuestion[],
  path: string,
  side: Side,
  line: number,
): ReviewQuestion[] {
  if (side !== 'new') return [];
  return questions.filter((question) => question.file === path && question.line === line);
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
  questions,
  findingDecisions,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
  onJump,
  onLoadDiff,
  onViewFullFile,
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
  onAnswerQuestion,
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
  questions: readonly ReviewQuestion[];
  findingDecisions: ReadonlyMap<string, FindingDecision>;
  onDecideFinding?: DiffViewerProps['onDecideFinding'];
  decidingFindingId?: string | undefined;
  findingDecisionError?: FindingDecisionError | null;
  onJump: DiffViewerProps['onJump'];
  onLoadDiff?: ((path: string) => Promise<FileDiff>) | undefined;
  onViewFullFile: (file: FileDiff) => void;
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
  onAnswerQuestion?: DiffViewerProps['onAnswerQuestion'];
  readOnly: boolean;
}): JSX.Element {
  const [visible, setVisible] = useState(isVisibleFallback());
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requested = useRef(false);
  const generation = useRef(0);
  const ref = useRef<HTMLElement>(null);
  const shownFile = loaded ?? file;
  const rows = buildDiffRows(shownFile);
  const first = firstChangedLine(shownFile);
  const needsLoad = loaded === null && file.truncated === true && onLoadDiff !== undefined;

  const load = useCallback(async (): Promise<FileDiff | null> => {
    if (requested.current || onLoadDiff === undefined) return null;
    requested.current = true;
    const requestGeneration = generation.current;
    setLoading(true);
    try {
      const next = await onLoadDiff(file.path);
      if (generation.current !== requestGeneration) return null;
      setLoaded(next);
      setLoadError(null);
      return next;
    } catch (error) {
      if (generation.current !== requestGeneration) return null;
      setLoadError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [file.path, onLoadDiff]);

  useEffect(() => {
    if (active) setVisible(true);
  }, [active]);

  useEffect(() => {
    generation.current += 1;
    requested.current = false;
    setLoaded(null);
    setLoadError(null);
    setLoading(false);
  }, [file.path, round]);

  useEffect(() => {
    if (!visible || !needsLoad || requested.current) return;
    void load();
  }, [load, needsLoad, visible]);

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
        <span className="cr-diff-stat cr-diff-stat-add">+{shownFile.added}</span>
        <span className="cr-diff-stat cr-diff-stat-del">−{shownFile.deleted}</span>
        {shownFile.binary ? <Badge tone="neutral">binary</Badge> : null}
        {shownFile.truncated === true ? <Badge tone="warning">truncated</Badge> : null}
        {file.ignored === true ? <Badge tone="neutral">ignored</Badge> : null}
        <Button
          variant="secondary"
          size="small"
          className="cr-diff-full-file"
          aria-label={`View full file for ${file.path}`}
          title="View full file"
          onClick={() => {
            if (shownFile.truncated === true && onLoadDiff !== undefined) {
              void load().then((next) => {
                if (next !== null) onViewFullFile(next);
              });
              return;
            }
            onViewFullFile(shownFile);
          }}
        >
          <FileIcon size={14} />
          Full file
        </Button>
      </header>

      {open ? (
        visible ? (
          loading ? (
            <div className="cr-diff-empty">Loading this file's diff…</div>
          ) : loadError !== null ? (
            <div className="cr-diff-empty">
              <span>Could not load this file's diff: {loadError}</span>{' '}
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  requested.current = false;
                  setLoadError(null);
                  void load();
                }}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="cr-diff-empty">
              {shownFile.ignored === true
                ? 'This path is ignored by the review settings.'
                : shownFile.binary
                  ? 'Binary changes are not rendered.'
                  : shownFile.reason === 'diff-truncated'
                    ? 'The diff cap cut this file before its contents. The summary is still available.'
                    : shownFile.reason === 'unreadable'
                      ? 'This file could not be read for the snapshot.'
                      : `No textual diff is available (${shownFile.added} added, ${shownFile.deleted} deleted).`}
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
                    <div className="cr-hunk" key={row.key} role="row">
                      {(() => {
                        const header = row.hunk?.header.trim() ?? '';
                        const raw = header.startsWith('@@');
                        return (
                          <>
                            <span className="cr-hunk-code" role="cell">
                              {raw
                                ? header
                                : `@@ -${row.hunk?.oldStart},${row.hunk?.oldLines} +${row.hunk?.newStart},${row.hunk?.newLines} @@`}
                            </span>
                            {!raw && header !== '' ? (
                              <span className="cr-hunk-header" role="cell">
                                {header}
                              </span>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <DiffLineRow
                      key={row.key}
                      file={shownFile}
                      row={row}
                      comments={comments}
                      round={round}
                      activeLine={activeLine}
                      activeCommentId={activeCommentId}
                      composer={composer}
                      dragRange={dragRange}
                      findings={findings}
                      questions={questions}
                      findingDecisions={findingDecisions}
                      onDecideFinding={onDecideFinding}
                      decidingFindingId={decidingFindingId}
                      findingDecisionError={findingDecisionError}
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
                      onAnswerQuestion={onAnswerQuestion}
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
  questions,
  findingDecisions,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
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
  onAnswerQuestion,
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
  questions: readonly ReviewQuestion[];
  findingDecisions: ReadonlyMap<string, FindingDecision>;
  onDecideFinding?: DiffViewerProps['onDecideFinding'];
  decidingFindingId?: string | undefined;
  findingDecisionError?: FindingDecisionError | null;
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
  onAnswerQuestion?: DiffViewerProps['onAnswerQuestion'];
  readOnly: boolean;
}): JSX.Element {
  const line = row.line;
  if (line === undefined) return <></>;
  const side: Side = line.kind === 'del' ? 'old' : 'new';
  const no = side === 'new' ? line.newNo : line.oldNo;
  if (no === null) return <></>;
  const lineComments = commentsAtLine(comments, round, file.path, no, side);
  const lineFindings = findingsOnLine(findings, file.path, side, no);
  const lineQuestions = questionsOnLine(questions, file.path, side, no);
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
              {severityLetter(highestRisk.severity)}
            </button>
          )}
        </span>
        <code className="cr-diff-text" role="cell">
          {line.text === '' ? ' ' : line.text}
        </code>
        <span className="cr-diff-actions-cell" role="cell">
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
        </span>
      </div>
      {lineFindings
        .filter((finding) => finding.lineStart === no)
        .map((finding) => (
          <div className="cr-inline-finding-row" role="row" key={finding.id}>
            <InlineFinding
              finding={finding}
              decision={findingDecisions.get(finding.id)}
              readOnly={readOnly}
              pending={decidingFindingId === finding.id}
              lineKind={
                line.kind === 'add' ? 'added' : line.kind === 'del' ? 'removed' : 'unchanged'
              }
              error={
                findingDecisionError?.findingId === finding.id ? findingDecisionError.message : null
              }
              onDecide={onDecideFinding}
              onOpenFinding={onOpenFinding}
            />
          </div>
        ))}
      {lineQuestions.map((question) => (
        <div className="cr-inline-question-row" role="row" key={question.id}>
          <InlineQuestion
            question={question}
            comments={lineComments}
            readOnly={readOnly}
            lineKind={line.kind === 'add' ? 'added' : line.kind === 'del' ? 'removed' : 'unchanged'}
            activeCommentId={activeCommentId}
            onReply={onReply}
            onState={onCommentState}
            onJump={onCommentJump}
            onFocus={onCommentFocus}
            {...(onAnswerQuestion === undefined
              ? {}
              : { onAnswer: (body: string) => onAnswerQuestion(question, body) })}
          />
        </div>
      ))}
      {lineQuestions.length === 0 && lineComments.length > 0 ? (
        <div className="cr-inline-thread" role="row">
          <div className="cr-inline-thread-cell" role="cell">
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
        </div>
      ) : null}
      {composer !== null &&
      composer !== undefined &&
      composer.path === file.path &&
      composer.side === side &&
      composer.lineStart === no &&
      renderComposer !== undefined ? (
        <div className="cr-inline-composer" role="row">
          <div role="cell">{renderComposer(file, side, composer.lineStart, composer.lineEnd)}</div>
        </div>
      ) : null}
    </>
  );
}

export function DiffViewer({
  snapshot,
  comments,
  allComments,
  round,
  delta,
  canDelta,
  deltaHint,
  onRequestNextRound,
  changedPaths,
  findings = [],
  questions = [],
  findingDecisions = EMPTY_FINDING_DECISIONS,
  onDecideFinding,
  decidingFindingId,
  findingDecisionError,
  activeFile,
  activeLine,
  activeCommentId,
  composer,
  fullFileComposer,
  fullFileJump,
  onFullFileJumpHandled,
  fullFileControllerRef,
  onCancelComposer,
  onDeltaChange,
  onJump,
  onLoadDiff,
  onSelectLine,
  onSelectRange,
  onOpenComposer,
  onOpenFinding,
  renderComposer,
  onReply,
  onCommentState,
  onCommentJump,
  onCommentFocus,
  onAnswerQuestion,
  readOnly = false,
}: DiffViewerProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragRange, setDragRange] = useState<DragRange | null>(null);
  const [wrap, setWrap] = useState(true);
  const [currentFile, setCurrentFile] = useState<string | undefined>(activeFile);
  const [fullFile, setFullFile] = useState<FullFileState | null>(null);
  const filesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const openComposerRef = useRef(onOpenComposer);
  openComposerRef.current = onOpenComposer;
  const allFiles = useMemo(() => filesForSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    if (activeFile !== undefined) setCurrentFile(activeFile);
  }, [activeFile]);

  useEffect(() => {
    if (fullFileJump === null || fullFileJump === undefined) return;
    let alive = true;
    const file = allFiles.find((item) => item.path === fullFileJump.path);
    if (file === undefined) return;
    if (file.truncated === true && onLoadDiff !== undefined) {
      void onLoadDiff(file.path)
        .then((next) => {
          if (!alive) return;
          setFullFile({ file: next, side: fullFileJump.side, line: fullFileJump.line });
          onFullFileJumpHandled?.();
        })
        .catch(() => {
          if (alive) onFullFileJumpHandled?.();
        });
      return () => {
        alive = false;
      };
    }
    setFullFile({ file, side: fullFileJump.side, line: fullFileJump.line });
    onFullFileJumpHandled?.();
    return () => {
      alive = false;
    };
  }, [allFiles, fullFileJump, onFullFileJumpHandled, onLoadDiff]);

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
  const visibleFiles = delta ? allFiles.filter((file) => changedPaths.has(file.path)) : allFiles;
  const query = search.trim().toLowerCase();
  const filteredFiles =
    query === ''
      ? visibleFiles
      : visibleFiles.filter((file) => file.path.toLowerCase().includes(query));
  const groups = groupByDirectory(filteredFiles);
  const fileKey = filteredFiles.map((file) => file.path).join('\u0000');

  useEffect(() => {
    const root = filesRef.current;
    if (root === null || typeof window === 'undefined') return;
    let frame = 0;
    function update(): void {
      frame = 0;
      const sections = [...root!.querySelectorAll<HTMLElement>('.cr-diff-file[data-file]')];
      if (sections.length === 0) return;
      const viewportHeight = window.innerHeight;
      let next: string | undefined;
      let bestVisible = 0;
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        if (visible > bestVisible) {
          bestVisible = visible;
          next = section.dataset.file;
        }
      }
      const fallback = sections[0]?.dataset.file;
      const resolved = next ?? fallback;
      if (resolved !== undefined) {
        setCurrentFile((previous) => (previous === resolved ? previous : resolved));
      }
    }
    function schedule(): void {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [fileKey]);
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

  if (allFiles.length === 0) {
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
                            currentFile === file.path ? 'cr-tree-file-active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            const first = firstChangedLine(file);
                            onJump(file.path, first?.line);
                          }}
                          title={file.path}
                          aria-current={currentFile === file.path ? 'true' : undefined}
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
              aria-pressed={delta && canDelta}
              aria-describedby={!canDelta && deltaHint !== undefined ? 'cr-delta-hint' : undefined}
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
          {!canDelta && deltaHint !== undefined ? (
            <span className="cr-diff-delta-note" id="cr-delta-hint">
              {deltaHint}
              {round <= 1 && onRequestNextRound !== undefined ? (
                <button type="button" className="cr-link-button" onClick={onRequestNextRound}>
                  Create the next round
                </button>
              ) : null}
            </span>
          ) : null}
          <div className="cr-segmented" role="group" aria-label="Code display">
            <button
              type="button"
              className="cr-segmented-button"
              aria-pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              Wrap lines
            </button>
          </div>
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
          <div
            className={['cr-diff-files', wrap ? 'cr-diff-wrap' : ''].filter(Boolean).join(' ')}
            ref={filesRef}
          >
            {filteredFiles.map((file) => (
              <DiffFileSection
                key={file.path}
                file={file}
                comments={comments}
                round={round}
                active={currentFile === file.path}
                activeLine={activeFile === file.path ? activeLine : undefined}
                activeCommentId={activeCommentId}
                composer={composer}
                dragRange={dragRange}
                findings={findings}
                questions={questions}
                findingDecisions={findingDecisions}
                onDecideFinding={onDecideFinding}
                decidingFindingId={decidingFindingId}
                findingDecisionError={findingDecisionError}
                onJump={onJump}
                onLoadDiff={onLoadDiff}
                onViewFullFile={(file) => setFullFile({ file })}
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
                onAnswerQuestion={onAnswerQuestion}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
      {fullFile !== null ? (
        <FullFileDialog
          key={`${fullFile.file.path}:${fullFile.side ?? 'default'}:${fullFile.line ?? 'all'}`}
          file={fullFile.file}
          comments={allComments ?? comments}
          round={round}
          initialSide={fullFile.side}
          initialLine={fullFile.line}
          composer={
            fullFileComposer !== null &&
            fullFileComposer !== undefined &&
            fullFileComposer.path === fullFile.file.path
              ? {
                  side: fullFileComposer.side,
                  lineStart: fullFileComposer.lineStart,
                  lineEnd: fullFileComposer.lineEnd,
                }
              : null
          }
          activeCommentId={activeCommentId}
          readOnly={readOnly}
          controllerRef={fullFileControllerRef}
          findings={findings}
          questions={questions}
          findingDecisions={findingDecisions}
          onDecideFinding={onDecideFinding}
          decidingFindingId={decidingFindingId}
          findingDecisionError={findingDecisionError}
          {...(onOpenFinding === undefined
            ? {}
            : {
                onOpenFinding: (finding: Finding) => {
                  setFullFile(null);
                  onOpenFinding(finding);
                },
              })}
          onClose={() => setFullFile(null)}
          onOpenComposer={(side, start, end) =>
            onOpenComposer(fullFile.file, side, start, end, 'full')
          }
          onCancelComposer={onCancelComposer}
          {...(renderComposer === undefined
            ? {}
            : {
                renderComposer: (side: Side, start: number, end: number) =>
                  renderComposer(fullFile.file, side, start, end),
              })}
          onReply={onReply}
          onState={onCommentState}
          onCommentJump={onCommentJump}
          onCommentFocus={onCommentFocus}
          onAnswerQuestion={onAnswerQuestion}
        />
      ) : null}
    </div>
  );
}
