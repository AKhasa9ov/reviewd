import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Comment,
  CommentState,
  FileDiff,
  ReviewView,
  Side,
  Snapshot,
  SubmitInput,
} from '@dsh-code-review/core';
import { ApiError } from '../api/client.js';
import type { ApiClient } from '../api/client.js';
import type { LatestFeedbackView, SubmissionDelivery } from '../api/types.js';
import { Badge, EmptyState, Skeleton } from '../primitives/Feedback.js';
import { Button } from '../primitives/Button.js';
import { Dialog } from '../primitives/Dialog.js';
import { useToast } from '../primitives/Toast.js';
import { formatAge, shortSha } from '../format.js';
import { ArrowLeftIcon, GitBranchIcon } from '../icons.js';
import { CommentComposer } from './CommentComposer.js';
import { CommentThread } from './CommentThread.js';
import { DiffViewer } from './DiffViewer.js';
import { FixStatusBoard } from './FixStatusBoard.js';
import { ReportPanel } from './ReportPanel.js';
import { SignalsPanel } from './SignalsPanel.js';
import { SubmitDialog } from './SubmitDialog.js';
import {
  anchorForRound,
  buildReviewLocation,
  deltaPaths,
  deriveSignals,
  diffFileId,
  diffLineId,
  fileLineCount,
  filterComments,
  firstChangedLine,
  fixCounts,
  latestAnchor,
  latestVerdict,
  parseReviewLocation,
  parseTab,
  roundCommentCount,
  unresolvedComments,
  type CommentDraft,
  type FixFilter,
  type ReviewTab,
} from './model.js';

export interface ReviewDetailProps {
  client: ApiClient;
  id: string;
  location?: string;
  navigate?: (to: string, options?: { replace?: boolean }) => void;
}

type ComposerState = {
  path: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
};

type SelectionState = {
  path: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
};

type ActionError = {
  title: string;
  message: string;
  code?: string;
  retry?: 'refresh';
};

const TABS: Array<{ id: ReviewTab; label: string }> = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'files', label: 'Files changed' },
  { id: 'report', label: 'Report' },
  { id: 'signals', label: 'Signals' },
];

const SHORTCUTS = [
  ['c', 'Comment on the selected line'],
  ['r', 'Resolve the selected comment'],
  ['j / k', 'Next / previous file'],
  ['[ / ]', 'Previous / next round'],
  ['?', 'Show this help'],
  ['g l', 'Go to the review list'],
  ['Esc', 'Close the composer or dialog'],
];

