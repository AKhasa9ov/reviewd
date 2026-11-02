import { useEffect, useRef, useState } from 'react';
import type {
  AgentReport,
  Comment,
  CommentState,
  Finding,
  FindingDecision,
  FindingDecisionState,
} from '@sir_yami/reviewd-core';
import { Badge, EmptyState } from '../primitives/Feedback.js';
import { Select } from '../primitives/Field.js';
import { Tabs } from '../primitives/Tabs.js';
import { Button } from '../primitives/Button.js';
import { Dialog } from '../primitives/Dialog.js';
import { FindingDecisionControls } from './FindingDecisionControls.js';
import type {
  FindingDecisionControlsProps,
  FindingDecisionError,
} from './FindingDecisionControls.js';
import { ThreadConversation } from './ThreadConversation.js';
import { commentsAtLine, findingCounts, filterFindings } from './model.js';

export interface ReportCommentTarget {
  file: string;
  lineStart: number;
  lineEnd: number;
}

const SEVERITIES: Array<Finding['severity'] | 'all'> = ['all', 'blocker', 'major', 'minor', 'nit'];
const CATEGORIES: Array<Finding['category'] | 'all'> = [
  'all',
  'security',
  'correctness',
  'tests',
  'performance',
  'maintainability',
  'api',
  'concurrency',
  'docs',
  'other',
];

function severityTone(severity: Finding['severity']): 'danger' | 'warning' | 'info' | 'neutral' {
  if (severity === 'blocker') return 'danger';
  if (severity === 'major') return 'warning';
  if (severity === 'minor') return 'info';
  return 'neutral';
}

function riskTone(risk: string): 'danger' | 'warning' | 'success' | 'neutral' {
  if (risk === 'critical') return 'danger';
  if (risk === 'high') return 'warning';
  if (risk === 'low') return 'success';
  return 'neutral';
}

export interface ReportPanelProps {
  report: AgentReport | null | undefined;
  onJump: (location: { file: string; lineStart: number; lineEnd: number }) => void;
  onJumpComment?: (commentId: string) => void;
  decisions?: ReadonlyMap<string, FindingDecision>;
  canDecide?: boolean;
  onDecide?: FindingDecisionControlsProps['onDecide'];
  decidingFindingId?: string | undefined;
  findingDecisionError?: FindingDecisionError | null;
  /** Decisions applied to the selected findings in one request. */
  onDecideSelected?:
    ((state: FindingDecisionState, findingIds: string[]) => Promise<boolean>) | undefined;
  bulkPending?: boolean;
  bulkError?: string | null;
  /** True while this report is a merge of shards that have already finished. */
  partial?: boolean;
  /** Shard completion progress for a partial report. */
  liveProgress?: { completedShards: number; totalShards: number };
  /** The reviewer is still active, so the partial report is live. */
  live?: boolean;
  /** The reviewer is active but no shard has reported yet. */
  pending?: boolean;
  comments?: readonly Comment[];
  /** Findings whose accepted comment already exists outside this report. */
  transferredFindingIds?: ReadonlySet<string>;
  onOpenConversation?: (() => void) | undefined;
  round?: number;
  readOnly?: boolean;
  activeCommentId?: string | undefined;
  pendingCommentId?: string | undefined;
  onReply?: ((comment: Comment, body: string) => Promise<void>) | undefined;
  onCommentState?: ((comment: Comment, state: CommentState) => Promise<void>) | undefined;
  onCommentEdit?: ((comment: Comment, body: string) => Promise<void>) | undefined;
  onCommentDelete?: ((comment: Comment) => Promise<void>) | undefined;
  onCommentJump?: ((comment: Comment) => void) | undefined;
  onCommentFocus?: ((comment: Comment) => void) | undefined;
  onAddComment?: ((target: ReportCommentTarget, body: string) => Promise<void>) | undefined;
}

const EMPTY_DECISIONS = new Map<string, FindingDecision>();
const EMPTY_TRANSFERRED = new Set<string>();
const PAGE_SIZE = 50;

