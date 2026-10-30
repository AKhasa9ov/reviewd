import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fold, isFinalReviewReport } from '@dsh-code-review/core/browser';
import type {
  Comment,
  CommentState,
  FileDiff,
  Finding,
  FindingDecision,
  FindingDecisionState,
  ReviewCoverage,
  ReviewEvent,
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
import type { FullFileController } from './FullFileDialog.js';
import { clearDraft, readDraft, writeDraft, type StoredCommentDraft } from './drafts.js';
import { FixStatusBoard } from './FixStatusBoard.js';
import type { FindingDecisionError } from './FindingDecisionControls.js';
import { ReportPanel, type ReportCommentTarget } from './ReportPanel.js';
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
  filesForSnapshot,
  filterComments,
  firstChangedLine,
  fixCounts,
  liveReportFor,
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
  surface: 'diff' | 'full';
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

function coverageLabel(coverage: ReviewCoverage): string {
  const byStatus = coverage.totals.byStatus;
  const reviewed = byStatus['deep-reviewed'] + byStatus['light-reviewed'];
  const counts: Array<[string, number]> = [
    ['pending', byStatus.pending],
    ['deferred', byStatus.deferred],
    ['failed', byStatus.failed],
    ['no-hunks', byStatus['no-hunks']],
    ['skipped', byStatus.skipped],
    ['manifest-only', byStatus['manifest-only']],
  ];
  const parts = [`Reviewed ${reviewed}/${coverage.totals.files} files`];
  for (const [label, count] of counts) {
    if (count > 0) parts.push(`${count} ${label}`);
  }
  if (coverage.incomplete === true) parts.push('manifest incomplete');
  return parts.join(' · ');
}

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
  const restoredDraft = useMemo(() => readDraft(id), [id]);
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
  const [tab, setTab] = useState<ReviewTab>(() => {
    const explicit = new URL(liveLocation, 'http://local').searchParams.get('tab');
    return explicit === null ? 'files' : parseTab(explicit);
  });
  const explicitTabRef = useRef(
    new URL(liveLocation, 'http://local').searchParams.get('tab') !== null,
  );
  const [delta, setDelta] = useState(false);
  const [fixFilter, setFixFilter] = useState<FixFilter>('all');
  const [activeFile, setActiveFile] = useState<string | undefined>(deep.file);
  const [activeLine, setActiveLine] = useState<number | undefined>(deep.line);
  const [activeCommentId, setActiveCommentId] = useState<string | undefined>();
  const [fullFileJump, setFullFileJump] = useState<{
    path: string;
    side: Side;
    line: number;
  } | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(() =>
    restoredDraft === null
      ? null
      : {
          path: restoredDraft.path,
          side: restoredDraft.side,
          lineStart: restoredDraft.lineStart,
          lineEnd: restoredDraft.lineEnd,
          surface: 'diff',
        },
  );
  const [draftSeed, setDraftSeed] = useState<StoredCommentDraft | null>(restoredDraft);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pendingCommentId, setPendingCommentId] = useState<string | undefined>();
  const [decidingFindingId, setDecidingFindingId] = useState<string | undefined>(undefined);
  const [findingDecisionError, setFindingDecisionError] = useState<FindingDecisionError | null>(
    null,
  );
  const [bulkDecisionPending, setBulkDecisionPending] = useState(false);
  const [bulkDecisionError, setBulkDecisionError] = useState<string | null>(null);
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
  const [retryPending, setRetryPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [scrollRestore, setScrollRestore] = useState<number | null>(null);
  const pendingJump = useRef<{ path: string; line?: number; side?: Side } | null>(null);
  const goRef = useRef(0);
  const fullFileControllerRef = useRef<FullFileController | null>(null);

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
  const refreshView = useCallback(async () => {
    try {
      setView(await client.getReview(id));
    } catch {
      reloadReview();
    }
  }, [client, id, reloadReview]);

  useEffect(() => {
    setDraftSeed(restoredDraft);
    if (restoredDraft === null) return;
    setComposer({
      path: restoredDraft.path,
      side: restoredDraft.side,
      lineStart: restoredDraft.lineStart,
      lineEnd: restoredDraft.lineEnd,
      surface: 'diff',
    });
    setSelection({
      path: restoredDraft.path,
      side: restoredDraft.side,
      lineStart: restoredDraft.lineStart,
      lineEnd: restoredDraft.lineEnd,
    });
    setActiveFile(restoredDraft.path);
    setActiveLine(restoredDraft.lineStart);
    setTab('files');
    setBanner('Draft restored from this browser. Post it or cancel to remove it.');
  }, [restoredDraft]);

  useEffect(() => {
    if (draftSeed === null || snapshot === null) return;
    const file = snapshot.files.find((item) => item.path === draftSeed.path);
    const maxLine = file === undefined ? 0 : fileLineCount(file, draftSeed.side);
    if (file === undefined || draftSeed.lineStart < 1 || draftSeed.lineEnd > maxLine) {
      clearDraft(id);
      setDraftSeed(null);
      setComposer(null);
      setSelection(null);
      setBanner('A saved draft no longer fits this round and was discarded.');
    }
  }, [snapshot, draftSeed, id]);

  const persistDraft = useCallback(
    (draft: CommentDraft) => {
      if (composer === null) return;
      if (draft.body.trim() === '' && !draft.suggestionEnabled) {
        clearDraft(id);
        return;
      }
      writeDraft(id, {
        path: composer.path,
        side: composer.side,
        ...draft,
      });
    },
    [composer, id],
  );

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
    const explicit = new URL(liveLocation, 'http://local').searchParams.get('tab');
    if (explicit !== null) {
      explicitTabRef.current = true;
      setTab(parseTab(explicit));
    } else if (explicitTabRef.current) {
      explicitTabRef.current = false;
      setTab('files');
    }
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
    const pending = pendingJump.current;
    const target =
      pending ?? (deep.file !== undefined ? { path: deep.file, line: deep.line } : null);
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
    const side = pending?.side;
    const timer = window.setTimeout(() => {
      const fileNode = document.getElementById(diffFileId(file));
      if (typeof fileNode?.scrollIntoView === 'function')
        fileNode.scrollIntoView({ block: 'start' });
      if (line !== undefined) {
        const row =
          side === undefined
            ? (document.getElementById(diffLineId(file, 'new', line)) ??
              document.getElementById(diffLineId(file, 'old', line)))
            : document.getElementById(diffLineId(file, side, line));
        if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
        if (row === null && side !== undefined) setFullFileJump({ path: file, side, line });
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
  const loadFileDiff = useCallback(
    async (path: string): Promise<FileDiff> => {
      if (selectedRound === null) throw new Error('No snapshot round is selected.');
      const result = await client.getFileDiff(id, selectedRound, path);
      return result.file;
    },
    [client, id, selectedRound],
  );
  const canDelta = selectedRound !== null && selectedRound > 1 && previousSnapshot !== null;
  const deltaHint =
    selectedRound === null
      ? undefined
      : selectedRound > 1
        ? snapshotLoading
          ? 'Loading the previous round…'
          : previousSnapshot === null
            ? 'The previous round snapshot is unavailable.'
            : undefined
        : 'Delta compares this round with the previous one.';
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
  const reportComments = useMemo(
    () =>
      view === null
        ? []
        : view.review.comments.filter((comment) => comment.deletedAt === undefined),
    [view],
  );
  const signals = useMemo(() => (snapshot === null ? [] : deriveSignals(snapshot)), [snapshot]);
  const fileCount = useMemo(
    () => (snapshot === null ? 0 : filesForSnapshot(snapshot).length),
    [snapshot],
  );
  const finalReport = view?.report ?? null;
  const finalReportForRound =
    finalReport !== null && finalReport.round === selectedRound ? finalReport : null;
  const liveReport = useMemo(
    () => (view === null ? null : liveReportFor(view.review.agent, view.review.id, selectedRound)),
    [view?.review.agent, view?.review.id, selectedRound],
  );
  const report = finalReportForRound ?? liveReport?.report ?? null;
  const reportAgentPartial = view?.review.agent?.status === 'partial';
  const reportIsPartial =
    (finalReportForRound === null && liveReport !== null) ||
    (finalReportForRound !== null && reportAgentPartial);
  const readOnly = view?.review.status === 'closed';
  const findingDecisions = useMemo(() => {
    const decisions = new Map<string, FindingDecision>();
    if (finalReportForRound === null) return decisions;
    for (const decision of view?.review.findingDecisions ?? []) {
      if (decision.round === finalReportForRound.round) {
        decisions.set(decision.findingId, decision);
      }
    }
    return decisions;
  }, [view, finalReportForRound]);
  const canDecideFinding =
    !readOnly &&
    finalReportForRound !== null &&
    view !== null &&
    isFinalReviewReport(view.review, finalReportForRound);
  const agentActive =
    view?.review.agent?.status === 'running' || view?.review.agent?.status === 'queued';
  const canRetryReviewer = view?.review.reviewer?.backend === 'worker';
  const scope = snapshot?.scope;
  const liveCursor = useRef<number | null>(null);

  useEffect(() => {
    liveCursor.current = view?.review.version ?? null;
  }, [view]);

  useEffect(() => {
    if (!agentActive || liveCursor.current === null) return;
    const controller = new AbortController();
    let stopped = false;
    let after = liveCursor.current;

    const applyEvents = (current: ReviewView, events: ReviewEvent[]): ReviewView | null => {
      let next = current;
      for (const event of events) {
        if (event.reviewId !== next.review.id) continue;
        if (event.seq !== undefined && event.seq <= next.review.version) continue;
        next = {
          ...next,
          review: fold(next.review, event),
          ...(event.type === 'agent/report' ? { report: event.data.report } : {}),
        };
      }
      return next;
    };

    const run = async (): Promise<void> => {
      while (!stopped) {
        if (liveCursor.current !== null && liveCursor.current > after) {
          after = liveCursor.current;
        }
        try {
          const response = await client.events(id, { after, signal: controller.signal });
          if (stopped) return;
          after = Math.max(after, response.latestSeq);
          if (response.events.length === 0) {
            // A mock or a truncated wait can resolve immediately; never spin
            // the event loop when the cursor has not advanced.
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          let failed = false;
          setView((current) => {
            if (current === null) return current;
            try {
              return applyEvents(current, response.events);
            } catch {
              failed = true;
              return current;
            }
          });
          if (failed) {
            reloadReview();
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    void run();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [agentActive, client, id, reloadReview]);

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
    pendingJump.current = { path, ...(line === undefined ? {} : { line }), side };
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
        if (row === null && tab === 'files') setFullFileJump({ path, side, line });
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

  function onSelectRange(file: FileDiff, side: Side, start: number, end: number): void {
    setActiveFile(file.path);
    setActiveLine(end);
    setSelection({
      path: file.path,
      side,
      lineStart: Math.min(start, end),
      lineEnd: Math.max(start, end),
    });
  }

  function openFinding(finding: Finding): void {
    setTab('report');
    go(buildReviewLocation(id, { ...deep, round: selectedRound ?? undefined }, { tab: 'report' }), {
      replace: false,
    });
    window.setTimeout(() => {
      const node = document.getElementById(`finding-${finding.id}`);
      if (typeof node?.focus === 'function') node.focus({ preventScroll: true });
      if (typeof node?.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'center' });
      }
    }, 0);
  }

  function openComposer(
    file: FileDiff,
    side: Side,
    lineStart: number,
    lineEnd = lineStart,
    surface: 'diff' | 'full' = 'diff',
  ): void {
    clearDraft(id);
    setDraftSeed(null);
    setTab('files');
    setComposer({ path: file.path, side, lineStart, lineEnd, surface });
    setSelection({ path: file.path, side, lineStart, lineEnd });
    setCommentError(null);
    setActiveFile(file.path);
    setActiveLine(lineStart);
  }

  function cancelComposer(): void {
    clearDraft(id);
    setDraftSeed(null);
    setComposer(null);
    setCommentError(null);
  }

  function openComposerAtSelection(): void {
    const fullFileController = fullFileControllerRef.current;
    if (fullFileController !== null) {
      fullFileController.commentAtSelection();
      return;
    }
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
      clearDraft(id);
      setDraftSeed(null);
      setComposer(null);
      setSelection(null);
      setPendingCommentId(result.comment.id);
      setActiveCommentId(result.comment.id);
      toast('Comment posted');
      void refreshView();
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Could not post the comment.');
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function submitReportComment(target: ReportCommentTarget, body: string): Promise<void> {
    try {
      const result = await client.addComment(id, {
        body,
        path: target.file,
        side: 'new',
        lineStart: target.lineStart,
        lineEnd: target.lineEnd,
      });
      setPendingCommentId(result.comment.id);
      setActiveCommentId(result.comment.id);
      toast('Comment posted');
      void refreshView();
    } catch (error) {
      throw error instanceof Error ? error : new Error('Could not post the comment.');
    }
  }

  async function reply(comment: Comment, body: string): Promise<void> {
    setPendingCommentId(comment.id);
    try {
      await client.reply(id, comment.id, body);
      toast('Reply sent');
      void refreshView();
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
      void refreshView();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setPendingCommentId(undefined);
    }
  }

  async function editComment(comment: Comment, body: string): Promise<void> {
    setPendingCommentId(comment.id);
    try {
      await client.editComment(id, comment.id, body);
      toast('Comment updated');
      void refreshView();
    } finally {
      setPendingCommentId(undefined);
    }
  }

  async function deleteComment(comment: Comment): Promise<void> {
    setPendingCommentId(comment.id);
    try {
      await client.deleteComment(id, comment.id);
      toast('Comment deleted');
      void refreshView();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setPendingCommentId(undefined);
    }
  }

  async function deleteReview(): Promise<void> {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await client.deleteReview(id);
      toast('Review deleted');
      setDeleteOpen(false);
      go('/');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the review.');
    } finally {
      setDeletePending(false);
    }
  }

  async function submitFindingDecision(
    finding: Finding,
    state: FindingDecisionState,
    note: string | undefined,
  ): Promise<boolean> {
    if (view === null || finalReportForRound === null) return false;
    setDecidingFindingId(finding.id);
    setFindingDecisionError(null);
    try {
      await client.decideFinding(id, finding.id, {
        state,
        ...(note === undefined || note === '' ? {} : { note }),
      });
      toast(state === 'accepted' ? 'Finding accepted' : 'Finding dismissed');
      reloadReview();
      return true;
    } catch (error) {
      setFindingDecisionError({
        findingId: finding.id,
        message: error instanceof Error ? error.message : 'Could not save the finding decision.',
      });
      return false;
    } finally {
      setDecidingFindingId(undefined);
    }
  }

  async function submitAllFindingDecisions(state: FindingDecisionState): Promise<boolean> {
    if (view === null || finalReportForRound === null) {
      setBulkDecisionError('The report is no longer available.');
      return false;
    }
    setBulkDecisionPending(true);
    setBulkDecisionError(null);
    try {
      const result = await client.decideFindings(id, state);
      const count = result.decisions.length;
      if (count === 0) {
        toast('No findings left to decide');
      } else {
        toast(
          `${state === 'accepted' ? 'Accepted' : 'Dismissed'} ${count} ${
            count === 1 ? 'finding' : 'findings'
          }`,
        );
      }
      reloadReview();
      return true;
    } catch (error) {
      setBulkDecisionError(
        error instanceof Error ? error.message : 'Could not save the finding decisions.',
      );
      // Some decisions may have committed before a later append failed.
      reloadReview();
      return false;
    } finally {
      setBulkDecisionPending(false);
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

  async function retryReviewer(): Promise<void> {
    setRetryPending(true);
    try {
      const next = await client.retryAgent(id);
      setView(next);
      toast('Retrying failed files; completed findings stay in the report');
      reloadReview();
    } catch (error) {
      setActionError(actionErrorFor(error));
    } finally {
      setRetryPending(false);
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
      if (event.key === 'Escape' && helpOpen) {
        // The dialog focuses its first control asynchronously; if focus has not
        // landed yet, the dialog's own Escape handler never sees the key.
        event.preventDefault();
        setHelpOpen(false);
        return;
      }
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
      comments={filteredComments.filter((comment) => comment.deletedAt === undefined)}
      allComments={(view?.review.comments ?? []).filter(
        (comment) => comment.deletedAt === undefined,
      )}
      round={selectedRound ?? 1}
      delta={effectiveDelta}
      canDelta={canDelta}
      deltaHint={deltaHint}
      onRequestNextRound={() => setRefreshOpen(true)}
      changedPaths={changed}
      findings={report !== null ? report.findings : []}
      questions={report !== null ? report.questions : []}
      findingDecisions={finalReportForRound !== null ? findingDecisions : undefined}
      onDecideFinding={canDecideFinding ? submitFindingDecision : undefined}
      decidingFindingId={decidingFindingId}
      findingDecisionError={findingDecisionError}
      activeFile={activeFile}
      activeLine={activeLine}
      activeCommentId={activeCommentId}
      composer={composer?.surface === 'diff' ? composer : null}
      fullFileComposer={composer?.surface === 'full' ? composer : null}
      fullFileJump={fullFileJump}
      onFullFileJumpHandled={() => setFullFileJump(null)}
      fullFileControllerRef={fullFileControllerRef}
      onCancelComposer={cancelComposer}
      onDeltaChange={setDelta}
      onJump={jumpTo}
      onLoadDiff={loadFileDiff}
      onSelectLine={onSelectLine}
      onSelectRange={onSelectRange}
      onOpenComposer={openComposer}
      onOpenFinding={openFinding}
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
            initialDraft={draftSeed ?? undefined}
            onDraftChange={persistDraft}
            onCancel={cancelComposer}
            onSubmit={(draft) => void submitComment(file, side, draft)}
          />
        );
      }}
      onReply={reply}
      onCommentState={setCommentState}
      onCommentJump={jumpToComment}
      onCommentFocus={(comment) => setActiveCommentId(comment.id)}
      onAnswerQuestion={(question, body) =>
        submitReportComment(
          { file: question.file, lineStart: question.line, lineEnd: question.line },
          body,
        )
      }
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
                  aria-label={`base ${shortSha(scope.baseSha)} (copy full commit)`}
                  title={`Copy base commit ${scope.baseSha}`}
                  onClick={() => void copyText(scope.baseSha, 'Base SHA')}
                >
                  base {shortSha(scope.baseSha)}
                </button>
                <span aria-hidden="true">→</span>
                <button
                  type="button"
                  className="cr-link-button"
                  aria-label={`head ${shortSha(scope.headSha)} (copy full commit)`}
                  title={`Copy head commit ${scope.headSha ?? 'worktree'}`}
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
                title={`Round ${item.no}, ${roundCommentCount(review, item.no)} comments`}
                onClick={() => changeRound(item.no)}
              >
                <span>r{item.no}</span>{' '}
                <span className="cr-round-count">{roundCommentCount(review, item.no)}</span>{' '}
                <span className="cr-visually-hidden">
                  Round {item.no}, {roundCommentCount(review, item.no)} comments
                </span>
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
            disabled={readOnly || agentActive}
            title={agentActive ? 'Wait for the reviewer to finish' : undefined}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => go(`/review/${encodeURIComponent(id)}/edit`)}
            disabled={readOnly}
            title={readOnly ? 'Closed reviews cannot be edited' : undefined}
          >
            Edit
          </Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} disabled={deletePending}>
            Delete
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
          <div className="cr-inline-actions">
            {canRetryReviewer ? (
              <Button
                variant="secondary"
                loading={retryPending}
                disabled={readOnly || agentActive}
                onClick={() => void retryReviewer()}
              >
                Retry reviewer
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setTab('report')}>
              Open report
            </Button>
          </div>
        </div>
      ) : null}

      <div className={tab === 'files' ? 'cr-detail-grid cr-detail-grid-wide' : 'cr-detail-grid'}>
        <div className="cr-detail-main">
          <div className="cr-detail-tabs" role="tablist" aria-label="Review sections">
            {TABS.map((item) => {
              const count =
                item.id === 'conversation'
                  ? filteredComments.length
                  : item.id === 'files'
                    ? fileCount
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
                          onEdit={editComment}
                          onDelete={deleteComment}
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
                partial={reportIsPartial}
                liveProgress={
                  liveReport === null
                    ? undefined
                    : {
                        completedShards: liveReport.completedShards,
                        totalShards: liveReport.totalShards,
                      }
                }
                live={agentActive}
                pending={agentActive && report === null}
                decisions={finalReportForRound !== null ? findingDecisions : undefined}
                canDecide={canDecideFinding}
                onDecide={canDecideFinding ? submitFindingDecision : undefined}
                decidingFindingId={decidingFindingId}
                findingDecisionError={findingDecisionError}
                onDecideAll={canDecideFinding ? submitAllFindingDecisions : undefined}
                bulkPending={bulkDecisionPending}
                bulkError={bulkDecisionError}
                onJump={jumpToLocation}
                comments={reportComments}
                round={selectedRound ?? 1}
                readOnly={readOnly}
                activeCommentId={activeCommentId}
                pendingCommentId={pendingCommentId}
                onReply={reply}
                onCommentState={setCommentState}
                onCommentEdit={editComment}
                onCommentDelete={deleteComment}
                onCommentJump={jumpToComment}
                onCommentFocus={(comment) => setActiveCommentId(comment.id)}
                onAddComment={submitReportComment}
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

        {tab === 'files' ? null : (
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
              <p className="cr-rail-copy" tabIndex={0}>
                {report?.summary ?? 'The reviewer has not produced a summary for this round yet.'}
              </p>
              <div className="cr-rail-meta">
                <span>
                  {review.comments.filter((comment) => comment.deletedAt === undefined).length}{' '}
                  comments
                </span>
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
                      : review.agent?.status === 'running' || review.agent?.status === 'partial'
                        ? 'warning'
                        : review.agent?.status === 'done'
                          ? 'success'
                          : 'neutral'
                  }
                >
                  {review.agent?.status ?? 'not run'}
                </Badge>
              </div>
              {review.agent?.coverage !== undefined ? (
                <p className="cr-meta">{coverageLabel(review.agent.coverage)}</p>
              ) : null}
              {review.agent?.status === 'partial' ? (
                <>
                  <p className="cr-notice cr-notice-warning">
                    Coverage is incomplete: the reviewer did not inspect every changed file.
                  </p>
                  {canRetryReviewer ? (
                    <Button
                      size="small"
                      variant="secondary"
                      loading={retryPending}
                      disabled={readOnly || agentActive}
                      onClick={() => void retryReviewer()}
                    >
                      Retry reviewer
                    </Button>
                  ) : null}
                </>
              ) : null}
              {review.agent?.status === 'running' || review.agent?.status === 'queued' ? (
                <>
                  <p className="cr-meta">
                    {review.agent.status === 'queued' ? 'Waiting for a worker' : 'Working'} on round{' '}
                    {review.agent.round ?? selectedRound ?? '—'}.
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
                    {canRetryReviewer
                      ? 'Retry unfinished shards from the alert above, or create a new round.'
                      : 'This reviewer backend cannot be retried in place. Create a new round.'}
                  </p>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={agentActive}
                    onClick={() => setRefreshOpen(true)}
                  >
                    Create a new round
                  </Button>
                </>
              ) : report !== null ? (
                <p className="cr-meta">
                  {report.findings.length} findings · {report.backend} backend · round{' '}
                  {report.round}
                  {reportIsPartial ? ' · partial' : ''}
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
        )}
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
        onJumpComment={(commentId) => {
          const comment = review.comments.find((item) => item.id === commentId);
          if (comment === undefined) return;
          setSubmitOpen(false);
          jumpToComment(comment);
        }}
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
            {agentActive
              ? 'The reviewer is active; wait for it to finish or cancel it before creating the next round.'
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
        open={deleteOpen}
        title="Delete this review?"
        description="The review disappears from the list and its active reviewer is cancelled. Events stay in the audit log."
        onClose={() => {
          if (!deletePending) setDeleteOpen(false);
        }}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deletePending}>
              Cancel
            </Button>
            <Button variant="danger" loading={deletePending} onClick={() => void deleteReview()}>
              Delete review
            </Button>
          </>
        }
      >
        <p>
          Delete <strong>{review.title}</strong> ({review.id})? This removes it from the review
          list, but the append-only event log keeps the audit trail.
        </p>
        {deleteError !== null ? (
          <p className="cr-error" role="alert">
            {deleteError}
          </p>
        ) : null}
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