function useLiveLocation(provided?: string): string {
  const [live, setLive] = useState(() =>
    typeof window === 'undefined'
      ? '/'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  useEffect(() => {
    if (provided !== undefined) return;
    const update = (): void =>
      setLive(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, [provided]);
  return provided ?? live;
}

function actionErrorFor(error: unknown): ActionError {
  if (error instanceof ApiError) {
    if (error.code === 'stale-review') {
      return {
        title: 'The branch moved',
        message: 'The snapshot is stale. Create a new round to review the latest commits.',
        code: error.code,
        retry: 'refresh',
      };
    }
    if (error.code === 'agent-busy') {
      return {
        title: 'Reviewer is running',
        message: 'Wait for the current reviewer run to finish before changing the review.',
        code: error.code,
      };
    }
    if (error.code === 'conflict') {
      return {
        title: 'Apply conflict',
        message:
          error.message.includes('suggest') || error.message.includes('apply')
            ? 'The suggestion no longer matches the file. Send the thread to the agent instead of applying it automatically.'
            : 'This change conflicts with another update. Reload and try again.',
        code: error.code,
      };
    }
    return { title: 'Request failed', message: error.message, code: error.code };
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : 'Unexpected error.',
  };
}

export function ReviewDetail({ client, id, location, navigate }: ReviewDetailProps): JSX.Element {
  const { toast } = useToast();
  const liveLocation = useLiveLocation(location);
  const deep = useMemo(() => parseReviewLocation(liveLocation), [liveLocation]);
  const [view, setView] = useState<ReviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [round, setRound] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<Snapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [tab, setTab] = useState<ReviewTab>(() =>
    parseTab(new URL(liveLocation, 'http://local').searchParams.get('tab')),
  );
  const [delta, setDelta] = useState(false);
  const [fixFilter, setFixFilter] = useState<FixFilter>('all');
  const [activeFile, setActiveFile] = useState<string | undefined>(deep.file);
  const [activeLine, setActiveLine] = useState<number | undefined>(deep.line);
  const [activeCommentId, setActiveCommentId] = useState<string | undefined>();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pendingCommentId, setPendingCommentId] = useState<string | undefined>();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<LatestFeedbackView | null>(null);
  const [delivery, setDelivery] = useState<SubmissionDelivery | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [scrollRestore, setScrollRestore] = useState<number | null>(null);
  const pendingJump = useRef<{ path: string; line?: number } | null>(null);
  const goRef = useRef(0);

  const go = useCallback(
    (to: string, options: { replace?: boolean } = {}) => {
      if (navigate !== undefined) {
        navigate(to, options);
        return;
      }
      if (typeof window === 'undefined') return;
      if (options.replace === true) window.history.replaceState({}, '', to);
      else window.history.pushState({}, '', to);
      window.dispatchEvent(new Event('popstate'));
    },
    [navigate],
  );

  const reloadReview = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setReviewError(null);
    setNotFound(false);
    client
      .getReview(id)
      .then((next) => {
        if (controller.signal.aborted) return;
        setView(next);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        if (error instanceof ApiError && error.code === 'not-found') {
          setNotFound(true);
          return;
        }
        setReviewError(error instanceof Error ? error.message : 'Failed to load the review.');
      });
    return () => controller.abort();
  }, [client, id, reloadKey]);

  useEffect(() => {
    if (view === null) return;
    const latest = view.review.rounds.at(-1)?.no ?? null;
    const requested = deep.round;
    setRound((current) => {
      if (current !== null && view.review.rounds.some((item) => item.no === current)) {
        if (
          requested !== undefined &&
          requested !== current &&
          view.review.rounds.some((item) => item.no === requested)
        ) {
          return requested;
        }
        return current;
      }
      if (requested !== undefined && view.review.rounds.some((item) => item.no === requested)) {
        return requested;
      }
      return latest;
    });
  }, [view, deep.round]);

  useEffect(() => {
    setTab(parseTab(new URL(liveLocation, 'http://local').searchParams.get('tab')));
  }, [liveLocation]);

  useEffect(() => {
    if (view === null) return;
    let alive = true;
    client
      .latestFeedback(id)
      .then((next) => {
        if (alive) setFeedback(next);
      })
      .catch(() => {
        if (alive) setFeedback(null);
      });
    return () => {
      alive = false;
    };
  }, [client, id, reloadKey, view]);

  useEffect(() => {
    if (view === null || round === null) {
      setSnapshot(null);
      setPreviousSnapshot(null);
      return;
    }
    const controller = new AbortController();
    setSnapshotLoading(true);
    setSnapshotError(null);
    const current = client.getSnapshot(id, round);
    const previous =
      round > 1 ? client.getSnapshot(id, round - 1).catch(() => null) : Promise.resolve(null);
    Promise.all([current, previous])
      .then(([next, prev]) => {
        if (controller.signal.aborted) return;
        setSnapshot(next.snapshot);
        setPreviousSnapshot(prev?.snapshot ?? null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshotError(error instanceof Error ? error.message : 'Failed to load the snapshot.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSnapshotLoading(false);
      });
    return () => controller.abort();
  }, [client, id, round]);

  useEffect(() => {
    if (round === null) return;
    setDelta(round > 1);
  }, [round]);

  useEffect(() => {
    if (snapshot === null) return;
    const target =
      pendingJump.current ??
      (deep.file !== undefined ? { path: deep.file, line: deep.line } : null);
    if (target === null) {
      if (scrollRestore !== null) {
        const value = scrollRestore;
        setScrollRestore(null);
        requestAnimationFrame(() => window.scrollTo(0, value));
      }
      return;
    }
    if (!snapshot.files.some((file) => file.path === target.path)) {
      pendingJump.current = null;
      return;
    }
    const file = target.path;
    const line = target.line;
    const timer = window.setTimeout(() => {
      const fileNode = document.getElementById(diffFileId(file));
      if (typeof fileNode?.scrollIntoView === 'function')
        fileNode.scrollIntoView({ block: 'start' });
      if (line !== undefined) {
        const row =
          document.getElementById(diffLineId(file, 'new', line)) ??
          document.getElementById(diffLineId(file, 'old', line));
        if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
        row?.focus({ preventScroll: true });
      }
      pendingJump.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [snapshot, deep.file, deep.line, scrollRestore, tab]);

  useEffect(() => {
    setActiveFile(deep.file);
    setActiveLine(deep.line);
    if (deep.file !== undefined) setTab('files');
  }, [deep.file, deep.line]);

  const selectedRound = round;
  const canDelta = selectedRound !== null && selectedRound > 1 && previousSnapshot !== null;
  const changed = useMemo(
    () => (snapshot === null ? new Set<string>() : deltaPaths(snapshot, previousSnapshot)),
    [snapshot, previousSnapshot],
  );
  const effectiveDelta = delta && canDelta && (deep.file === undefined || changed.has(deep.file));

  useEffect(() => {
    if (!delta || deep.file === undefined) return;
    if (!changed.has(deep.file)) setDelta(false);
  }, [changed, deep.file, delta]);
  const counts = useMemo(
    () =>
      view === null
        ? { addressed: 0, 'not-fixed': 0, outdated: 0, 'needs-decision': 0 }
        : fixCounts(view.review),
    [view],
  );
  const filteredComments = useMemo(
    () => (view === null ? [] : filterComments(view.review, fixFilter)),
    [view, fixFilter],
  );
  const signals = useMemo(() => (snapshot === null ? [] : deriveSignals(snapshot)), [snapshot]);
  const report = view?.report ?? null;
  const readOnly = view?.review.status === 'closed';
  const agentRunning = view?.review.agent?.status === 'running';
  const scope = snapshot?.scope;

  const roundLabel = selectedRound === null ? 'No rounds' : `r${selectedRound}`;

  function changeRound(next: number): void {
    if (next === selectedRound) return;
    setScrollRestore(window.scrollY);
    setRound(next);
    go(buildReviewLocation(id, { ...deep, round: next }, { tab }), { replace: false });
  }

  function jumpTo(path: string, line?: number, side: Side = 'new'): void {
    if (delta && canDelta && !changed.has(path)) setDelta(false);
    setTab('files');
    setActiveFile(path);
    setActiveLine(line);
    pendingJump.current = { path, ...(line === undefined ? {} : { line }) };
    go(
      buildReviewLocation(
        id,
        {
          ...deep,
          round: selectedRound ?? undefined,
          file: path,
          ...(line === undefined ? {} : { line }),
        },
        { tab: 'files' },
      ),
    );
    const file = snapshot?.files.find((item) => item.path === path);
    if (file !== undefined) {
      const fileNode = document.getElementById(diffFileId(path));
      if (typeof fileNode?.scrollIntoView === 'function')
        fileNode.scrollIntoView({ block: 'start' });
      if (line !== undefined) {
        const row = document.getElementById(diffLineId(path, side, line));
        if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
        row?.focus({ preventScroll: true });
      }
    }
  }

  function onSelectLine(file: FileDiff, side: Side, line: number, shift: boolean): void {
    setActiveFile(file.path);
    setActiveLine(line);
    setSelection((current) => {
      if (shift && current !== null && current.path === file.path && current.side === side) {
        return {
          ...current,
          lineStart: Math.min(current.lineStart, line),
          lineEnd: Math.max(current.lineEnd, line),
        };
      }
      return { path: file.path, side, lineStart: line, lineEnd: line };
    });
    go(
      buildReviewLocation(
        id,
        { ...deep, round: selectedRound ?? undefined, file: file.path, line },
        { tab: 'files' },
      ),
      { replace: true },
    );
  }

  function openComposer(file: FileDiff, side: Side, lineStart: number, lineEnd = lineStart): void {
    setTab('files');
    setComposer({ path: file.path, side, lineStart, lineEnd });
    setSelection({ path: file.path, side, lineStart, lineEnd });
    setCommentError(null);
    setActiveFile(file.path);
    setActiveLine(lineStart);
  }

  function openComposerAtSelection(): void {
    if (snapshot === null) return;
    if (selection !== null) {
      const file = snapshot.files.find((item) => item.path === selection.path);
      if (file !== undefined) {
        openComposer(file, selection.side, selection.lineStart, selection.lineEnd);
        return;
      }
    }
    if (activeFile !== undefined) {
      const file = snapshot.files.find((item) => item.path === activeFile);
      const first = file === undefined ? undefined : firstChangedLine(file);
      if (file !== undefined && first !== null && first !== undefined) {
        openComposer(file, first.side, first.line);
        return;
      }
    }
    const file = snapshot.files[0];
    if (file === undefined) return;
    const first = firstChangedLine(file);
    openComposer(file, first?.side ?? 'new', first?.line ?? 1);
  }

  async function submitComment(file: FileDiff, side: Side, draft: CommentDraft): Promise<void> {
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const result = await client.addComment(id, {
        body: draft.body,
        path: file.path,
        side,
        lineStart: draft.lineStart,
        lineEnd: draft.lineEnd,
        ...(draft.suggestionEnabled
          ? { suggestion: { original: draft.original, replacement: draft.replacement } }
          : {}),
      });
      setComposer(null);
      setSelection(null);
      setPendingCommentId(result.comment.id);
      setActiveCommentId(result.comment.id);
      toast('Comment posted');
      reloadReview();
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Could not post the comment.');
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function reply(comment: Comment, body: string): Promise<void> {
    setPendingCommentId(comment.id);
    try {
      await client.reply(id, comment.id, body);
      toast('Reply sent');
      reloadReview();
    } finally {
      setPendingCommentId(undefined);
    }
  }

  async function setCommentState(comment: Comment, state: CommentState): Promise<void> {
    setPendingCommentId(comment.id);
    try {
      await client.setCommentState(id, comment.id, state);
      toast(
        state === 'resolved'
          ? 'Comment resolved'
          : state === 'dismissed'
            ? 'Comment dismissed'
            : 'Comment reopened',
      );
      reloadReview();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setPendingCommentId(undefined);
    }
  }

  function jumpToComment(comment: Comment): void {
    const anchor = latestAnchor(comment);
    if (anchor === undefined) return;
    setActiveCommentId(comment.id);
    if (anchor.round !== selectedRound) {
      setRound(anchor.round);
      go(
        buildReviewLocation(
          id,
          { round: anchor.round, file: anchor.path, line: anchor.lineStart },
          { tab: 'files' },
        ),
      );
    }
    jumpTo(anchor.path, anchor.lineStart, anchor.side);
    pendingJump.current = { path: anchor.path, line: anchor.lineStart };
  }

  function jumpToLocation(location: { file: string; lineStart: number }): void {
    jumpTo(location.file, location.lineStart);
  }

  async function submitReview(input: SubmitInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await client.submit(id, input);
      setDelivery(result.delivery);
      setSubmitOpen(false);
      setBanner(`Feedback submitted for round ${result.submission.round}. Delivery is pending.`);
      toast('Feedback submitted');
      reloadReview();
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'stale-review' || error.code === 'agent-busy' || error.code === 'conflict')
      ) {
        setSubmitOpen(false);
        setActionError(actionErrorFor(error));
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Could not submit the review.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshReview(): Promise<void> {
    setRefreshing(true);
    setActionError(null);
    try {
      const next = await client.refresh(id);
      setView(next);
      const nextRound = next.review.rounds.at(-1)?.no ?? null;
      if (nextRound !== null) setRound(nextRound);
      const statuses = next.review.comments.map((comment) => {
        const anchor = anchorForRound(comment, nextRound ?? 0);
        return anchor?.state ?? 'active';
      });
      const outdated = statuses.filter((status) => status === 'outdated').length;
      setRefreshOpen(false);
      setBanner(
        `Round ${nextRound ?? '—'} created. ${next.review.comments.length} comments re-anchored${
          outdated > 0 ? `, ${outdated} now outdated` : ''
        }.`,
      );
      toast('New round created');
    } catch (error) {
      setActionError(actionErrorFor(error));
      setRefreshOpen(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function cancelReviewer(): Promise<void> {
    setCancelPending(true);
    try {
      await client.cancelAgent(id);
      toast('Reviewer cancellation requested');
      reloadReview();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setCancelPending(false);
    }
  }

  async function copyText(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`);
    } catch {
      toast(`Could not copy ${label.toLowerCase()}`, 'danger');
    }
  }

  useEffect(() => {
    function eventTargetInField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.documentElement.hasAttribute('data-shortcuts-off')) return;
      if (submitOpen || refreshOpen || helpOpen) return;
      if (event.key === 'Escape') {
        if (composer !== null) {
          event.preventDefault();
          setComposer(null);
          setCommentError(null);
        }
        return;
      }
      if (eventTargetInField(event.target)) return;
      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === 'c') {
        event.preventDefault();
        openComposerAtSelection();
        return;
      }
      if (event.key === 'r' && activeCommentId !== undefined && view !== null) {
        const comment = view.review.comments.find((item) => item.id === activeCommentId);
        if (comment !== undefined && comment.state === 'open') {
          event.preventDefault();
          void setCommentState(comment, 'resolved');
        }
        return;
      }
      if (event.key === '[' || event.key === ']') {
        const rounds = view?.review.rounds ?? [];
        const index = rounds.findIndex((item) => item.no === selectedRound);
        if (index < 0) return;
        const next = event.key === ']' ? rounds[index + 1] : rounds[index - 1];
        if (next !== undefined) {
          event.preventDefault();
          changeRound(next.no);
        }
        return;
      }
      if (event.key === 'j' || event.key === 'k') {
        if (snapshot === null) return;
        const files = effectiveDelta
          ? snapshot.files.filter((file) => changed.has(file.path))
          : snapshot.files;
        if (files.length === 0) return;
        event.preventDefault();
        const index = files.findIndex((file) => file.path === activeFile);
        const nextIndex =
          event.key === 'j'
            ? Math.min(files.length - 1, (index < 0 ? -1 : index) + 1)
            : Math.max(0, (index < 0 ? files.length : index) - 1);
        const file = files[nextIndex];
        if (file !== undefined) {
          const first = firstChangedLine(file);
          jumpTo(file.path, first?.line, first?.side ?? 'new');
        }
        return;
      }
      if (event.key === 'g') {
        goRef.current = Date.now();
        window.setTimeout(() => {
          goRef.current = 0;
        }, 800);
        return;
      }
      if (event.key === 'l' && Date.now() - goRef.current < 800) {
        event.preventDefault();
        go('/');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loading && view === null) {
    return (
      <div className="cr-detail-loading" data-testid="review-detail-loading">
        <Skeleton width="38%" height={28} />
        <div style={{ height: 12 }} />
        <Skeleton width="58%" height={14} />
        <div style={{ height: 24 }} />
        <div className="cr-card">
          <Skeleton width="100%" height={160} />
        </div>
      </div>
    );
  }

  if (notFound || (reviewError !== null && view === null)) {
    return (
      <div className="cr-detail-error">
        <a
          className="cr-back"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            go('/');
          }}
        >
          <ArrowLeftIcon size={16} /> All reviews
        </a>
        <div className="cr-error-panel" role="alert">
          <div>
            <strong>{notFound ? 'Review not found' : 'Could not load the review'}</strong>
            <p>{notFound ? `No review exists for ${id}.` : reviewError}</p>
          </div>
          {!notFound ? (
            <Button variant="secondary" onClick={reloadReview}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (view === null) {
    return <div className="cr-detail-loading" />;
  }

  const review = view.review;
  const selectedTabLabel = TABS.find((item) => item.id === tab)?.label ?? 'Conversation';
  const showSnapshot = snapshotLoading ? (
    <div className="cr-card cr-diff-loading" data-testid="snapshot-loading">
      <Skeleton width="42%" height={14} />
      <div style={{ height: 10 }} />
      <Skeleton width="100%" height={220} />
    </div>
  ) : snapshotError !== null ? (
    <div className="cr-error-panel" role="alert">
      <div>
        <strong>Could not load this round</strong>
        <p>{snapshotError}</p>
      </div>
      <Button variant="secondary" onClick={reloadReview}>
        Retry
      </Button>
    </div>
  ) : snapshot === null ? (
    <EmptyState title="No snapshot" description="This review has no rounds yet." />
  ) : (
    <DiffViewer
      snapshot={snapshot}
      comments={filteredComments}
      round={selectedRound ?? 1}
      delta={effectiveDelta}
      changedPaths={changed}
      activeFile={activeFile}
      activeLine={activeLine}
      activeCommentId={activeCommentId}
      composer={composer}
      onDeltaChange={setDelta}
      onJump={jumpTo}
      onSelectLine={onSelectLine}
      onOpenComposer={openComposer}
      renderComposer={(file, side, lineStart, lineEnd) => {
        const maxLine = fileLineCount(file, side);
        return (
          <CommentComposer
            file={file}
            side={side}
            lineStart={lineStart}
            lineEnd={lineEnd}
            maxLine={maxLine}
            submitting={commentSubmitting}
            serverError={commentError}
            onCancel={() => {
              setComposer(null);
              setCommentError(null);
            }}
            onSubmit={(draft) => void submitComment(file, side, draft)}
          />
        );
      }}
      onReply={reply}
      onCommentState={setCommentState}
      onCommentJump={jumpToComment}
      onCommentFocus={(comment) => setActiveCommentId(comment.id)}
      readOnly={readOnly}
    />
  );

  return (
    <div className="cr-detail" data-testid="review-detail">
      <a
        className="cr-back"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          go('/');
        }}
      >
        <ArrowLeftIcon size={16} /> All reviews
      </a>

      <header className="cr-detail-header">
        <div className="cr-detail-heading">
          <div className="cr-detail-eyebrow">
            <span className="cr-mono">{review.id}</span>
            <span className="cr-eyebrow-dot" aria-hidden="true" />
            <span>opened {formatAge(review.createdAt)}</span>
            {review.createdBy !== undefined ? <span>by {review.createdBy.name}</span> : null}
            <Badge tone={review.status === 'open' ? 'success' : 'neutral'}>{review.status}</Badge>
          </div>
          <h1 className="cr-page-title cr-detail-title">{review.title}</h1>
          <div className="cr-detail-scope">
            <GitBranchIcon size={16} />
            <span className="cr-mono">{scope?.label ?? roundLabel}</span>
            {scope !== undefined ? (
              <>
                <span className="cr-scope-separator" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  className="cr-link-button"
                  aria-label={`Copy base commit ${scope.baseSha}`}
                  onClick={() => void copyText(scope.baseSha, 'Base SHA')}
                >
                  base {shortSha(scope.baseSha)}
                </button>
                <span aria-hidden="true">→</span>
                <button
                  type="button"
                  className="cr-link-button"
                  aria-label={`Copy head commit ${scope.headSha ?? 'worktree'}`}
                  onClick={() => void copyText(scope.headSha ?? 'worktree', 'Head SHA')}
                >
                  head {shortSha(scope.headSha)}
                </button>
              </>
            ) : null}
            {scope?.worktreeDigestTruncated === true ? (
              <Badge tone="warning">digest truncated</Badge>
            ) : null}
          </div>
        </div>

        <div className="cr-detail-actions">
          <div className="cr-round-pills" role="group" aria-label="Review rounds">
            {review.rounds.map((item) => (
              <button
                type="button"
                key={item.no}
                className="cr-round-pill"
                aria-pressed={item.no === selectedRound}
                aria-label={`Round ${item.no}, ${roundCommentCount(review, item.no)} comments`}
                onClick={() => changeRound(item.no)}
              >
                <span>r{item.no}</span>
                <span className="cr-round-count">{roundCommentCount(review, item.no)}</span>
              </button>
            ))}
          </div>
          <Badge
            tone={
              latestVerdict(review) === 'approve'
                ? 'success'
                : latestVerdict(review) === 'request-changes'
                  ? 'danger'
                  : 'info'
            }
          >
            {latestVerdict(review)}
          </Badge>
          <Button
            variant="secondary"
            onClick={() => setRefreshOpen(true)}
            disabled={readOnly || agentRunning}
            title={agentRunning ? 'Wait for the reviewer to finish' : undefined}
          >
            Refresh
          </Button>
          <Button onClick={() => setSubmitOpen(true)} disabled={readOnly}>
            Submit
          </Button>
        </div>
      </header>

      {banner !== null ? (
        <div className="cr-banner" role="status">
          <span>{banner}</span>
          <button type="button" className="cr-link-button" onClick={() => setBanner(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {actionError !== null ? (
        <div className="cr-error-panel" role="alert">
          <div>
            <strong>{actionError.title}</strong>
            <p>{actionError.message}</p>
          </div>
          <div className="cr-inline-actions">
            {actionError.retry === 'refresh' && !readOnly ? (
              <Button variant="secondary" onClick={() => setRefreshOpen(true)}>
                Create a new round
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setActionError(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {review.agent?.status === 'failed' ? (
        <div className="cr-error-panel" role="alert">
          <div>
            <strong>Reviewer failed</strong>
            <p>{review.agent.error ?? 'The reviewer did not produce a report.'}</p>
          </div>
          <Button variant="ghost" onClick={() => setTab('report')}>
            Open report
          </Button>
        </div>
      ) : null}

      <div className="cr-detail-grid">
        <div className="cr-detail-main">
          <div className="cr-detail-tabs" role="tablist" aria-label="Review sections">
            {TABS.map((item) => {
              const count =
                item.id === 'conversation'
                  ? filteredComments.length
                  : item.id === 'files'
                    ? (snapshot?.files.length ?? 0)
                    : item.id === 'report'
                      ? (report?.findings.length ?? 0)
                      : signals.length;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`review-tab-${item.id}`}
                  className="cr-tab"
                  aria-selected={tab === item.id}
                  aria-controls={`review-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => setTab(item.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                    event.preventDefault();
                    const index = TABS.findIndex((entry) => entry.id === tab);
                    const next =
                      TABS[
                        (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
                      ];
                    if (next !== undefined) setTab(next.id);
                  }}
                >
                  {item.label}
                  <span className="cr-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          <section
            className="cr-tab-panel"
            role="tabpanel"
            id={`review-panel-${tab}`}
            aria-labelledby={`review-tab-${tab}`}
            tabIndex={0}
          >
            <span className="cr-visually-hidden" aria-live="polite">
              {selectedTabLabel} tab
            </span>
            {tab === 'conversation' ? (
              <div className="cr-conversation">
                <div className="cr-section-head">
                  <div>
                    <h2 className="cr-card-title">Conversation</h2>
                    <p className="cr-meta">
                      {filteredComments.length} thread{filteredComments.length === 1 ? '' : 's'}
                      {fixFilter === 'all' ? '' : ` · ${fixFilter.replace('-', ' ')}`}
                    </p>
                  </div>
                  {fixFilter !== 'all' ? (
                    <Button size="small" variant="ghost" onClick={() => setFixFilter('all')}>
                      Clear filter
                    </Button>
                  ) : null}
                </div>
                {filteredComments.length === 0 ? (
                  <EmptyState
                    icon={<span aria-hidden="true">#</span>}
                    title={fixFilter === 'all' ? 'No comments yet' : 'No comments in this group'}
                    description={
                      fixFilter === 'all'
                        ? 'Select a line in Files changed and press c, or click the + next to a diff line.'
                        : 'Switch the fix-status filter to see the other threads.'
                    }
                    action={
                      fixFilter === 'all' ? (
                        <Button variant="secondary" onClick={() => setTab('files')}>
                          Open the diff
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={() => setFixFilter('all')}>
                          Show all threads
                        </Button>
                      )
                    }
                  />
                ) : (
                  <ol className="cr-thread-list" aria-label="Comment threads">
                    {filteredComments.map((comment) => (
                      <li key={comment.id}>
                        <CommentThread
                          comment={comment}
                          active={activeCommentId === comment.id}
                          pending={pendingCommentId === comment.id}
                          onReply={reply}
                          onState={setCommentState}
                          onJump={jumpToComment}
                          onFocus={(item) => setActiveCommentId(item.id)}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}
            {tab === 'files' ? showSnapshot : null}
            {tab === 'report' ? (
              <ReportPanel
                report={report}
                onJump={jumpToLocation}
                onJumpComment={(commentId) => {
                  const comment = review.comments.find((item) => item.id === commentId);
                  if (comment !== undefined) jumpToComment(comment);
                }}
              />
            ) : null}
            {tab === 'signals' ? (
              <SignalsPanel
                signals={signals}
                onJump={(signal) => {
                  if (signal.file !== undefined) jumpTo(signal.file, signal.line);
                }}
              />
            ) : null}
          </section>
        </div>

        <aside className="cr-rail" aria-label="Review context">
          <section className="cr-card cr-rail-card">
            <div className="cr-card-head">
              <span className="cr-card-title">Summary</span>
              {report !== null ? (
                <Badge
                  tone={
                    report.riskLevel === 'critical' || report.riskLevel === 'high'
                      ? 'danger'
                      : 'neutral'
                  }
                >
                  {report.riskLevel}
                </Badge>
              ) : null}
            </div>
            <p className="cr-rail-copy">
              {report?.summary ?? 'The reviewer has not produced a summary for this round yet.'}
            </p>
            <div className="cr-rail-meta">
              <span>{review.comments.length} comments</span>
              <span>{unresolvedComments(review).length} open</span>
              <span>{review.rounds.length} rounds</span>
            </div>
          </section>

          <section className="cr-card cr-rail-card">
            <FixStatusBoard
              counts={counts}
              active={fixFilter}
              onFilter={(filter) => {
                setFixFilter(filter);
                if (filter !== 'all') setTab('conversation');
              }}
              compact
            />
          </section>

          <section className="cr-card cr-rail-card">
            <div className="cr-card-head">
              <span className="cr-card-title">Diff range</span>
            </div>
            <label className="cr-switch-row">
              <input
                type="checkbox"
                checked={effectiveDelta}
                disabled={!canDelta}
                onChange={(event) => setDelta(event.target.checked)}
              />
              <span>
                <strong>Delta only</strong>
                <span className="cr-meta">
                  {selectedRound !== null && selectedRound > 1
                    ? `r${selectedRound} vs r${selectedRound - 1}`
                    : 'Available from round 2'}
                </span>
              </span>
            </label>
          </section>

          <section className="cr-card cr-rail-card">
            <div className="cr-card-head">
              <span className="cr-card-title">Reviewer</span>
              <Badge
                tone={
                  review.agent?.status === 'failed'
                    ? 'danger'
                    : review.agent?.status === 'running'
                      ? 'warning'
                      : review.agent?.status === 'done'
                        ? 'success'
                        : 'neutral'
                }
              >
                {review.agent?.status ?? 'not run'}
              </Badge>
            </div>
            {review.agent?.status === 'running' ? (
              <>
                <p className="cr-meta">
                  Working on round {review.agent.round ?? selectedRound ?? '—'}.
                </p>
                <Button
                  size="small"
                  variant="secondary"
                  loading={cancelPending}
                  onClick={() => void cancelReviewer()}
                >
                  Cancel reviewer
                </Button>
              </>
            ) : review.agent?.status === 'failed' ? (
              <>
                <p className="cr-meta">{review.agent.error ?? 'Reviewer failed.'}</p>
                <p className="cr-meta">
                  In-place retry is not exposed by this daemon version. Create a new round to run
                  the reviewer again after the issue is fixed.
                </p>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={agentRunning}
                  onClick={() => setRefreshOpen(true)}
                >
                  Create a new round
                </Button>
              </>
            ) : report !== null ? (
              <p className="cr-meta">
                {report.findings.length} findings · {report.backend} backend · round {report.round}
              </p>
            ) : (
              <p className="cr-meta">No reviewer report yet.</p>
            )}
          </section>

          <section className="cr-card cr-rail-card">
            <div className="cr-card-head">
              <span className="cr-card-title">Delivery</span>
              <Badge tone={feedback !== null || delivery !== null ? 'info' : 'neutral'}>
                {feedback !== null || delivery !== null ? 'pending' : 'not sent'}
              </Badge>
            </div>
            {feedback !== null ? (
              <>
                <p className="cr-meta">
                  Submitted r{feedback.submission.round} · {feedback.submission.verdict}
                </p>
                <p className="cr-meta">
                  Waiting for the agent session to acknowledge the feedback package.
                </p>
                <div className="cr-inline-actions">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => void copyText(feedback.feedback.markdown, 'Feedback package')}
                  >
                    Copy package
                  </Button>
                  <details className="cr-delivery-details">
                    <summary>Preview</summary>
                    <pre className="cr-code-block">{feedback.feedback.markdown}</pre>
                  </details>
                </div>
              </>
            ) : delivery !== null ? (
              <>
                <p className="cr-meta">
                  Round {delivery.round} · harness {delivery.harness}
                </p>
                <p className="cr-meta">
                  Delivery is queued. The session will be resumed by the bridge.
                </p>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => void copyText(delivery.deliveryKey, 'Delivery key')}
                >
                  Copy delivery key
                </Button>
              </>
            ) : (
              <p className="cr-meta">
                No feedback submitted. Submit a verdict to send unresolved comments back to the
                agent.
              </p>
            )}
          </section>

          <section className="cr-card cr-rail-card cr-shortcut-card">
            <div className="cr-card-head">
              <span className="cr-card-title">Shortcuts</span>
              <button type="button" className="cr-link-button" onClick={() => setHelpOpen(true)}>
                ?
              </button>
            </div>
            <p className="cr-meta">c comment · r resolve · j/k files · [ ] rounds</p>
          </section>
        </aside>
      </div>

      <SubmitDialog
        open={submitOpen}
        review={review}
        submitting={submitting}
        error={submitError}
        onClose={() => {
          if (!submitting) setSubmitOpen(false);
        }}
        onSubmit={(input) => void submitReview(input)}
      />

      <Dialog
        open={refreshOpen}
        title="Re-review this branch"
        description="A new immutable round re-anchors every comment against the current diff."
        onClose={() => {
          if (!refreshing) setRefreshOpen(false);
        }}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRefreshOpen(false)} disabled={refreshing}>
              Cancel
            </Button>
            <Button loading={refreshing} onClick={() => void refreshReview()}>
              Create round
            </Button>
          </>
        }
      >
        <div className="cr-refresh">
          <p>
            This captures a fresh snapshot and re-anchors comments. Outdated quotes stay visible in
            the Outdated group; nothing is deleted.
          </p>
          <p className="cr-meta">
            {agentRunning
              ? 'The reviewer is running; wait for it to finish before creating the next round.'
              : 'Refresh is available when the branch has new commits or the worktree changed.'}
          </p>
          {review.reviewer?.backend === 'none' ? (
            <p className="cr-notice cr-notice-warning">
              This review has no reviewer backend. The new round re-anchors comments but does not
              run an agent.
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={helpOpen}
        title="Keyboard shortcuts"
        description="Shortcuts are disabled while typing and can be turned off with data-shortcuts-off."
        onClose={() => setHelpOpen(false)}
        actions={<Button onClick={() => setHelpOpen(false)}>Close</Button>}
      >
        <dl className="cr-shortcut-list">
          {SHORTCUTS.map(([key, description]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}