type ReportSection = 'issues' | 'questions';

type PaginationKind = 'report' | 'question';

interface PaginationProps {
  kind: PaginationKind;
  placement: 'top' | 'bottom';
  page: number;
  pageCount: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  onPageChange: (page: number) => void;
}

function PaginationBar({
  kind,
  placement,
  page,
  pageCount,
  pageStart,
  pageEnd,
  total,
  onPageChange,
}: PaginationProps): JSX.Element {
  const title = kind === 'report' ? 'Report' : 'Question';
  return (
    <nav className="cr-report-pagination" aria-label={`${title} pages (${placement})`}>
      <span className="cr-meta">
        {pageStart + 1}–{pageEnd} of {total}
      </span>
      <div className="cr-report-pagination-actions">
        <Button
          size="small"
          variant="secondary"
          aria-label={`Previous ${kind} page (${placement})`}
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="cr-meta">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          size="small"
          variant="secondary"
          aria-label={`Next ${kind} page (${placement})`}
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

export function ReportPanel({
  report,
  onJump,
  onJumpComment,
  decisions = EMPTY_DECISIONS,
  canDecide = false,
  onDecide,
  decidingFindingId,
  findingDecisionError,
  onDecideSelected,
  bulkPending = false,
  bulkError,
  partial = false,
  liveProgress,
  live = true,
  pending = false,
  comments = [],
  transferredFindingIds = EMPTY_TRANSFERRED,
  onOpenConversation,
  round,
  readOnly = false,
  activeCommentId,
  pendingCommentId,
  onReply,
  onCommentState,
  onCommentEdit,
  onCommentDelete,
  onCommentJump,
  onCommentFocus,
  onAddComment,
}: ReportPanelProps): JSX.Element {
  const [severity, setSeverity] = useState<Finding['severity'] | 'all'>('all');
  const [category, setCategory] = useState<Finding['category'] | 'all'>('all');
  const [page, setPage] = useState(0);
  const [questionPage, setQuestionPage] = useState(0);
  const [section, setSection] = useState<ReportSection>('issues');
  const [expandedFindings, setExpandedFindings] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkState, setBulkState] = useState<FindingDecisionState | null>(null);
  const [bulkFindingIds, setBulkFindingIds] = useState<readonly string[]>([]);
  const [bulkRound, setBulkRound] = useState<number | null>(null);
  const [bulkAttempted, setBulkAttempted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const questionListRef = useRef<HTMLDivElement>(null);
  const activeFindings =
    report === null || report === undefined
      ? []
      : report.findings.filter((finding) => !transferredFindingIds.has(finding.id));
  const transferredCount =
    report === null || report === undefined ? 0 : report.findings.length - activeFindings.length;
  const findings =
    report === null || report === undefined
      ? []
      : filterFindings(activeFindings, severity, category);
  const questions = report === null || report === undefined ? [] : report.questions;
  const decidableFindings = activeFindings.filter(
    (finding) => finding.kind !== 'praise' && !decisions.has(finding.id),
  );
  const selectedFindings = decidableFindings.filter((finding) => selectedIds.has(finding.id));
  const selectedCount = selectedFindings.length;
  const filteredDecidable = findings.filter(
    (finding) => finding.kind !== 'praise' && !decisions.has(finding.id),
  );
  const allFilteredSelected =
    filteredDecidable.length > 0 &&
    filteredDecidable.every((finding) => selectedIds.has(finding.id));
  const someFilteredSelected = filteredDecidable.some((finding) => selectedIds.has(finding.id));
  const showSelection = !partial && !readOnly && canDecide && onDecideSelected !== undefined;
  const dialogRound = round ?? report?.round ?? 1;

  useEffect(() => {
    if (bulkState === null || bulkPending) return;
    // A round switch or a report losing eligibility makes the confirmation stale.
    if (bulkRound !== dialogRound || !showSelection || bulkFindingIds.length === 0) {
      setBulkState(null);
      setBulkFindingIds([]);
      setBulkRound(null);
      setBulkAttempted(false);
    }
  }, [bulkFindingIds, bulkPending, bulkRound, bulkState, dialogRound, showSelection]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [severity, category, report?.reviewId, report?.round, partial, canDecide, readOnly]);
  const pageCount = Math.max(1, Math.ceil(findings.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, findings.length);
  const visibleFindings = findings.slice(pageStart, pageStart + PAGE_SIZE);
  const questionPageCount = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
  const currentQuestionPage = Math.min(questionPage, questionPageCount - 1);
  const questionPageStart = currentQuestionPage * PAGE_SIZE;
  const questionPageEnd = Math.min(questionPageStart + PAGE_SIZE, questions.length);
  const visibleQuestions = questions.slice(questionPageStart, questionPageStart + PAGE_SIZE);

  function toggleFinding(findingId: string): void {
    setExpandedFindings((current) => {
      const next = new Set(current);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  }

  function toggleSelection(findingId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  }

  function toggleAllFiltered(): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const finding of filteredDecidable) next.delete(finding.id);
      } else {
        for (const finding of filteredDecidable) next.add(finding.id);
      }
      return next;
    });
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
  }

  useEffect(() => {
    setPage(0);
    if (listRef.current !== null) listRef.current.scrollTop = 0;
  }, [severity, category, report?.reviewId, report?.round, partial]);

  useEffect(() => {
    setPage((value) => Math.min(value, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    setQuestionPage(0);
    if (questionListRef.current !== null) questionListRef.current.scrollTop = 0;
  }, [report?.reviewId, report?.round, partial]);

  useEffect(() => {
    setQuestionPage((value) => Math.min(value, questionPageCount - 1));
  }, [questionPageCount]);

  const previousPage = useRef(currentPage);
  useEffect(() => {
    if (previousPage.current === currentPage) return;
    previousPage.current = currentPage;
    if (listRef.current !== null) listRef.current.scrollTop = 0;
  }, [currentPage]);

  const previousQuestionPage = useRef(currentQuestionPage);
  useEffect(() => {
    if (previousQuestionPage.current === currentQuestionPage) return;
    previousQuestionPage.current = currentQuestionPage;
    if (questionListRef.current !== null) questionListRef.current.scrollTop = 0;
  }, [currentQuestionPage]);

  if (report === null || report === undefined) {
    return pending ? (
      <EmptyState
        title="Waiting for the first shard report"
        description="Findings appear here as soon as a shard finishes. The final report follows when the reviewer completes."
      />
    ) : (
      <EmptyState
        title="No reviewer report"
        description="The reviewer has not produced a report for this review. Findings appear here when the agent finishes."
      />
    );
  }

  const counts = findingCounts({ ...report, findings: activeFindings });
  const filtered = severity !== 'all' || category !== 'all';
  const reportRound = round ?? report.round;

  function commentsFor(file: string, line: number): readonly Comment[] {
    return commentsAtLine(comments, reportRound, file, line, 'new');
  }

  function openBulkDialog(state: FindingDecisionState): void {
    setBulkAttempted(false);
    setBulkFindingIds(selectedFindings.map((finding) => finding.id));
    setBulkRound(dialogRound);
    setBulkState(state);
  }

  function closeBulkDialog(): void {
    if (!bulkPending) {
      setBulkState(null);
      setBulkFindingIds([]);
      setBulkRound(null);
      setBulkAttempted(false);
    }
  }

  async function submitBulkDecision(): Promise<void> {
    if (bulkState === null || onDecideSelected === undefined) return;
    setBulkAttempted(true);
    if (await onDecideSelected(bulkState, [...bulkFindingIds])) {
      setBulkState(null);
      setBulkFindingIds([]);
      setSelectedIds(new Set());
    }
  }

  const bulkAction = bulkState === 'accepted' ? 'Accept' : 'Dismiss';
  const bulkCount = bulkFindingIds.length;
  const bulkFindingNoun = bulkCount === 1 ? 'finding' : 'findings';
  const bulkTitle = `${bulkAction} ${bulkCount} selected ${bulkFindingNoun}?`;

  return (
    <div className="cr-report">
      {partial && liveProgress !== undefined ? (
        <p className="cr-notice cr-notice-info" role="status">
          <strong>{live ? 'Live partial report' : 'Partial report'}</strong> ·{' '}
          {liveProgress.completedShards} of {liveProgress.totalShards} shards reported. Findings are
          provisional; decisions unlock with the final report.
        </p>
      ) : null}
      <section className="cr-report-summary" aria-label="Reviewer summary">
        <div className="cr-report-summary-head">
          <h2 className="cr-card-title">Reviewer summary</h2>
          <Badge tone={riskTone(report.riskLevel)}>{report.riskLevel} risk</Badge>
          {partial ? <Badge tone="info">partial</Badge> : null}
          {report.skipped === true ? <Badge tone="neutral">skipped</Badge> : null}
        </div>
        <p className="cr-report-copy" tabIndex={0}>
          {report.summary}
        </p>
        {transferredCount > 0 ? (
          <p className="cr-report-transferred" role="status">
            <Badge tone="info">{transferredCount} accepted</Badge>{' '}
            <span className="cr-meta">moved to comments</span>
            {onOpenConversation !== undefined ? (
              <button type="button" className="cr-link-button" onClick={onOpenConversation}>
                Open Conversation
              </button>
            ) : null}
          </p>
        ) : null}
        <div className="cr-report-counts">
          {counts.blocker > 0 ? <Badge tone="danger">{counts.blocker} blocker</Badge> : null}
          {counts.major > 0 ? <Badge tone="warning">{counts.major} major</Badge> : null}
          {counts.minor > 0 ? <Badge tone="info">{counts.minor} minor</Badge> : null}
          {counts.nit > 0 ? <Badge tone="neutral">{counts.nit} nit</Badge> : null}
          {report.tests.ran ? (
            <Badge
              tone={
                report.tests.commands.some((item) => item.result === 'fail') ? 'danger' : 'success'
              }
            >
              tests ran
            </Badge>
          ) : (
            <Badge tone="neutral">tests not run</Badge>
          )}
        </div>
        {report.dirtyWorktree === true ? (
          <p className="cr-notice cr-notice-warning">
            The reviewer changed the worktree during the run. Inspect it before merging.
          </p>
        ) : null}
        {report.warnings.length > 0 ? (
          <ul className="cr-report-warnings" aria-label="Reviewer warnings">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="cr-report-browser" aria-label="Report findings and questions">
        <Tabs
          items={[
            {
              id: 'issues',
              label: (
                <>
                  Issues
                  <span className="cr-tab-count">{activeFindings.length}</span>
                </>
              ),
              content: (
                <div className="cr-report-issues">
                  <div className="cr-report-toolbar">
                    <Select
                      label="Severity"
                      options={SEVERITIES.map((value) => ({
                        value,
                        label: value === 'all' ? 'All severities' : value,
                      }))}
                      value={severity}
                      onChange={(event) =>
                        setSeverity(event.target.value as Finding['severity'] | 'all')
                      }
                    />
                    <Select
                      label="Category"
                      options={CATEGORIES.map((value) => ({
                        value,
                        label: value === 'all' ? 'All categories' : value,
                      }))}
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value as Finding['category'] | 'all')
                      }
                    />
                    <span className="cr-meta" aria-live="polite">
                      {findings.length} of {activeFindings.length} findings
                    </span>
                    {filtered ? (
                      <button
                        type="button"
                        className="cr-link-button"
                        onClick={() => {
                          setSeverity('all');
                          setCategory('all');
                        }}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>

                  {showSelection && filteredDecidable.length > 0 ? (
                    <div
                      className="cr-report-selection"
                      role="group"
                      aria-label="Finding selection"
                    >
                      <label className="cr-check cr-report-select-all">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          disabled={bulkPending}
                          ref={(input) => {
                            if (input !== null) {
                              input.indeterminate = someFilteredSelected && !allFilteredSelected;
                            }
                          }}
                          onChange={toggleAllFiltered}
                        />
                        <span>Select all filtered ({filteredDecidable.length})</span>
                      </label>
                      {selectedCount > 0 ? (
                        <>
                          <span className="cr-meta" aria-live="polite">
                            {selectedCount} selected
                          </span>
                          <button
                            type="button"
                            className="cr-link-button"
                            disabled={bulkPending}
                            onClick={clearSelection}
                          >
                            Clear selection
                          </button>
                          <div
                            className="cr-report-bulk-actions"
                            role="group"
                            aria-label="Selected finding decisions"
                          >
                            <Button
                              size="small"
                              variant="secondary"
                              disabled={bulkPending}
                              onClick={() => openBulkDialog('accepted')}
                            >
                              Accept selected ({selectedCount})
                            </Button>
                            <Button
                              size="small"
                              variant="secondary"
                              disabled={bulkPending}
                              onClick={() => openBulkDialog('dismissed')}
                            >
                              Dismiss selected ({selectedCount})
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {findings.length === 0 ? (
                    <EmptyState
                      title={
                        filtered
                          ? 'No findings match these filters'
                          : activeFindings.length === 0 && transferredCount > 0
                            ? 'All findings accepted'
                            : 'No findings'
                      }
                      description={
                        activeFindings.length === 0 && transferredCount > 0
                          ? 'Accepted findings are available in Conversation.'
                          : filtered
                            ? 'Clear the severity or category filter to see the reviewer report.'
                            : 'The reviewer did not report any issues for this round.'
                      }
                    />
                  ) : (
                    <>
                      {findings.length > PAGE_SIZE ? (
                        <PaginationBar
                          kind="report"
                          placement="top"
                          page={currentPage}
                          pageCount={pageCount}
                          pageStart={pageStart}
                          pageEnd={pageEnd}
                          total={findings.length}
                          onPageChange={setPage}
                        />
                      ) : null}
                      <div className="cr-report-scroll" ref={listRef}>
                        <ol className="cr-findings" aria-label="Reviewer findings">
                          {visibleFindings.map((finding) => {
                            const expanded = expandedFindings.has(finding.id);
                            const decision = decisions.get(finding.id);
                            const selected = selectedIds.has(finding.id);
                            const bodyId = `report-finding-body-${finding.id}`;
                            return (
                              <li
                                className="cr-finding-item"
                                key={finding.id}
                                id={`finding-${finding.id}`}
                                tabIndex={-1}
                              >
                                <div
                                  className={`cr-finding${
                                    expanded ? ' cr-finding-expanded' : ' cr-finding-collapsed'
                                  }${selected ? ' cr-finding-selected' : ''}`}
                                >
                                  <div
                                    className="cr-finding-head"
                                    onClick={() => toggleFinding(finding.id)}
                                  >
                                    <button
                                      type="button"
                                      className="cr-finding-toggle"
                                      aria-expanded={expanded}
                                      aria-controls={expanded ? bodyId : undefined}
                                      aria-label={`${
                                        expanded ? 'Collapse' : 'Expand'
                                      } finding ${finding.title}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleFinding(finding.id);
                                      }}
                                    >
                                      <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                                    </button>
                                    {showSelection &&
                                    finding.kind !== 'praise' &&
                                    decision === undefined ? (
                                      <input
                                        type="checkbox"
                                        className="cr-finding-select"
                                        checked={selected}
                                        disabled={bulkPending}
                                        aria-label={`Select finding ${finding.title}`}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={() => toggleSelection(finding.id)}
                                      />
                                    ) : null}
                                    <Badge tone={severityTone(finding.severity)}>
                                      {finding.severity}
                                    </Badge>
                                    <Badge tone="neutral">{finding.category}</Badge>
                                    {finding.kind !== 'issue' ? (
                                      <Badge tone="info">{finding.kind}</Badge>
                                    ) : null}
                                    {decision !== undefined ? (
                                      <Badge
                                        tone={decision.state === 'accepted' ? 'success' : 'neutral'}
                                      >
                                        {decision.state === 'accepted' ? 'Accepted' : 'Dismissed'}
                                      </Badge>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="cr-finding-location"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onJump(finding);
                                      }}
                                      aria-label={`Jump to ${finding.file} line ${finding.lineStart}`}
                                    >
                                      {finding.file}:{finding.lineStart}
                                    </button>
                                    <span className="cr-meta">{finding.confidence} confidence</span>
                                  </div>
                                  <h3 className="cr-finding-title">{finding.title}</h3>
                                  {expanded ? (
                                    <div className="cr-finding-body" id={bodyId}>
                                      <p className="cr-finding-copy">{finding.rationale}</p>
                                      {finding.evidence !== '' ? (
                                        <pre className="cr-evidence" aria-label="Evidence">
                                          {finding.evidence}
                                        </pre>
                                      ) : null}
                                      {finding.suggestion !== undefined ? (
                                        <div
                                          className="cr-suggestion"
                                          aria-label="Finding suggestion"
                                        >
                                          <div className="cr-suggestion-head">
                                            <span className="cr-suggestion-label">
                                              Suggested change
                                            </span>
                                            {finding.unanchored === true ? (
                                              <Badge tone="warning">unanchored</Badge>
                                            ) : null}
                                          </div>
                                          <div className="cr-suggestion-block cr-suggestion-old">
                                            <span className="cr-suggestion-caption">Before</span>
                                            <pre>{finding.suggestion.original}</pre>
                                          </div>
                                          <div className="cr-suggestion-block cr-suggestion-new">
                                            <span className="cr-suggestion-caption">After</span>
                                            <pre>{finding.suggestion.replacement}</pre>
                                          </div>
                                        </div>
                                      ) : null}
                                      <FindingDecisionControls
                                        finding={finding}
                                        decision={decision}
                                        showStatus={false}
                                        readOnly={!canDecide || onDecide === undefined}
                                        pending={decidingFindingId === finding.id}
                                        error={
                                          findingDecisionError?.findingId === finding.id
                                            ? findingDecisionError.message
                                            : null
                                        }
                                        onDecide={onDecide ?? (async () => false)}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                                {expanded ? (
                                  <ThreadConversation
                                    comments={commentsFor(finding.file, finding.lineStart)}
                                    action="comment"
                                    readOnly={readOnly}
                                    activeCommentId={activeCommentId}
                                    pendingCommentId={pendingCommentId}
                                    onReply={onReply}
                                    onState={onCommentState}
                                    onEdit={onCommentEdit}
                                    onDelete={onCommentDelete}
                                    onJump={onCommentJump}
                                    onFocus={onCommentFocus}
                                    {...(onAddComment === undefined || finding.unanchored === true
                                      ? {}
                                      : {
                                          onAdd: (body: string) =>
                                            onAddComment(
                                              {
                                                file: finding.file,
                                                lineStart: finding.lineStart,
                                                lineEnd: finding.lineEnd,
                                              },
                                              body,
                                            ),
                                        })}
                                  />
                                ) : null}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                      {findings.length > PAGE_SIZE ? (
                        <PaginationBar
                          kind="report"
                          placement="bottom"
                          page={currentPage}
                          pageCount={pageCount}
                          pageStart={pageStart}
                          pageEnd={pageEnd}
                          total={findings.length}
                          onPageChange={setPage}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              ),
            },
            {
              id: 'questions',
              label: (
                <>
                  Questions
                  <span className="cr-tab-count">{report.questions.length}</span>
                </>
              ),
              content: (
                <div className="cr-report-questions">
                  {questions.length === 0 ? (
                    <EmptyState
                      title="No open questions"
                      description="The reviewer did not ask any questions for this round."
                    />
                  ) : (
                    <>
                      {questions.length > PAGE_SIZE ? (
                        <PaginationBar
                          kind="question"
                          placement="top"
                          page={currentQuestionPage}
                          pageCount={questionPageCount}
                          pageStart={questionPageStart}
                          pageEnd={questionPageEnd}
                          total={questions.length}
                          onPageChange={setQuestionPage}
                        />
                      ) : null}
                      <div className="cr-report-scroll" ref={questionListRef}>
                        <ul className="cr-question-list" aria-label="Open questions">
                          {visibleQuestions.map((question) => (
                            <li key={question.id}>
                              <button
                                type="button"
                                className="cr-link-button"
                                onClick={() =>
                                  onJump({
                                    file: question.file,
                                    lineStart: question.line,
                                    lineEnd: question.line,
                                  })
                                }
                              >
                                {question.file}:{question.line}
                              </button>
                              <strong>{question.question}</strong>
                              <p className="cr-meta">{question.why}</p>
                              <ThreadConversation
                                comments={commentsFor(question.file, question.line)}
                                action="answer"
                                readOnly={readOnly}
                                activeCommentId={activeCommentId}
                                pendingCommentId={pendingCommentId}
                                onReply={onReply}
                                onState={onCommentState}
                                onEdit={onCommentEdit}
                                onDelete={onCommentDelete}
                                onJump={onCommentJump}
                                onFocus={onCommentFocus}
                                {...(onAddComment === undefined
                                  ? {}
                                  : {
                                      onAdd: (body: string) =>
                                        onAddComment(
                                          {
                                            file: question.file,
                                            lineStart: question.line,
                                            lineEnd: question.line,
                                          },
                                          body,
                                        ),
                                    })}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                      {questions.length > PAGE_SIZE ? (
                        <PaginationBar
                          kind="question"
                          placement="bottom"
                          page={currentQuestionPage}
                          pageCount={questionPageCount}
                          pageStart={questionPageStart}
                          pageEnd={questionPageEnd}
                          total={questions.length}
                          onPageChange={setQuestionPage}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              ),
            },
          ]}
          value={section}
          onChange={(id) => setSection(id as ReportSection)}
          label="Report sections"
          className="cr-report-tabs"
        />
      </section>

      {report.verification.length > 0 ? (
        <section className="cr-report-section" aria-label="Reviewer verification">
          <h2 className="cr-card-title">Verification</h2>
          <ul className="cr-verification-list">
            {report.verification.map((item) => (
              <li key={item.commentId}>
                <Badge
                  tone={
                    item.status === 'fixed'
                      ? 'success'
                      : item.status === 'not-fixed'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {item.status}
                </Badge>
                {onJumpComment !== undefined ? (
                  <button
                    type="button"
                    className="cr-link-button"
                    onClick={() => onJumpComment(item.commentId)}
                  >
                    {item.commentId}
                  </button>
                ) : (
                  <span className="cr-mono">{item.commentId}</span>
                )}
                <span className="cr-meta">{item.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.tests.commands.length > 0 ? (
        <section className="cr-report-section" aria-label="Reviewer test commands">
          <h2 className="cr-card-title">Tests</h2>
          <ul className="cr-test-list">
            {report.tests.commands.map((command) => (
              <li key={command.command}>
                <Badge
                  tone={
                    command.result === 'pass'
                      ? 'success'
                      : command.result === 'fail'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {command.result}
                </Badge>
                <span className="cr-mono">{command.command}</span>
                <span className="cr-meta">{command.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog
        open={bulkState !== null}
        title={bulkTitle}
        description={`This will ${bulkAction.toLowerCase()} ${bulkCount} selected ${bulkFindingNoun} in the current report. Existing decisions and notes stay unchanged.`}
        closeDisabled={bulkPending}
        onClose={closeBulkDialog}
        actions={
          <>
            <Button
              size="small"
              variant="secondary"
              disabled={bulkPending}
              onClick={closeBulkDialog}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant={bulkState === 'accepted' ? 'primary' : 'danger'}
              loading={bulkPending}
              onClick={() => void submitBulkDecision()}
            >
              {bulkAction} {bulkCount} {bulkFindingNoun}
            </Button>
          </>
        }
      >
        {bulkAttempted && bulkError !== null && bulkError !== undefined ? (
          <p className="cr-error" role="alert">
            {bulkError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
